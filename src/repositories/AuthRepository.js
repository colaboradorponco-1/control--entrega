import { supabase } from '../config/supabaseClient';

export const authRepository = {
  // 1. Iniciar sesión con email y contraseña
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  },

  // 2. Obtener perfil de usuario sin consultas anidadas
  async obtenerPerfilUsuario(userId) {
    // Paso A: Obtener fila de perfiles_usuario
    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles_usuario')
      .select('id, nombre_completo, sucursal_id, rol_id')
      .eq('usuario_id', userId)
      .maybeSingle();

    if (perfilError) throw perfilError;

    // Sin perfil: NOUME PERFIL es un rol sin permisos (fail closed)
    if (!perfil) {
      return {
        id: null,
        nombre_completo: 'Usuario sin perfil',
        sucursal_id: null,
        roles: { nombre: 'sin_perfil' },
        sucursales: null,
      };
    }

    // Paso B: Obtener el nombre del rol por separado
    let nombreRol = 'sin_perfil';
    if (perfil.rol_id) {
      const { data: rolData } = await supabase
        .from('roles')
        .select('nombre')
        .eq('id', perfil.rol_id)
        .maybeSingle();

      if (rolData && rolData.nombre) {
        nombreRol = rolData.nombre;
      }
    }

    // Paso C: Obtener sucursal si existe
    let nombreSucursal = null;
    if (perfil.sucursal_id) {
      const { data: sucursalData } = await supabase
        .from('sucursales')
        .select('nombre')
        .eq('id', perfil.sucursal_id)
        .maybeSingle();

      if (sucursalData) {
        nombreSucursal = sucursalData.nombre;
      }
    }

    // Retornar la estructura que tu AuthContext espera
    return {
      id: perfil.id,
      nombre_completo: perfil.nombre_completo || 'Usuario',
      sucursal_id: perfil.sucursal_id,
      roles: { nombre: nombreRol },
      sucursales: nombreSucursal ? { nombre: nombreSucursal } : null,
    };
  },

  // 3. Cerrar sesión
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
};