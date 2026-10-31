import { supabase } from '../config/supabaseClient';
import { proveedoresRepository } from './proveedoresRepository';
import { esColumnaFaltante } from './columnaFalta';

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
    return proveedoresRepository.listar();
  },

  // Compras y costos promedio de la semana: reporte desde recepcion_pollo
  async comprasSemana({ desde, hasta }) {
    const consultar = (campos) => supabase
      .from('recepcion_pollo')
      .select(campos)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true });
    const camposBase = 'id, fecha, kilos, unidades, precio_por_kilo, total_monto, numero_recibo, proveedor_id, proveedores ( nombre )';
    let { data, error } = await consultar(`${camposBase}, origen_registro`);
    if (error && esColumnaFaltante(error.message)) {
      ({ data, error } = await consultar(camposBase));
      if (!error) data = (data || []).map((compra) => ({ ...compra, origen_registro: 'PLANTA' }));
    }
    if (error) throw error;
    return data || [];
  },

  async listarPlanillasComprasArchivadas({ semanaInicio }) {
    const { data, error } = await supabase
      .from('planillas_compras_archivadas')
      .select('proveedor_id, semana_inicio, archivado_en')
      .eq('semana_inicio', semanaInicio)
      .eq('archivado', true);
    if (error) throw error;
    return data || [];
  },

  async obtenerEstadoPlanillaComprasArchivada({ proveedorId, semanaInicio }) {
    const { data, error } = await supabase
      .from('planillas_compras_archivadas')
      .select('archivado')
      .eq('proveedor_id', Number(proveedorId))
      .eq('semana_inicio', semanaInicio)
      .eq('archivado', true)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },

  async archivarPlanillaCompras({ proveedorId, semanaInicio, archivar }) {
    const { error } = await supabase.rpc('archivar_planilla_compras', {
      p_proveedor_id: Number(proveedorId),
      p_semana_inicio: semanaInicio,
      p_archivar: archivar,
    });
    if (error) throw error;
  },

  async eliminarPlanillaComprasArchivada({ proveedorId, semanaInicio }) {
    const { data, error } = await supabase.rpc('eliminar_planilla_compras_archivada', {
      p_proveedor_id: Number(proveedorId),
      p_semana_inicio: semanaInicio,
    });
    if (error) throw error;
    return data;
  },

  async crearCompraManual({ fecha, proveedorId, numeroRecibo, kilos, unidades, precioPorKilo, creadoPor }) {
    const { data, error } = await supabase
      .from('recepcion_pollo')
      .insert({
        fecha,
        proveedor_id: Number(proveedorId),
        numero_recibo: numeroRecibo.trim(),
        kilos: Number(kilos),
        unidades: Number(unidades),
        precio_por_kilo: Number(precioPorKilo),
        creado_por: creadoPor ?? null,
        origen_registro: 'MANUAL',
      })
      .select('id')
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarCompra({ id, fecha, proveedorId, numeroRecibo, kilos, unidades, precioPorKilo }) {
    const { data, error } = await supabase
      .from('recepcion_pollo')
      .update({
        fecha,
        proveedor_id: Number(proveedorId),
        numero_recibo: numeroRecibo.trim(),
        kilos: Number(kilos),
        unidades: Number(unidades),
        precio_por_kilo: Number(precioPorKilo),
      })
      .eq('id', id)
      .select('id')
      .single();
    if (error) throw error;
    return data;
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

  async obtenerEstadoCerrado({ tipo, entidadId, semanaInicio }) {
    const { data, error } = await supabase
      .from('planillas_semanales_cerradas')
      .select('tipo')
      .eq('tipo', tipo)
      .eq('entidad_id', Number(entidadId))
      .eq('semana_inicio', semanaInicio)
      .is('reabierta_en', null)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },

  async cerrarPlantilla({ tipo, entidadId, semanaInicio }) {
    const { error } = await supabase.rpc('cerrar_plantilla_semanal', {
      p_tipo: tipo,
      p_entidad_id: Number(entidadId),
      p_semana_inicio: semanaInicio,
    });
    if (error) throw error;
  },

  async reabrirPlantilla({ tipo, entidadId, semanaInicio }) {
    const { error } = await supabase.rpc('reabrir_plantilla_semanal', {
      p_tipo: tipo,
      p_entidad_id: Number(entidadId),
      p_semana_inicio: semanaInicio,
    });
    if (error) throw error;
  },
};
