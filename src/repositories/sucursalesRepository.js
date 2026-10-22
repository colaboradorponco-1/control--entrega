import { supabase } from '../config/supabaseClient';

export const sucursalesRepository = {
  async listar() {
    const { data, error } = await supabase
      .from('sucursales')
      .select('id, nombre, sector, latitude, longitude, map_url')
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

  // Verificar si una sucursal ya esta en uso (evita perder historial)
  //
  // OJO: hay que contar PEDIDOS tambien. public.pedidos.sucursal_id
  // esta con ON DELETE RESTRICT, asi que una sucursal con pedidos no
  // se puede borrar aunque no tenga despachos. Antes no se contaba y
  // el chequeo pasaba, y despues Postgres rechazaba el borrado con un
  // error de foreign key crudo que no explicaba nada.
  //
  // Las otras tablas si se borran en cascada o se vacian solas:
  //   sucursal_duenos  ON DELETE CASCADE
  //   perfiles_usuario ON DELETE SET NULL  (y el usuario es de baja)
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

  async crear({ nombre, sector, latitude, longitude, map_url }) {
    const { data, error } = await supabase
      .from('sucursales')
      .insert([{ nombre, sector, latitude, longitude, map_url }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async actualizar(id, { nombre, sector, latitude, longitude, map_url }) {
    const { data, error } = await supabase
      .from('sucursales')
      .update({ nombre, sector, latitude, longitude, map_url })
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
