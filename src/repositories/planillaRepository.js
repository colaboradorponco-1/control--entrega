import { supabase } from '../config/supabaseClient';

export const planillaRepository = {
  async listarSucursales() {
    const { data, error } = await supabase
      .from('sucursales')
      .select('id, nombre, sector')
      .order('sector', { ascending: true })
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async listarProveedores() {
    const { data, error } = await supabase
      .from('proveedores')
      .select('id, nombre')
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // Compras y costos promedio de la semana: reporte desde recepcion_pollo
  async comprasSemana({ desde, hasta }) {
    const { data, error } = await supabase
      .from('recepcion_pollo')
      .select('fecha, kilos, unidades, precio_por_kilo, total_monto, numero_recibo, proveedor_id, proveedores ( nombre )')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async listarVentas({ desde, hasta }) {
    const { data, error } = await supabase
      .from('planilla_ventas')
      .select('id, fecha, sucursal_id, unidades, transacciones, importe_bs')
      .gte('fecha', desde)
      .lte('fecha', hasta);
    if (error) throw error;
    return data || [];
  },

  async guardarVenta({ fecha, sucursalId, unidades, transacciones, importeBs, creadoPor }) {
    const { data, error } = await supabase
      .from('planilla_ventas')
      .upsert(
        {
          fecha,
          sucursal_id: Number(sucursalId),
          unidades: Number(unidades) || 0,
          transacciones: Number(transacciones) || 0,
          importe_bs: Number(importeBs) || 0,
          creado_por: creadoPor ?? null,
        },
        { onConflict: 'fecha,sucursal_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async listarInventario({ desde, hasta }) {
    const { data, error } = await supabase
      .from('planilla_inventario')
      .select('id, fecha, proveedor_id, kilos_ayer, kilos_entrante, kilos_saliente, kilos_hoy')
      .gte('fecha', desde)
      .lte('fecha', hasta);
    if (error) throw error;
    return data || [];
  },

  async guardarInventario({ fecha, proveedorId, kilosAyer, kilosEntrante, kilosSaliente, creadoPor }) {
    const { data, error } = await supabase
      .from('planilla_inventario')
      .upsert(
        {
          fecha,
          proveedor_id: Number(proveedorId),
          kilos_ayer: Number(kilosAyer) || 0,
          kilos_entrante: Number(kilosEntrante) || 0,
          kilos_saliente: Number(kilosSaliente) || 0,
          creado_por: creadoPor ?? null,
        },
        { onConflict: 'fecha,proveedor_id' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
