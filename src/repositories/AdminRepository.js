import { supabase } from '../config/supabaseClient';

export const adminRepository = {
  // Obtener resumen de recepciones totales
  async obtenerResumenRecepciones() {
    const { data, error } = await supabase
      .from('recepcion_pollo')
      .select(`
        id,
        kilos,
        unidades,
        total_monto,
        fecha,
        proveedores ( nombre )
      `)
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Obtener resumen de despachos totales por sucursal
  async obtenerResumenDespachos() {
    const { data, error } = await supabase
      .from('despacho_pollo')
      .select(`
        id,
        kilos,
        unidades,
        fecha,
        sucursales ( nombre, sector )
      `)
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Obtener inventario actual consolidado de Planta
  async obtenerInventarioPlanta() {
    const { data, error } = await supabase
      .from('control_inventario_diario')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data?.[0] || null;
  }
};