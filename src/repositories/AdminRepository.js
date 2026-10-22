import { supabase } from '../config/supabaseClient';
import { esColumnaFaltante } from './columnaFalta';

export const adminRepository = {
  /**
   * Todos los puntos que marcaron los formularios, para el mapa
   * general del administrador.
   *
   * va aparte de los resumenes a proposito: las columnas de
   * ubicacion las agrega MAPA_UBICACION.sql. Si todavia no se corrio,
   * la consulta falla, pero solo cae el mapa. Los resumenes de
   * kilos y unidades, que son lo importante, no se tocan.
   *
   * si las columnas faltan, devuelve lista vacia en vez de tirar
   * error, asi el dashboard no se rompe.
   */
  async obtenerPuntosMapa({ limite = 400 } = {}) {
    const pedir = async () => {
      // el limite es por seguridad, para no traer diez mil filas.
      // se ordena por fecha para que, cuando se corte, se corten los
      // mas viejos y no los que se acaba de registrar.
      const [recep, desp, entre] = await Promise.all([
        supabase
          .from('recepcion_pollo')
          .select('id, fecha, kilos, unidades, numero_recibo, proveedor_id, latitude, longitude')
          .order('fecha', { ascending: false })
          .limit(limite),
        supabase
          .from('despacho_pollo')
          .select('id, fecha, kilos, unidades, transportista, estado_recepcion, sucursal_id, latitude, longitude')
          .order('fecha', { ascending: false })
          .limit(limite),
        supabase
          .from('pedido_recepciones')
          .select('id, pedido_id, recibido_en, unidades_recibidas, faltantes, latitude, longitud')
          .order('recibido_en', { ascending: false })
          .limit(limite),
      ]);

      const errores = [recep.error, desp.error, entre.error].filter(Boolean);
      if (errores.length) throw errores[0];

      const entregas = entre.data || [];
      const pedidoIds = [...new Set(entregas.map((entrega) => entrega.pedido_id).filter(Boolean))];
      let pedidos = [];
      if (pedidoIds.length) {
        const { data, error } = await supabase
          .from('pedidos')
          .select('id, sucursal_id')
          .in('id', pedidoIds);
        if (error) throw error;
        pedidos = data || [];
      }

      const proveedorIds = [...new Set((recep.data || []).map((item) => item.proveedor_id).filter(Boolean))];
      const sucursalIds = [...new Set([
        ...(desp.data || []).map((item) => item.sucursal_id),
        ...pedidos.map((pedido) => pedido.sucursal_id),
      ].filter(Boolean))];
      const [proveedoresResult, sucursalesResult] = await Promise.all([
        proveedorIds.length
          ? supabase.from('proveedores').select('id, nombre').in('id', proveedorIds)
          : Promise.resolve({ data: [], error: null }),
        sucursalIds.length
          ? supabase.from('sucursales').select('id, nombre, sector').in('id', sucursalIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (proveedoresResult.error) throw proveedoresResult.error;
      if (sucursalesResult.error) throw sucursalesResult.error;

      const pedidoPorId = new Map((pedidos || []).map((pedido) => [pedido.id, pedido]));
      const proveedorPorId = new Map((proveedoresResult.data || []).map((proveedor) => [proveedor.id, proveedor]));
      const sucursalPorId = new Map((sucursalesResult.data || []).map((sucursal) => [sucursal.id, sucursal]));

      return {
        recep: (recep.data || []).map((item) => ({
          ...item,
          proveedores: proveedorPorId.get(item.proveedor_id) || null,
        })),
        desp: (desp.data || []).map((item) => ({
          ...item,
          sucursales: sucursalPorId.get(item.sucursal_id) || null,
        })),
        entre: entregas.map((entrega) => {
          const pedido = pedidoPorId.get(entrega.pedido_id);
          return {
            ...entrega,
            fecha: entrega.recibido_en,
            sucursales: pedido ? sucursalPorId.get(pedido.sucursal_id) || null : null,
          };
        }),
      };
    };

    const limpio = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
    const numero = (v) => (v === null || v === undefined ? '' : String(v));

    let datos;
    try {
      datos = await pedir();
    } catch (err) {
      if (esColumnaFaltante(err.message)) {
        throw new Error(
          `Faltan columnas de ubicación en Supabase. Ejecuta supabase/AGREGAR_COLUMNAS_GPS_MAPA.sql. Detalle: ${err.message}`,
          { cause: err }
        );
      }
      throw err;
    }

    const puntos = [];

    datos.recep.forEach((r) => {
      const lat = limpio(r.latitude);
      const lng = limpio(r.longitude);
      if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return;
      puntos.push({
        id: `r-${r.id}`,
        tipo: 'recepcion',
        lat,
        lng,
        fecha: numero(r.fecha),
        titulo: r.proveedores?.nombre || `Lote ${numero(r.numero_recibo)}`,
        detalle: `${numero(r.kilos)} kg - ${numero(r.unidades)} und`,
      });
    });

    datos.desp.forEach((d) => {
      const lat = limpio(d.latitude);
      const lng = limpio(d.longitude);
      if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return;
      puntos.push({
        id: `d-${d.id}`,
        tipo: 'despacho',
        lat,
        lng,
        fecha: numero(d.fecha),
        titulo: d.sucursales?.nombre || 'Despacho',
        detalle: [numero(d.kilos) + ' kg', d.transportista, d.estado_recepcion]
          .filter(Boolean)
          .join(' - '),
      });
    });

    datos.entre.forEach((e) => {
      const lat = limpio(e.latitude);
      const lng = limpio(e.longitud);
      if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return;
      puntos.push({
        id: `e-${e.id}`,
        tipo: 'entrega',
        lat,
        lng,
        fecha: numero(e.fecha),
        titulo: e.sucursales?.nombre || 'Entrega',
        detalle: `Recibido ${numero(e.unidades_recibidas)} und${e.faltantes ? ' - con faltantes' : ''}`,
      });
    });

    return puntos;
  },
  // Obtener resumen de recepciones totales
  async obtenerResumenRecepciones() {
    const { data, error } = await supabase
      .from('recepcion_pollo')
      .select(`
        id,
        kilos,
        unidades,
        total_monto,
        fecha,
        proveedores ( nombre )
      `)
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Obtener resumen de despachos totales por sucursal
  async obtenerResumenDespachos() {
    const { data, error } = await supabase
      .from('despacho_pollo')
      .select(`
        id,
        kilos,
        unidades,
        fecha,
        sucursales ( nombre, sector )
      `)
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Obtener inventario actual consolidado de Planta
  async obtenerInventarioPlanta() {
    const { data, error } = await supabase
      .from('control_inventario_diario')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data?.[0] || null;
  }
};