import { supabase } from '../config/supabaseClient';
import { esColumnaFaltante } from './columnaFalta';

export const proveedoresRepository = {
  async listar({ soloActivos = false } = {}) {
    let consulta = supabase
      .from('proveedores')
      .select('id, nombre, activo')
      .order('nombre', { ascending: true });
    if (soloActivos) consulta = consulta.eq('activo', true);

    let { data, error } = await consulta;
    if (error && esColumnaFaltante(error.message)) {
      const respaldo = await supabase
        .from('proveedores')
        .select('id, nombre')
        .order('nombre', { ascending: true });
      data = respaldo.data;
      error = respaldo.error;
      if (!error) data = (data || []).map((proveedor) => ({ ...proveedor, activo: true }));
    }

    if (error) throw error;
    return data || [];
  },

  async crear(nombre) {
    const { data, error } = await supabase
      .from('proveedores')
      .insert({ nombre: nombre.trim(), activo: true })
      .select('id, nombre, activo')
      .single();

    if (error) throw error;
    return data;
  },

  async actualizar(id, nombre) {
    const { data, error } = await supabase
      .from('proveedores')
      .update({ nombre: nombre.trim() })
      .eq('id', id)
      .select('id, nombre, activo')
      .single();

    if (error) throw error;
    return data;
  },

  async cambiarEstado(id, activo) {
    const { data, error } = await supabase
      .from('proveedores')
      .update({ activo })
      .eq('id', id)
      .select('id, nombre, activo')
      .single();

    if (error) throw error;
    return data;
  },

  async eliminar(id) {
    const { error } = await supabase
      .from('proveedores')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};
