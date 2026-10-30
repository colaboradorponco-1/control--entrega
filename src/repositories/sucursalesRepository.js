import { supabase } from '../config/supabaseClient';

export const sucursalesRepository = {
  async listar() {
    const { data, error } = await supabase
      .from('sucursales')
      .select('id, nombre, sector, latitude, longitude, map_url, stock_minimo')
      .order('sector', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async listarSectores() {
    const { data, error } = await supabase
      .from('sucursales')
      .select('sector')
      .order('sector', { ascending: true });

    if (error) throw error;

    return [...new Set((data || []).map((s) => s.sector).filter(Boolean))];
  },

  async contarUsos(id) {
    const [despachos, pedidos, perfiles] = await Promise.all([
      supabase
        .from('despacho_pollo')
        .select('id', { count: 'exact', head: true })
        .eq('sucursal_id', id),
      supabase
        .from('pedidos')
        .select('id', { count: 'exact', head: true })
        .eq('sucursal_id', id),
      supabase
        .from('perfiles_usuario')
        .select('id', { count: 'exact', head: true })
        .eq('sucursal_id', id),
    ]);

    if (despachos.error) throw despachos.error;
    if (pedidos.error) throw pedidos.error;
    if (perfiles.error) throw perfiles.error;

    return {
      despachos: despachos.count || 0,
      pedidos: pedidos.count || 0,
      usuarios: perfiles.count || 0,
    };
  },

  async crear({ nombre, sector, latitude, longitude, map_url, stock_minimo }) {
    const { data, error } = await supabase
      .from('sucursales')
      .insert([{ nombre, sector, latitude, longitude, map_url, stock_minimo }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async actualizar(id, { nombre, sector, latitude, longitude, map_url, stock_minimo }) {
    const { data, error } = await supabase
      .from('sucursales')
      .update({ nombre, sector, latitude, longitude, map_url, stock_minimo })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async eliminar(id) {
    const { error } = await supabase.from('sucursales').delete().eq('id', id);
    if (error) throw error;
  },
};
