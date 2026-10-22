import { supabase } from '../config/supabaseClient';
import { esColumnaFaltante } from './columnaFalta';

// Usuario sin perfil: un rol sin permisos (fail closed).
const sinPerfil = () => ({
  id: null,
  nombre_completo: 'Usuario sin perfil',
  sucursal_id: null,
  roles: { nombre: 'sin_perfil' },
  sucursales: null,
  activo: true,
});

const armarPerfil = async (perfil) => {
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

  return {
    id: perfil.id,
    nombre_completo: perfil.nombre_completo || 'Usuario',
    sucursal_id: perfil.sucursal_id,
    roles: { nombre: nombreRol },
    sucursales: nombreSucursal ? { nombre: nombreSucursal } : null,
    // Si la columna 'activo' todavia no existe, el respaldo de
    // arriba la pone en true, para no dejar a nadie afuera por error.
    activo: perfil.activo !== false,
  };
};

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
    // Se pide 'activo' para bloquear el ingreso de los usuarios
    // desactivados. Si la columna todavia no existe (migracion
    // USUARIOS_ACTIVO.sql sin correr), se sigue leyendo el resto
    // en vez de romper el login de todo el mundo.
    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles_usuario')
      .select('id, nombre_completo, sucursal_id, rol_id, activo')
      .eq('usuario_id', userId)
      .maybeSingle();

    if (perfilError) {
      // Se reintenta SIN la columna nueva, en vez de romper. Si aca
      // no se captura el error, el login deja de funcionar para
      // todos: cada usuario entraria como "sin perfil".
      if (!esColumnaFaltante(perfilError.message || '')) throw perfilError;

      const { data: respaldo, error: errorRespaldo } = await supabase
        .from('perfiles_usuario')
        .select('id, nombre_completo, sucursal_id, rol_id')
        .eq('usuario_id', userId)
        .maybeSingle();

      if (errorRespaldo) throw errorRespaldo;
      if (!respaldo) return sinPerfil();

      return armarPerfil({ ...respaldo, activo: true });
    }

    // Sin perfil: NOUME PERFIL es un rol sin permisos (fail closed)
    if (!perfil) return sinPerfil();

    return armarPerfil(perfil);
  },

  // 3. Cerrar sesión
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // 4. Enviar el correo de recuperacion. Supabase responde OK tanto si
  // el correo existe como si no, y eso es a proposito: si devolviéramos
  // un error, alguien podria saber que emails estan dados de alta.
  async solicitarRecuperacion(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nueva-contrasena`,
    });
    if (error) throw error;
    return true;
  },

  // 5. Guardar la contraseña nueva una vez que el usuario entró con el
  // enlace del correo.
  async actualizarPassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return true;
  },

  // 6. Reenviar el correo de recuperación, por si el primero se perdió.
  async reenviarRecuperacion() {
    const { data } = await supabase.auth.getUser();
    if (!data?.user?.email) throw new Error('No hay una sesión activa para reenviar el correo.');
    return this.solicitarRecuperacion(data.user.email);
  },
};