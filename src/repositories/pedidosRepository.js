import { supabase } from '../config/supabaseClient';
import { evidenciasRepository } from './evidenciasRepository';
import { esColumnaFaltante } from './columnaFalta';

// Sin evidencia: para cuando la base todavia no tiene las columnas
// nuevas. No pide nada de pedido_recepciones, asi que nunca puede
// volver a fallar por las fotos.
const CAMPOS_PEDIDO_SIN_EVIDENCIA = `
  id,
  sucursal_id,
  fecha,
  unidades,
  estado,
  observaciones,
  creado_en,
  actualizado_en,
  sucursales ( nombre, sector )
`;

const CAMPOS_PEDIDO_COMPLETO = `
  id,
  sucursal_id,
  fecha,
  unidades,
  kilos_despachados,
  estado,
  observaciones,
  creado_en,
  actualizado_en,
  sucursales ( nombre, sector ),
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
  // Listar pedidos visibles para el usuario (RLS ya filtra por rol)
  async listar({ estados } = {}) {
    const consultar = async (campos) => {
      let query = supabase.from('pedidos').select(campos).order('creado_en', { ascending: false });
      if (estados?.length) query = query.in('estado', estados);
      return query;
    };

    let { data, error } = await consultar(CAMPOS_PEDIDO_COMPLETO);

    // Si la base todavia no tiene alguna columna nueva, se listan los
    // pedidos igual, sin la evidencia. Al correr el SQL aparece sola.
    // PostgREST no siempre dice "column does not exist" cuando el
    // select falla, asi que nos fijamos tambien en el 400.
    if (error && esColumnaFaltante(error.message)) {
      const alternativa = await consultar(CAMPOS_PEDIDO_SIN_EVIDENCIA);
      if (!alternativa.error) {
        data = alternativa.data;
        error = null;
      }
    }

    if (error) throw error;
    return data || [];
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
      entregado_por, observaciones, foto, firma, fotosExtra,
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
      throw new Error('No se pudo subir la evidencia: ' + (err.message || 'revisa tu conexión'));
    }

    const { data, error } = await supabase.rpc('confirmar_recepcion_pedido', {
      p_pedido_id: pedidoId,
      p_unidades_recibidas: Number(unidades_recibidas),
      p_foto_url: rutas.foto ?? null,
      p_firma_url: rutas.firma ?? null,
      p_recibido_por: recibido_por?.trim() || null,
      p_observaciones: observaciones?.trim() || null,
      p_latitude: ubicacion?.latitude ?? null,
      p_longitud: ubicacion?.longitude ?? null,
      p_fotos_extra: rutasExtra,
    });

    if (error) throw error;
    return data;
  },

  // Ver la foto o la firma. Los archivos son privados, asi que
  // la base entrega un enlace que dura unos minutos.
  async verEvidencia(ruta) {
    return evidenciasRepository.url(ruta);
  },
};
