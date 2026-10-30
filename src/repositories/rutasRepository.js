import { supabase } from '../config/supabaseClient';

export const rutasRepository = {
  async listarAsignadasA(repartidorId) {
    const { data: rutas, error: rutasError } = await supabase
      .from('rutas')
      .select('id, nombre')
      .eq('repartidor_id', repartidorId)
      .eq('activo', true)
      .order('nombre');
    if (rutasError) throw rutasError;
    if (!rutas?.length) return [];

    const { data: paradas, error: paradasError } = await supabase
      .from('ruta_sucursales')
      .select('ruta_id, sucursal_id, orden')
      .in('ruta_id', rutas.map((ruta) => ruta.id))
      .order('orden');
    if (paradasError) throw paradasError;

    const sucursalIds = [...new Set((paradas || []).map((parada) => parada.sucursal_id))];
    let sucursales = [];
    if (sucursalIds.length) {
      const { data, error } = await supabase
        .from('sucursales')
        .select('id, nombre, sector, latitude, longitude')
        .in('id', sucursalIds);
      if (error) throw error;
      sucursales = data || [];
    }

    const sucursalPorId = new Map(sucursales.map((sucursal) => [sucursal.id, sucursal]));
    return rutas.map((ruta) => ({
      ...ruta,
      sucursales: (paradas || [])
        .filter((parada) => parada.ruta_id === ruta.id)
        .map((parada) => {
          const sucursal = sucursalPorId.get(parada.sucursal_id);
          return sucursal ? { ...sucursal, orden: parada.orden } : null;
        })
        .filter(Boolean),
    }));
  },

  async listar() {
    const [rutasResult, paradasResult, sucursalesResult, rolesResult] = await Promise.all([
      supabase.from('rutas').select('id, nombre, repartidor_id, activo').order('nombre'),
      supabase.from('ruta_sucursales').select('ruta_id, sucursal_id, orden').order('orden'),
      supabase.from('sucursales').select('id, nombre, sector, latitude, longitude').order('nombre'),
      supabase.from('roles').select('id').eq('nombre', 'despachador').maybeSingle(),
    ]);

    for (const result of [rutasResult, paradasResult, sucursalesResult, rolesResult]) {
      if (result.error) throw result.error;
    }

    let repartidores = [];
    if (rolesResult.data) {
      const { data, error } = await supabase
        .from('perfiles_usuario')
        .select('id, nombre_completo')
        .eq('rol_id', rolesResult.data.id)
        .order('nombre_completo');
      if (error) throw error;
      repartidores = data || [];
    }

    const sucursalPorId = new Map((sucursalesResult.data || []).map((s) => [s.id, s]));
    const repartidorPorId = new Map(repartidores.map((r) => [r.id, r]));
    const paradasPorRuta = new Map();

    for (const parada of paradasResult.data || []) {
      const paradas = paradasPorRuta.get(parada.ruta_id) || [];
      const sucursal = sucursalPorId.get(parada.sucursal_id);
      if (sucursal) paradas.push({ ...sucursal, orden: parada.orden });
      paradasPorRuta.set(parada.ruta_id, paradas);
    }

    return {
      rutas: (rutasResult.data || []).map((ruta) => ({
        ...ruta,
        repartidor: repartidorPorId.get(ruta.repartidor_id) || null,
        sucursales: paradasPorRuta.get(ruta.id) || [],
      })),
      sucursales: sucursalesResult.data || [],
      repartidores,
    };
  },

  async guardar({ id, nombre, repartidor_id, sucursal_ids }) {
    const valores = {
      nombre: nombre.trim(),
      repartidor_id: repartidor_id ? Number(repartidor_id) : null,
    };

    const consulta = id
      ? supabase.from('rutas').update(valores).eq('id', id)
      : supabase.from('rutas').insert(valores);
    const { data: ruta, error } = await consulta.select('id').single();
    if (error) throw error;

    const { error: paradasError } = await supabase.rpc('guardar_paradas_ruta', {
      p_ruta_id: ruta.id,
      p_sucursales_ids: sucursal_ids.map(Number),
    });
    if (paradasError) throw paradasError;
  },

  async cambiarEstado(id, activo) {
    const { error } = await supabase.from('rutas').update({ activo }).eq('id', id);
    if (error) throw error;
  },
};
