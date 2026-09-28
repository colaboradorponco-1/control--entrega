import { supabase } from '../config/supabaseClient';

export const sucursalRepository = {
  // Obtener despachos asignados a la sucursal del usuario
  async obtenerEntregasPorSucursal(sucursalId) {
    const hoy = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('despacho_pollo')
      .select(`
        id,
        fecha,
        kilos,
        unidades,
        estado_recepcion,
        creado_en
      `)
      .eq('sucursal_id', sucursalId)
      .eq('fecha', hoy)
      .order('creado_en', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Confirmar recepción de pedido en sucursal.
  // Va por la funcion segura: el UPDATE directo esta bloqueado
  // para que nadie pueda alterar kilos o unidades desde el navegador.
  async confirmarEntrega(despachoId, observaciones) {
    const { data, error } = await supabase.rpc('confirmar_entrega_despacho', {
      p_despacho_id: despachoId,
      p_observaciones: observaciones || null,
    });

    if (error) throw error;
    return data;
  }
};
