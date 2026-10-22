import { supabase } from '../config/supabaseClient';

const CAMPOS_BASE =
  'id,tipo,titulo,mensaje,pedido_id,sucursal_id,sucursal_nombre,' +
  'estado_producto,observaciones_entrega,fotos_observaciones,' +
  'origen_nombre,leido,leido_en,creado_en';

// Columnas de calidad: llegan con el aviso de faltantes. Si la base
// todavia no las tiene, la consulta falla y se reintenta con las
// columnas basicas, para que la campana no se rompa.
const CAMPOS_CALIDAD =
  'id,tipo,titulo,mensaje,pedido_id,sucursal_id,sucursal_nombre,' +
  'estado_producto,observaciones_entrega,fotos_observaciones,' +
  'unidades_pedidas,unidades_recibidas,faltantes,recibido_por,' +
  'observaciones_recepcion,foto_url,firma_url,fotos_extra,' +
  'origen_nombre,leido,leido_en,creado_en';

/**
 * Avisos de la administracion.
 *
 * La base guarda cada aviso con un destinatario concreto (el
 * administrador que lo tiene que recibir) y las politicas solo
 * dejan leer al destinatario. Por eso el superadmin no ve los
 * reportes de las sucursales: no esta en la lista de destinatarios.
 */
export const notificacionesRepository = {
  async listar({ limite = 100 } = {}) {
    const pedir = (campos) =>
      supabase
        .from('notificaciones')
        .select(campos)
        .order('creado_en', { ascending: false })
        .limit(limite);

    const { data, error } = await pedir(CAMPOS_CALIDAD);

    if (error) {
      const reintento = await pedir(CAMPOS_BASE);
      if (reintento.error) throw new Error(reintento.error.message);
      return reintento.data || [];
    }

    return data || [];
  },

  async marcarLeida(id) {
    const { error } = await supabase.rpc('marcar_notificacion_leida', { p_id: id });
    if (error) throw new Error(error.message);
  },

  async marcarTodasLeidas() {
    const { error } = await supabase.rpc('marcar_todas_notificaciones_leidas');
    if (error) throw new Error(error.message);
  },
};
