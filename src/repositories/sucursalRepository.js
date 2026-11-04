import { supabase } from '../config/supabaseClient';
import { evidenciasRepository } from './evidenciasRepository';

const CAMPOS_BASICOS = `
        id,
        fecha,
        kilos,
        unidades,
        estado_recepcion,
        observaciones,
        creado_en
      `;

const CAMPOS_EVIDENCIA = `
        recibido_foto_url,
        recibido_firma_url,
        recibido_por_nombre,
        recibido_en,
        fotos_extra_recepcion,
        latitude_recepcion,
        longitude_recepcion
      `;

export const sucursalRepository = {
  // Obtener despachos asignados a la sucursal del usuario
  async obtenerEntregasPorSucursal(sucursalId) {
    const hoy = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('despacho_pollo')
      .select(`${CAMPOS_BASICOS},${CAMPOS_EVIDENCIA}`)
      .eq('sucursal_id', sucursalId)
      .eq('fecha', hoy)
      .order('creado_en', { ascending: false });

    if (!error) return data;

    // Las columnas de evidencia todavia no estan en la base
    // (falta correr ENTREGAS_DIRECTAS_EVIDENCIA.sql). Se reintenta
    // solo con los datos basicos para que la pantalla no se caiga.
    const respaldo = await supabase
      .from('despacho_pollo')
      .select(CAMPOS_BASICOS)
      .eq('sucursal_id', sucursalId)
      .eq('fecha', hoy)
      .order('creado_en', { ascending: false });

    if (respaldo.error) throw respaldo.error;
    return respaldo.data;
  },

  // Confirmar recepcion de la entrega directa dejando comprobante:
  // quien recibio, foto, firma, ubicacion y observaciones.
  // Va por la funcion segura: el UPDATE directo esta bloqueado
  // para que nadie pueda alterar kilos o unidades desde el navegador.
  async confirmarEntrega(despachoId, datos = {}) {
    const { observaciones, recibido_por, foto, firma, ubicacion, fotosExtra } = datos;

    // Primero suben las pruebas, y recien despues se confirma.
    let rutas = {};
    let rutasExtra = [];
    try {
      rutas = await evidenciasRepository.subirVarias({
        foto: foto && { archivo: foto, tipo: 'foto', referencia: `despacho-${despachoId}` },
        firma: firma && { archivo: firma, tipo: 'firma', referencia: `despacho-${despachoId}` },
      });
      rutasExtra = await evidenciasRepository.subirFotosExtra(fotosExtra, `despacho-${despachoId}`);
    } catch (err) {
      throw new Error('No se pudo subir la evidencia: ' + (err.message || 'revisa tu conexión'), { cause: err });
    }

    const { data, error } = await supabase.rpc('confirmar_entrega_despacho', {
      p_despacho_id: despachoId,
      p_observaciones: observaciones?.trim() || null,
      p_foto_url: rutas.foto ?? null,
      p_firma_url: rutas.firma ?? null,
      p_recibido_por: recibido_por?.trim() || null,
      p_latitude: ubicacion?.lat ?? null,
      p_longitud: ubicacion?.longitude ?? null,
      p_fotos_extra: rutasExtra,
    });

    if (error) throw error;
    return data;
  },
};
