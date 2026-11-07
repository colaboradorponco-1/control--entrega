import { supabase } from '../config/supabaseClient';
import { evidenciasRepository } from './evidenciasRepository';
import { esColumnaFaltante } from './columnaFalta';
import { proveedoresRepository } from './proveedoresRepository';

// Si la base todavia no tiene las columnas de evidencia, la pantalla
// de planta no puede quedar en blanco: se listan los lotes igual, sin
// las fotos. Al correr el SQL aparecen solas.
const CAMPOS_RECEPCION_COMPLETO = `
        id,
        numero_recibo,
        fecha,
        creado_en,
        kilos,
        unidades,
        precio_por_kilo,
        total_monto,
        promedio_kilo_unidad,
        observaciones,
        foto_url,
        firma_entrega_url,
        firma_recepcion_url,
        entregado_por_nombre,
        recibido_por_nombre,
        fotos_extra,
        proveedores ( nombre )
      `;

const CAMPOS_RECEPCION_SIN_EVIDENCIA = `
        id,
        numero_recibo,
        fecha,
        creado_en,
        kilos,
        unidades,
        precio_por_kilo,
        total_monto,
        promedio_kilo_unidad,
        observaciones,
        entregado_por_nombre,
        recibido_por_nombre,
        proveedores ( nombre )
      `;

const esTablaArchivoNoInstalada = (error) => (
  ['42P01', 'PGRST205'].includes(error?.code)
  || /does not exist|schema cache/i.test(error?.message || '')
);

export const recepcionRepository = {
  // Obtener lista de proveedores para el selector del formulario
  async obtenerProveedores() {
    return proveedoresRepository.listar({ soloActivos: true });
  },

  // Historial de recepciones, con la evidencia de cada lote
  async obtenerHistorialRecepciones({ soloHoy = false, desde, hasta, archivadas = false } = {}) {
    const consultar = async (campos) => {
      let q = supabase
        .from('recepcion_pollo')
        .select(campos)
        .order('creado_en', { ascending: false });
      if (soloHoy) {
        q = q.eq('fecha', new Date().toISOString().split('T')[0]);
      }
      if (desde) q = q.gte('fecha', desde);
      if (hasta) q = q.lte('fecha', hasta);
      return q;
    };

    let { data, error } = await consultar(CAMPOS_RECEPCION_COMPLETO);

    if (error && esColumnaFaltante(error.message)) {
      const alternativa = await consultar(CAMPOS_RECEPCION_SIN_EVIDENCIA);
      if (!alternativa.error) {
        data = alternativa.data;
        error = null;
      }
    }

    if (error) throw error;
    if (!data?.length) {
      const { error: errorArchivo } = await supabase
        .from('recepciones_planta_archivadas')
        .select('recepcion_id')
        .limit(1);
      if (errorArchivo && !esTablaArchivoNoInstalada(errorArchivo)) throw errorArchivo;
      return { recepciones: [], archivoDisponible: !errorArchivo };
    }

    const { data: archivadasData, error: errorArchivo } = await supabase
      .from('recepciones_planta_archivadas')
      .select('recepcion_id')
      .eq('archivado', true)
      .in('recepcion_id', data.map((recepcion) => recepcion.id));
    if (errorArchivo) {
      if (!esTablaArchivoNoInstalada(errorArchivo)) throw errorArchivo;
      return {
        recepciones: archivadas ? [] : data.map((recepcion) => ({ ...recepcion, archivado: false })),
        archivoDisponible: false,
      };
    }

    const idsArchivados = new Set((archivadasData || []).map((registro) => registro.recepcion_id));
    return {
      recepciones: data
        .filter((recepcion) => idsArchivados.has(recepcion.id) === archivadas)
        .map((recepcion) => ({ ...recepcion, archivado: idsArchivados.has(recepcion.id) })),
      archivoDisponible: true,
    };
  },

  async obtenerRecepciones(opciones = {}) {
    const resultado = await this.obtenerHistorialRecepciones(opciones);
    return resultado.recepciones;
  },

  // Mantenido por compatibilidad con las llamadas viejas
  obtenerRecepcionesDelDia() {
    return this.obtenerRecepciones({ soloHoy: true });
  },

  async cambiarArchivoRecepcion({ recepcionId, archivada }) {
    const { error } = await supabase.rpc('archivar_recepcion_planta', {
      p_recepcion_id: Number(recepcionId),
      p_archivar: archivada,
    });
    if (error) throw error;
  },

  // Registrar la llegada de un lote con foto y las dos firmas.
  // La base no acepta el lote si falta alguna de las tres.
  async registrarLote(datos) {
    const {
      numero_recibo, proveedor_id, kilos, unidades, precio_por_kilo,
      observaciones, foto, firmaEntrega, firmaRecepcion, entregado_por, recibido_por,
      fotosExtra, ubicacion,
    } = datos;

    // Cada archivo sube a una carpeta con el numero de recibo,
    // asi despues se encuentra todo de un lote junto.
    const referencia = `lote-${numero_recibo || 'sin-numero'}-${Date.now()}`;

    let rutas;
    let rutasExtra = [];
    try {
      rutas = await evidenciasRepository.subirVarias({
        foto: foto && { archivo: foto, tipo: 'foto', referencia },
        firmaEntrega: firmaEntrega && { archivo: firmaEntrega, tipo: 'firma-entrega', referencia },
        firmaRecepcion: firmaRecepcion && { archivo: firmaRecepcion, tipo: 'firma-recepcion', referencia },
      });
      rutasExtra = await evidenciasRepository.subirFotosExtra(fotosExtra, referencia);
    } catch (err) {
      throw new Error('No se pudo subir la evidencia: ' + (err.message || 'revisa tu conexión'), { cause: err });
    }

    const parametros = {
      p_numero_recibo: numero_recibo,
      p_proveedor_id: proveedor_id ? Number(proveedor_id) : null,
      p_kilos: Number(kilos),
      p_unidades: Number(unidades),
      p_precio_por_kilo: Number(precio_por_kilo),
      p_foto_url: rutas.foto ?? null,
      p_firma_entrega_url: rutas.firmaEntrega ?? null,
      p_firma_recepcion_url: rutas.firmaRecepcion ?? null,
      p_entregado_por: entregado_por?.trim() || null,
      p_observaciones: observaciones?.trim() || null,
      p_recibido_por: recibido_por?.trim() || null,
      p_fotos_extra: rutasExtra,
      p_latitude: ubicacion?.lat ?? null,
      p_longitud: ubicacion?.longitude ?? null,
    };
    const { data, error } = await supabase.rpc('registrar_lote_proveedor', parametros);

    if (error) throw error;
    return data;
  },

  // Ver la foto o una de las firmas del lote
  verEvidencia(ruta) {
    return evidenciasRepository.url(ruta);
  },
};
