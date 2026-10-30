import { supabase } from '../config/supabaseClient';
import { esColumnaFaltante } from './columnaFalta';

// El resultado se cachea en memoria: StrictMode ejecuta los efectos
// dos veces en desarrollo y varias pantallas preguntan lo mismo. Un
// 'false' no se cachea, porque en cuanto se corre el SQL tiene que
// detectarse sin recargar la pagina.
let cacheDisponible;

export const duenosRepository = {
  // Verificar si el SQL de duenos ya esta aplicado
  async disponible() {
    if (cacheDisponible !== undefined) return cacheDisponible;

    const { error } = await supabase.from('duenos').select('id').limit(1);
    const listo = !error;

    if (listo) cacheDisponible = true;
    return listo;
  },

  // Forget the cache, por si se corrio el SQL con la pagina abierta
  olvidarCache() {
    cacheDisponible = undefined;
  },

  // Traer duenos con la cantidad de sucursales de cada uno.
  // El conteo se hace aparte porque el anidado con count exacto
  // es sensible a las reglas de lectura.
  async listar() {
    const { data, error } = await supabase
      .from('duenos')
      .select('id, nombre, documento, telefono, email, activo, notas')
      .order('nombre', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async listarAsignaciones() {
    const { data, error } = await supabase
      .from('sucursal_duenos')
      .select('dueno_id, sucursal_id');

    if (error) throw error;
    return data || [];
  },

  // Armar los duenos con su lista de sucursales ya resuelta
  async listarConSucursales(sucursales) {
    const [duenos, asignaciones] = await Promise.all([
      this.listar(),
      this.listarAsignaciones(),
    ]);

    const porDueño = {};
    for (const a of asignaciones) {
      if (!porDueño[a.dueno_id]) porDueño[a.dueno_id] = [];
      porDueño[a.dueno_id].push(a.sucursal_id);
    }

    const nombreDe = {};
    for (const s of sucursales) nombreDe[s.id] = s;

    return duenos.map((d) => {
      const ids = porDueño[d.id] || [];
      return {
        ...d,
        sucursal_ids: ids,
        sucursales: ids.map((id) => nombreDe[id]).filter(Boolean),
      };
    });
  },

  // Que sucursales todavia no tienen dueño
  async sucursalesSinDueño(sucursales) {
    const asignaciones = await this.listarAsignaciones();
    const tomadas = new Set(asignaciones.map((a) => a.sucursal_id));
    return sucursales.filter((s) => !tomadas.has(s.id));
  },

  async crear({ nombre, documento, telefono, email, notas }) {
    const { data, error } = await supabase
      .from('duenos')
      .insert([
        {
          nombre: nombre.trim(),
          documento: documento?.trim() || null,
          telefono: telefono?.trim() || null,
          email: email?.trim() || null,
          notas: notas?.trim() || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async actualizar(id, { nombre, documento, telefono, email, activo, notas }) {
    const { data, error } = await supabase
      .from('duenos')
      .update({
        nombre: nombre.trim(),
        documento: documento?.trim() || null,
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        activo,
        notas: notas?.trim() || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Antes de borrar se mira si tiene sucursales asignadas o
  // usuarios apuntando a el, para no dejar nada colgando.
  async contarUsos(id) {
    const [asignaciones, perfiles] = await Promise.all([
      supabase
        .from('sucursal_duenos')
        .select('sucursal_id', { count: 'exact', head: true })
        .eq('dueno_id', id),
      supabase
        .from('perfiles_usuario')
        .select('id', { count: 'exact', head: true })
        .eq('dueno_id', id),
    ]);

    if (asignaciones.error) throw asignaciones.error;
    if (perfiles.error) throw perfiles.error;

    return {
      sucursales: asignaciones.count || 0,
      usuarios: perfiles.count || 0,
    };
  },

  // Quitar todas las sucursales de un dueño. Se hace borrando y
  // reinsertando el puente entero: son pocas filas y es más simple
  // que andar buscando la diferencia.
  async guardarSucursales(duenoId, sucursalIds) {
    const { error: errorBorrar } = await supabase
      .from('sucursal_duenos')
      .delete()
      .eq('dueno_id', duenoId);
    if (errorBorrar) throw errorBorrar;

    if (!sucursalIds?.length) return;

    const { error } = await supabase
      .from('sucursal_duenos')
      .insert(sucursalIds.map((sucursal_id) => ({ dueno_id: duenoId, sucursal_id })));
    if (error) throw error;
  },

  // Dar de baja un dueño sin borrar su historial
  async desactivar(id, activo) {
    const { error } = await supabase
      .from('duenos')
      .update({ activo })
      .eq('id', id);
    if (error) throw error;
  },

  async eliminar(id) {
    const { error } = await supabase.from('duenos').delete().eq('id', id);
    if (error) throw error;
  },

  // Vincular una cuenta de usuario con un dueño. Se usa desde
  // GestionUsuarios cuando el rol es dueno.
  async vincularUsuario(perfilId, duenoId) {
    const { error } = await supabase
      .from('perfiles_usuario')
      .update({ dueno_id: duenoId })
      .eq('id', perfilId);
    if (error) throw error;
  },

  async listarDelUsuario(userId) {
    const { data, error } = await supabase
      .from('perfiles_usuario')
      .select('dueno_id')
      .eq('usuario_id', userId)
      .maybeSingle();

    // Si la columna dueno_id todavia no existe, se devuelve null
    // en vez de romper: el modulo de duenos avisa por separado.
    if (error) {
      if (esColumnaFaltante(error.message)) return null;
      throw error;
    }

    return data?.dueno_id ?? null;
  },
};


