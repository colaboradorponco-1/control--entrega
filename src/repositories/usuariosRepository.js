import { supabase } from '../config/supabaseClient';
import { esColumnaFaltante } from './columnaFalta';

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
        if (detalle?.error) throw crearErrorDeEdge(detalle);
      } catch (e) {
        if (e instanceof Error && e.message && e.message !== 'Failed to fetch') throw e;
      }
    }
    throw new Error(error.message);
  }

  if (data?.error) throw crearErrorDeEdge(data);
  return data;
};

// Arma el Error conservando los campos extra que manda la Edge
// Function. Por ejemplo tiene_historial, que es lo que permite
// ofrecer "desactivar" en vez de un borrado que va a fallar.
const crearErrorDeEdge = (detalle) => {
  const err = new Error(detalle.error);
  if (detalle.tiene_historial) err.tiene_historial = true;
  if (detalle.detalle) err.detalle = detalle.detalle;
  return err;
};

export const usuariosRepository = {
  // Listar todos los perfiles con su rol y sucursal
  async listarUsuarios() {
    const consultar = async (campos) =>
      supabase
        .from('perfiles_usuario')
        .select(campos)
        .order('creado_en', { ascending: false });

    // dueno_id es una columna nueva: si la base todavia no la tiene,
    // se listan los usuarios igual. Sin esto la pantalla de usuarios
    // quedaria en blanco hasta correr supabase/duenos.sql.
    const CON_DUENO = `
        id,
        usuario_id,
        nombre_completo,
        rol_id,
        sucursal_id,
        dueno_id,
        activo,
        creado_en,
        roles ( nombre ),
        sucursales ( nombre, sector ),
        duenos ( nombre )
      `;
    const SIN_DUENO = `
        id,
        usuario_id,
        nombre_completo,
        rol_id,
        sucursal_id,
        dueno_id,
        creado_en,
        roles ( nombre ),
        sucursales ( nombre, sector )
      `;
    // Sin la columna 'activo' todavia (USUARIOS_ACTIVO.sql sin
    // correr). Se listan igual y todos se ven como activos, que es
    // el estado real de la mayoria.
    const SIN_ACTIVO = `
        id,
        usuario_id,
        nombre_completo,
        rol_id,
        sucursal_id,
        dueno_id,
        creado_en,
        roles ( nombre ),
        sucursales ( nombre, sector ),
        duenos ( nombre )
      `;

    let { data, error } = await consultar(CON_DUENO);
    if (error && esColumnaFaltante(error.message)) {
      const alternativa = await consultar(SIN_DUENO);
      if (!alternativa.error) {
        data = alternativa.data;
        error = null;
      }
    }

    // Ni dueno_id ni activo todavia: la version mas simple posible.
    if (error && esColumnaFaltante(error.message)) {
      const alternativa = await consultar(SIN_ACTIVO);
      if (!alternativa.error) {
        data = alternativa.data;
        error = null;
      }
    }

    if (error) throw error;

    // Si vino sin la columna activo, se rellena para que la UI no
    // tenga que preguntar si el campo existe.
    return (data || []).map((u) =>
      u.activo === undefined || u.activo === null ? { ...u, activo: true } : u
    );
  },

  async listarCorreos() {
    const respuesta = await llamarEdgeFunction({ accion: 'listar_correos' });
    return respuesta.usuarios || [];
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
  async crearUsuario({ email, password, nombre_completo, rol_id, sucursal_id, dueno_id }) {
    return llamarEdgeFunction({
      accion: 'crear',
      email,
      password,
      nombre_completo,
      rol_id: rol_id ? Number(rol_id) : null,
      sucursal_id: sucursal_id ? Number(sucursal_id) : null,
      dueno_id: dueno_id ? Number(dueno_id) : null,
    });
  },

  // Editar perfil (nombre, rol, sucursal, dueño)
  async actualizarPerfil(perfilId, { nombre_completo, rol_id, sucursal_id, dueno_id }) {
    const { data, error } = await supabase
      .from('perfiles_usuario')
      .update({
        nombre_completo,
        rol_id: rol_id ? Number(rol_id) : null,
        sucursal_id: sucursal_id ? Number(sucursal_id) : null,
        // Si el rol no es dueno, se limpia el vínculo para que no
        // quede un dueño viejo pegado a un usuario que cambió de rol.
        dueno_id: dueno_id ? Number(dueno_id) : null,
      })
      .eq('id', perfilId)
      .select();

    if (error) throw error;
    return data;
  },

  async actualizarCorreo(usuarioAuthId, email) {
    return llamarEdgeFunction({
      accion: 'actualizar_correo',
      id: usuarioAuthId,
      email: email.trim(),
    });
  },

  // Eliminar usuario (requiere Edge Function)
  // Si el usuario tiene pedidos o despachos registrados, la Edge
  // Function responde con tiene_historial: true y un mensaje que
  // explica que hay que desactivarlo. El error conserva esos
  // campos para que la UI pueda ofrecer esa alternativa.
  async eliminarUsuario(usuarioAuthId) {
    return llamarEdgeFunction({ accion: 'eliminar', id: usuarioAuthId });
  },

  // Desactivar o reactivar usuario (requiere Edge Function).
  // Un usuario desactivado no puede iniciar sesión, pero sus
  // pedidos, despachos y firmas quedan como estaban.
  async cambiarEstadoUsuario(usuarioAuthId, activar) {
    return llamarEdgeFunction({
      accion: activar ? 'reactivar' : 'desactivar',
      id: usuarioAuthId,
    });
  },

  // Resetear contraseña (requiere Edge Function)
  async resetearPassword(usuarioAuthId, password) {
    return llamarEdgeFunction({ accion: 'resetear', id: usuarioAuthId, password });
  },
};
