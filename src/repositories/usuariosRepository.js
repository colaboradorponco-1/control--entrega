import { supabase } from '../config/supabaseClient';

const EDGE_FUNCTION = 'admin-usuarios';

const llamarEdgeFunction = async (payload) => {
  const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, { body: payload });

  if (error) {
    // functions.invoke no expone el cuerpo del error, asi que se
    // consulta la funcion directamente para conocer la causa real.
    const { data: supabaseConfig } = supabase;
    const url = supabaseConfig?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
    const anon = supabaseConfig?.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (url && anon) {
      try {
        const res = await fetch(`${url}/functions/v1/${EDGE_FUNCTION}`, {
          method: 'POST',
          headers: {
            apikey: anon,
            Authorization: `Bearer ${(await supabase.auth.getSession()).data?.session?.access_token || anon}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const detalle = await res.json().catch(() => null);
        if (detalle?.error) throw new Error(detalle.error);
      } catch (e) {
        if (e instanceof Error && e.message && e.message !== 'Failed to fetch') throw e;
      }
    }
    throw new Error(error.message);
  }

  if (data?.error) throw new Error(data.error);
  return data;
};

export const usuariosRepository = {
  // Listar todos los perfiles con su rol y sucursal
  async listarUsuarios() {
    const { data, error } = await supabase
      .from('perfiles_usuario')
      .select(`
        id,
        usuario_id,
        nombre_completo,
        rol_id,
        sucursal_id,
        creado_en,
        roles ( nombre ),
        sucursales ( nombre, sector )
      `)
      .order('creado_en', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Catálogos para los formularios
  async listarRoles() {
    const { data, error } = await supabase
      .from('roles')
      .select('id, nombre')
      .order('id', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async listarSucursales() {
    const { data, error } = await supabase
      .from('sucursales')
      .select('id, nombre, sector')
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // Buscar una sucursal por nombre dentro de una ruta
  async buscarSucursal(nombre, sector) {
    const { data, error } = await supabase
      .from('sucursales')
      .select('id, nombre, sector')
      .eq('sector', sector)
      .ilike('nombre', nombre.trim());

    if (error) throw error;
    return data?.[0] || null;
  },

  // Crear una sucursal nueva
  async crearSucursal({ nombre, sector }) {
    const { data, error } = await supabase
      .from('sucursales')
      .insert([{ nombre: nombre.trim(), sector }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Resolver la sucursal a partir de lo que escribio el admin.
  // Si ya existe en esa ruta la reutiliza; si no, la crea.
  async resolverSucursal(nombre, sector) {
    const limpio = (nombre || '').trim();
    if (!limpio) return null;

    const existente = await this.buscarSucursal(limpio, sector);
    if (existente) return { ...existente, creada: false };

    const nueva = await this.crearSucursal({ nombre: limpio, sector });
    return { ...nueva, creada: true };
  },

  // Crear usuario (delega en la Edge Function por seguridad)
  async crearUsuario({ email, password, nombre_completo, rol_id, sucursal_id }) {
    return llamarEdgeFunction({
      accion: 'crear',
      email,
      password,
      nombre_completo,
      rol_id: rol_id ? Number(rol_id) : null,
      sucursal_id: sucursal_id ? Number(sucursal_id) : null,
    });
  },

  // Editar perfil (nombre, rol, sucursal)
  async actualizarPerfil(perfilId, { nombre_completo, rol_id, sucursal_id }) {
    const { data, error } = await supabase
      .from('perfiles_usuario')
      .update({
        nombre_completo,
        rol_id: rol_id ? Number(rol_id) : null,
        sucursal_id: sucursal_id ? Number(sucursal_id) : null,
      })
      .eq('id', perfilId)
      .select();

    if (error) throw error;
    return data;
  },

  // Eliminar usuario (requiere Edge Function)
  async eliminarUsuario(usuarioAuthId) {
    return llamarEdgeFunction({ accion: 'eliminar', id: usuarioAuthId });
  },

  // Resetear contraseña (requiere Edge Function)
  async resetearPassword(usuarioAuthId, password) {
    return llamarEdgeFunction({ accion: 'resetear', id: usuarioAuthId, password });
  },
};
