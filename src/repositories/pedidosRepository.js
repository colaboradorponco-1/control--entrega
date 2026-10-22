import { supabase } from '../config/supabaseClient';
import { evidenciasRepository } from './evidenciasRepository';
import { esColumnaFaltante } from './columnaFalta';

const CAMPOS_PEDIDO_BASE = `
  id,
  sucursal_id,
  fecha,
  unidades,
  estado,
  observaciones,
  creado_en,
  actualizado_en,
  sucursales ( nombre, sector, latitude, longitude )
`;

const CAMPOS_PEDIDO_SIN_EVIDENCIA = `
  ${CAMPOS_PEDIDO_BASE},
  kilos_despachados,
  motivo_rechazo,
  archivado,
  archivado_en
`;

const CAMPOS_PEDIDO_SIN_ARCHIVO = `
  ${CAMPOS_PEDIDO_BASE},
  kilos_despachados,
  motivo_rechazo,
  pedido_recepciones (
    unidades_recibidas,
    faltantes,
    observaciones,
    recibido_por_nombre,
    recibido_en,
    foto_url,
    firma_url,
    fotos_extra
  )
`;

const CAMPOS_PEDIDO_COMPLETO = `
  ${CAMPOS_PEDIDO_BASE},
  kilos_despachados,
  motivo_rechazo,
  archivado,
  archivado_en,
  pedido_recepciones (
    unidades_recibidas,
    faltantes,
    observaciones,
    recibido_por_nombre,
    recibido_en,
    foto_url,
    firma_url,
    fotos_extra
  )
`;

export const pedidosRepository = {
  async guardarUbicacionRepartidor({ pedidoId, despachadorId, latitude, longitude, precisionM }) {
    const { error } = await supabase
      .from('seguimiento_pedidos')
      .upsert({
        pedido_id: pedidoId,
        despachador_id: despachadorId,
        latitude,
        longitude,
        precision_m: precisionM,
      }, { onConflict: 'pedido_id' });
    if (error) throw error;
  },
  async listar({ estados } = {}) {
    const consultar = async (campos) => {
      let query = supabase.from('pedidos').select(campos).order('creado_en', { ascending: false });
      if (estados?.length) query = query.in('estado', estados);
      return query;
    };

    // Si la base todavia no tiene las columnas nuevas se reintenta
    // sin ellas, para que la pantalla no quede en blanco mientras se
    // corre el SQL de archivado o de reportes.
    let { data, error } = await consultar(CAMPOS_PEDIDO_COMPLETO);
    if (error && esColumnaFaltante(error.message)) {
      const sinArchivo = await consultar(CAMPOS_PEDIDO_SIN_ARCHIVO);
      if (!sinArchivo.error) {
        data = sinArchivo.data;
        error = null;
      }
    }
    if (error && esColumnaFaltante(error.message)) {
      const sinEvidencia = await consultar(CAMPOS_PEDIDO_SIN_EVIDENCIA);
      if (!sinEvidencia.error) {
        data = sinEvidencia.data;
        error = null;
      }
    }
    if (error && esColumnaFaltante(error.message)) {
      const base = await consultar(CAMPOS_PEDIDO_BASE);
      if (!base.error) {
        data = base.data;
        error = null;
      }
    }

    if (error) throw error;

    const pedidos = data || [];
    if (!pedidos.length) return pedidos;

    const { data: historial, error: historialError } = await supabase
      .from('pedido_estado_historial')
      .select('id, pedido_id, estado, cambiado_en, cambiado_por_nombre')
      .in('pedido_id', pedidos.map((pedido) => pedido.id))
      .order('cambiado_en', { ascending: true });

    if (historialError) {
      throw new Error(`No se pudo cargar el historial de pedidos: ${historialError.message}`);
    }

    const historialPorPedido = new Map();
    for (const evento of historial || []) {
      const eventos = historialPorPedido.get(evento.pedido_id) || [];
      eventos.push(evento);
      historialPorPedido.set(evento.pedido_id, eventos);
    }

    // El reporte de entrega vive en su propia tabla y tiene RLS: el
    // superadmin no lo ve aunque pida el pedido. Si el SQL todavia no
    // se corrio, la lista sigue funcionando sin el reporte.
    const { data: reportes } = await supabase
      .from('pedido_reportes_entrega')
      .select('pedido_id, observaciones, estado_producto, fotos, enviado_en')
      .in('pedido_id', pedidos.map((pedido) => pedido.id));

    const reportesPorPedido = new Map();
    for (const reporte of reportes || []) {
      reportesPorPedido.set(reporte.pedido_id, {
        observaciones_entrega: reporte.observaciones,
        estado_producto: reporte.estado_producto,
        fotos_observaciones: reporte.fotos || [],
        observaciones_entrega_en: reporte.enviado_en,
      });
    }

    return pedidos.map((pedido) => ({
      ...pedido,
      historial_estado: historialPorPedido.get(pedido.id) || [],
      reporte_entrega: reportesPorPedido.get(pedido.id) || null,
    }));
  },

  async obtenerDisponibilidadPedidosPlanta() {
    const { data, error } = await supabase.rpc('obtener_disponibilidad_pedidos_planta');
    if (error) throw error;
    return data?.[0] || {
      unidades_stock: 0,
      unidades_reservadas: 0,
      unidades_disponibles: 0,
      kilos_stock: 0,
    };
  },

  async listarSucursalesParaPedidoDueno() {
    const { data, error } = await supabase.rpc('listar_sucursales_pedido_dueno');
    if (error) throw error;
    return data || [];
  },

  async crearParaDueno({ sucursalId, unidades, fecha, observaciones }) {
    const sucursalIdNumerico = Number(sucursalId);
    const unidadesNumericas = Number(unidades);
    if (!Number.isInteger(sucursalIdNumerico) || sucursalIdNumerico <= 0) {
      throw new Error('Selecciona una sucursal válida para el pedido.');
    }
    if (!Number.isInteger(unidadesNumericas) || unidadesNumericas <= 0) {
      throw new Error('Las unidades deben ser un número entero mayor que cero.');
    }

    const { data, error } = await supabase.rpc('crear_pedido_dueno', {
      p_sucursal_id: sucursalIdNumerico,
      p_unidades: unidadesNumericas,
      p_fecha: fecha,
      p_observaciones: observaciones?.trim() || null,
    });
    if (error) throw error;
    return data;
  },

  // Reporte de entrega que manda la sucursal. Las fotos se suben con el
  // prefijo que exige la base: pedido-<id>/observaciones/.
  async enviarObservacionesEntrega(pedidoId, datos = {}) {
    const { observaciones, estadoProducto, fotos } = typeof datos === 'string'
      ? { observaciones: datos }
      : datos;

    const rutas = await evidenciasRepository.subirFotosExtra(
      fotos,
      `pedido-${pedidoId}/observaciones`
    );

    const { data, error } = await supabase.rpc('enviar_observaciones_entrega_pedido', {
      p_pedido_id: pedidoId,
      p_observaciones: observaciones?.trim() || null,
      p_estado_producto: estadoProducto || null,
      p_fotos: rutas,
    });
    if (error) throw error;
    return data;
  },

  async rechazar(pedidoId, motivo) {
    const { data, error } = await supabase.rpc('rechazar_pedido', {
      p_pedido_id: pedidoId,
      p_motivo: motivo?.trim(),
    });
    if (error) throw error;
    return data;
  },

  // Crear un pedido desde la sucursal. Solo unidades.
  // La sucursal y el autor los completa la base de datos; no se envian.
  async crear({ unidades, fecha, observaciones }) {
    const { data, error } = await supabase
      .from('pedidos')
      .insert([
        {
          unidades: Number(unidades),
          fecha: fecha || new Date().toISOString().split('T')[0],
          observaciones: observaciones?.trim() || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Registrar la salida del pollo hacia la sucursal.
  // Peso, precio, con quien va, foto y firma: si falta algo, la
  // base no deja cerrar la carga.
  async despachar(pedidoId, datos) {
    const {
      unidades, kilos, precio_por_kilo, transportista,
      entregado_por, observaciones, foto, firma, fotosExtra, ubicacion,
    } = datos;

    const rutas = await evidenciasRepository.subirVarias({
      foto: foto && { archivo: foto, tipo: 'foto', referencia: `pedido-${pedidoId}` },
      firma: firma && { archivo: firma, tipo: 'firma', referencia: `pedido-${pedidoId}` },
    });

    const rutasExtra = await evidenciasRepository.subirFotosExtra(fotosExtra, `pedido-${pedidoId}`);

    const { data, error } = await supabase.rpc('despachar_pedido', {
      p_pedido_id: pedidoId,
      p_unidades: Number(unidades),
      p_kilos: Number(kilos),
      p_precio_por_kilo: Number(precio_por_kilo),
      p_transportista: transportista?.trim() || null,
      p_foto_url: rutas.foto ?? null,
      p_firma_url: rutas.firma ?? null,
      p_entregado_por: entregado_por?.trim() || null,
      p_observaciones: observaciones?.trim() || null,
      p_fotos_extra: rutasExtra,
      p_latitude: ubicacion?.lat ?? null,
      p_longitud: ubicacion?.longitude ?? null,
    });

    if (error) throw error;
    return data;
  },

  // Avanzar el estado del pedido (planta / despachador / admin)
  async actualizarEstado(id, estado) {
    const { data, error } = await supabase
      .from('pedidos')
      .update({ estado })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Cancelar un pedido
  async cancelar(id) {
    return this.actualizarEstado(id, 'CANCELADO');
  },

  // Recibir el pedido dejando comprobante: quien recibio, cuantas
  // unidades, foto y firma. Sin foto o sin firma no se puede cerrar.
  async confirmarRecepcion(pedidoId, datos) {
    const { unidades_recibidas, observaciones, recibido_por, foto, firma, ubicacion, fotosExtra } = datos;

    // Primero suben las pruebas, y recien despues se confirma.
    // Si el confirmarse falla, quedan huerfanas pero el pedido
    // sigue abierto, que es lo importante.
    let rutas;
    let rutasExtra = [];
    try {
      rutas = await evidenciasRepository.subirVarias({
        foto: foto && { archivo: foto, tipo: 'foto', referencia: `pedido-${pedidoId}` },
        firma: firma && { archivo: firma, tipo: 'firma', referencia: `pedido-${pedidoId}` },
      });
      rutasExtra = await evidenciasRepository.subirFotosExtra(fotosExtra, `pedido-${pedidoId}`);
    } catch (err) {
      throw new Error('No se pudo subir la evidencia: ' + (err.message || 'revisa tu conexión'), { cause: err });
    }

    const { data, error } = await supabase.rpc('confirmar_recepcion_pedido', {
      p_pedido_id: pedidoId,
      p_unidades_recibidas: Number(unidades_recibidas),
      p_foto_url: rutas.foto ?? null,
      p_firma_url: rutas.firma ?? null,
      p_recibido_por: recibido_por?.trim() || null,
      p_observaciones: observaciones?.trim() || null,
      p_latitude: ubicacion?.lat ?? null,
      p_longitud: ubicacion?.longitude ?? null,
      p_fotos_extra: rutasExtra,
    });

    if (error) throw error;
    return data;
  },

  // Archivar quita el pedido del historial sin borrarlo. Con
  // archivado=false vuelve al historial.
  async archivar(pedidoId, archivado = true) {
    const { data, error } = await supabase
      .from('pedidos')
      .update({
        archivado,
        archivado_en: archivado ? new Date().toISOString() : null,
      })
      .eq('id', pedidoId)
      .select('id, archivado, archivado_en')
      .single();

    if (error) throw error;
    return data;
  },

  // Borrar definitivamente un pedido archivado. La base solo deja
  // borrar los que estan archivados (ver ARCHIVAR_PEDIDOS_SUCURSAL.sql).
  async eliminarArchivado(pedidoId) {
    const { error } = await supabase
      .from('pedidos')
      .delete()
      .eq('id', pedidoId)
      .eq('archivado', true);

    if (error) throw error;
  },

  // Ver la foto o la firma. Los archivos son privados, asi que
  // la base entrega un enlace que dura unos minutos.
  async verEvidencia(ruta) {
    return evidenciasRepository.url(ruta);
  },
};
