import { supabase } from '../config/supabaseClient';

export const sucursalesRepository = {
  // Listar todas las sucursales agrupadas por ruta
  async listar() {
    const { data, error } = await supabase
      .from('sucursales')
      .select('id, nombre, sector')
      .order('sector', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Obtener las rutas existentes leidas de la base
  async listarSectores() {
    const { data, error } = await supabase
      .from('sucursales')
      .select('sector')
      .order('sector', { ascending: true });

    if (error) throw error;

    return [...new Set((data || []).map((s) => s.sector).filter(Boolean))];
  },

  // Verificar si una sucursal ya esta en uso (evita perder historial)
  async contarUsos(id) {
    const [despachos, perfiles] = await Promise.all([
      supabase
        .from('despacho_pollo')
        .select('id', { count: 'exact', head: true })
        .eq('sucursal_id', id),
      supabase
        .from('perfiles_usuario')
        .select('id', { count: 'exact', head: true })
        .eq('sucursal_id', id),
    ]);

    if (despachos.error) throw despachos.error;
    if (perfiles.error) throw perfiles.error;

    return {
      despachos: despachos.count || 0,
      usuarios: perfiles.count || 0,
    };
  },

  async crear({ nombre, sector }) {
    const { data, error } = await supabase
      .from('sucursales')
      .insert([{ nombre, sector }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async actualizar(id, { nombre, sector }) {
    const { data, error } = await supabase
      .from('sucursales')
      .update({ nombre, sector })
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
