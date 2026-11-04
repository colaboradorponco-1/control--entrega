import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Boxes, CheckCircle, Clock3, Download, Search,
  Loader2, Plus, Printer, RefreshCw, Save, Trash2, X,
} from 'lucide-react';
import { supabase } from '../../config/supabaseClient';

const fechaHoyBolivia = () => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const parte = (tipo) => partes.find((item) => item.type === tipo)?.value;
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
};

const horaActual = () => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/La_Paz',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).format(new Date());

const normalizarFila = (data) => (Array.isArray(data) ? data[0] : data);

export default function InventarioDiarioSucursal({ sucursalId, nombreSucursal, darkMode }) {
  const [fecha, setFecha] = useState(fechaHoyBolivia());
  const [inventario, setInventario] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [pollosCrudos, setPollosCrudos] = useState('');
  const [ingresoUnidades, setIngresoUnidades] = useState('');
  const [observacionesProducto, setObservacionesProducto] = useState('');
  const [horaCorte, setHoraCorte] = useState(horaActual());
  const [observaciones, setObservaciones] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [busquedaHistorial, setBusquedaHistorial] = useState('');
  const [filtroEstadoHistorial, setFiltroEstadoHistorial] = useState('todos');
  const [mostrarPlanilla, setMostrarPlanilla] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setCargando(true);
      const [actual, registros] = await Promise.all([
        supabase
          .from('inventario_sucursal')
          .select('*')
          .eq('sucursal_id', sucursalId)
          .eq('fecha', fecha)
          .maybeSingle(),
        supabase
          .from('inventario_sucursal')
          .select('id, fecha, pollos_crudos, pollos_crudos_contados, pollos_crudos_iniciales, pollos_recibidos, pollos_ingreso_manual, pollos_recibidos_en_conteo, conteo_guardado_en, actualizado_por_nombre, hora_corte, cerrado_en')
          .eq('sucursal_id', sucursalId)
          .not('hora_corte', 'is', null)
          .order('fecha', { ascending: false })
          .limit(60),
      ]);
      if (actual.error) throw actual.error;
      if (registros.error) throw registros.error;

      setInventario(actual.data);
      setHistorial(registros.data || []);
      if (!silencioso) {
        setPollosCrudos(actual.data
          ? String(actual.data.pollos_crudos_contados ?? (actual.data.cerrado_en ? actual.data.pollos_crudos : ''))
          : '');
        setObservaciones(actual.data?.observaciones || '');
        setObservacionesProducto(actual.data?.observaciones_producto || '');
        setIngresoUnidades('');
      }
      setMensaje(null);
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo cargar el inventario diario.' });
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [fecha, sucursalId]);

  useEffect(() => {
    cargar();
    const canal = supabase
      .channel(`inventario-sucursal-${sucursalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventario_sucursal',
          filter: `sucursal_id=eq.${sucursalId}`,
        },
        () => cargar({ silencioso: true }),
      )
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [cargar, sucursalId]);

  const hoy = fechaHoyBolivia();
  const ingresoAutomatico = Math.max(
    0,
    (Number(inventario?.pollos_recibidos) || 0) - (Number(inventario?.pollos_ingreso_manual) || 0),
  );
  const ingresoManualPendiente = Number(ingresoUnidades) || 0;
  const disponible = (Number(inventario?.pollos_crudos_iniciales) || 0)
    + (Number(inventario?.pollos_recibidos) || 0) + ingresoManualPendiente;
  const contado = Number(pollosCrudos) || 0;
  const cerrado = Boolean(inventario?.cerrado_en);
  const conteoGuardado = Boolean(
    pollosCrudos !== ''
      && ingresoUnidades === ''
      && inventario?.conteo_guardado_en
      && Number(inventario.pollos_crudos_contados ?? inventario.pollos_crudos) === contado,
  );
  const disponibleAlGuardar = (Number(inventario?.pollos_crudos_iniciales) || 0)
    + (Number(inventario?.pollos_recibidos_en_conteo ?? inventario?.pollos_recibidos) || 0);
  const disponibleParaConteo = conteoGuardado ? disponibleAlGuardar : disponible;
  const diferencia = pollosCrudos === ''
    ? null
    : contado - disponibleParaConteo;
  const iniciado = Boolean(inventario?.hora_corte);
  const esHoy = fecha === hoy;
  const fechaVisible = useMemo(
    () => new Date(`${fecha}T12:00:00`).toLocaleDateString('es-BO'),
    [fecha],
  );
  const horaVisible = inventario?.hora_corte
    ? String(inventario.hora_corte).slice(0, 5)
    : '—';
  const historialVisible = useMemo(() => {
    const termino = busquedaHistorial.trim().toLocaleLowerCase('es-BO');
    return historial.filter((registro) => {
      if (filtroDesde && registro.fecha < filtroDesde) return false;
      if (filtroHasta && registro.fecha > filtroHasta) return false;
      if (filtroEstadoHistorial === 'abiertos' && registro.cerrado_en) return false;
      if (filtroEstadoHistorial === 'cerrados' && !registro.cerrado_en) return false;
      if (!termino) return true;
      const conteo = registro.pollos_crudos_contados ?? (registro.cerrado_en ? registro.pollos_crudos : '');
      return `pollo crudo ${registro.fecha} ${nombreSucursal || ''} ${registro.actualizado_por_nombre || ''} ${conteo ?? ''}`
        .toLocaleLowerCase('es-BO')
        .includes(termino);
    });
  }, [busquedaHistorial, filtroDesde, filtroHasta, filtroEstadoHistorial, historial, nombreSucursal]);

  const iniciarInventario = async () => {
    if (!horaCorte) {
      setMensaje({ tipo: 'error', texto: 'Indica la hora de corte.' });
      return;
    }
    try {
      setGuardando(true);
      const { data, error } = await supabase.rpc('iniciar_planilla_inventario_sucursal', {
        p_hora_corte: horaCorte,
        p_observaciones: observaciones.trim() || null,
      });
      if (error) throw error;
      const fila = normalizarFila(data);
      setInventario(fila);
      setPollosCrudos(String(fila?.pollos_crudos_contados ?? (fila?.cerrado_en ? fila.pollos_crudos : '')));
      setObservaciones(fila?.observaciones || '');
      setObservacionesProducto(fila?.observaciones_producto || '');
      setMostrarPlanilla(true);
      setMensaje({ tipo: 'exito', texto: 'Inventario del día iniciado.' });
      await cargar({ silencioso: true });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo iniciar el inventario.' });
    } finally {
      setGuardando(false);
    }
  };

  const guardarConteo = async (cerrar = false) => {
    const crudos = pollosCrudos === '' ? null : Number(pollosCrudos);
    const ingresoManual = ingresoUnidades === '' ? 0 : Number(ingresoUnidades);
    if ((cerrar && crudos === null) || (crudos !== null && (!Number.isInteger(crudos) || crudos < 0))) {
      setMensaje({ tipo: 'error', texto: 'Ingresa una cantidad entera igual o mayor que cero.' });
      return false;
    }
    if (!Number.isInteger(ingresoManual) || ingresoManual < 0) {
      setMensaje({ tipo: 'error', texto: 'El ingreso manual debe ser un número entero igual o mayor que cero.' });
      return false;
    }

    try {
      setGuardando(true);
      const { data, error } = await supabase.rpc('guardar_conteo_inventario_crudo_sucursal', {
        p_pollos_crudos: crudos,
        p_ingreso_manual: ingresoManual,
        p_observaciones_producto: observacionesProducto.trim() || null,
        p_cerrar: cerrar,
        p_observaciones: observaciones.trim() || null,
      });
      if (error) throw error;
      const fila = normalizarFila(data);
      setInventario(fila);
      setPollosCrudos(fila?.pollos_crudos_contados == null ? '' : String(fila.pollos_crudos_contados));
      setIngresoUnidades('');
      setObservaciones(fila?.observaciones || '');
      setObservacionesProducto(fila?.observaciones_producto || '');
      setMensaje({
        tipo: 'exito',
        texto: cerrar ? 'Inventario cerrado y ajuste registrado.' : crudos === null ? 'Borrador guardado sin ajustar el stock.' : 'Conteo guardado sin ajustar el stock.',
      });
      await cargar({ silencioso: true });
      return true;
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo guardar el conteo.' });
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const cerrarGuardandoConteo = async () => {
    if (!inventario || !iniciado || cerrado || !esHoy) {
      setMostrarPlanilla(false);
      return;
    }
    const guardado = await guardarConteo(false);
    if (guardado) setMostrarPlanilla(false);
  };

  const abrirPlanilla = async (registro) => {
    try {
      setCargando(true);
      setMensaje(null);
      const { data, error } = await supabase
        .from('inventario_sucursal')
        .select('*')
        .eq('sucursal_id', sucursalId)
        .eq('fecha', registro.fecha)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No se encontró la planilla seleccionada.');

      setFecha(data.fecha);
      setInventario(data);
      setPollosCrudos(data.pollos_crudos_contados == null
        ? (data.cerrado_en ? String(data.pollos_crudos) : '')
        : String(data.pollos_crudos_contados));
      setIngresoUnidades('');
      setObservaciones(data.observaciones || '');
      setObservacionesProducto(data.observaciones_producto || '');
      setHoraCorte(data.hora_corte ? String(data.hora_corte).slice(0, 5) : horaActual());
      setMostrarPlanilla(true);
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo abrir la planilla.' });
    } finally {
      setCargando(false);
    }
  };

  const eliminarPlanilla = async () => {
    try {
      setEliminando(true);
      const { error } = await supabase.rpc('eliminar_planilla_inventario_sucursal');
      if (error) throw error;
      setInventario(null);
      setPollosCrudos('');
      setIngresoUnidades('');
      setObservacionesProducto('');
      setObservaciones('');
      setMostrarPlanilla(false);
      setMensaje({ tipo: 'exito', texto: 'Planilla eliminada. Las recepciones automáticas se conservaron.' });
      await cargar({ silencioso: true });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo eliminar la planilla.' });
    } finally {
      setEliminando(false);
    }
  };

  const confirmarAccion = async () => {
    const accionConfirmada = confirmacion;
    setConfirmacion(null);
    if (accionConfirmada === 'eliminar') {
      await eliminarPlanilla();
    } else if (accionConfirmada === 'cerrar') {
      await guardarConteo(true);
    }
  };

  const exportar = () => {
    if (!inventario) return;
    const conteoExportado = pollosCrudos === '' ? '' : contado;
    const filas = [
      ['Fecha', 'Hora de corte', 'Producto', 'Unidad', 'Inventario inicial', 'Ingresos', 'Disponible', 'Inventario final', 'Diferencia (final - disponible)', 'Observaciones'],
      [
        fecha,
        horaVisible,
        'Pollo crudo',
        'unidad',
        inventario.pollos_crudos_iniciales || 0,
        inventario.pollos_recibidos || 0,
        disponibleParaConteo,
        conteoExportado,
        conteoExportado === '' ? '' : Number(conteoExportado) - disponibleParaConteo,
        inventario.observaciones_producto || '',
      ],
    ];
    filas[0].splice(5, 0, 'Ingreso manual', 'Ingreso automático');
    filas[1].splice(5, 0, inventario.pollos_ingreso_manual || 0, ingresoAutomatico);
    filas[0].push('Observaciones generales');
    filas[1].push(inventario.observaciones || '');
    const contenido = filas.map((fila) => fila.map((celda) => `"${String(celda).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([`\uFEFF${contenido}`], { type: 'text/csv;charset=utf-8' }));
    enlace.download = `inventario-sucursal-${fecha}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  const card = darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-white';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const texto = darkMode ? 'text-slate-100' : 'text-gray-900';
  const input = darkMode
    ? 'border-slate-700 bg-slate-950 text-white'
    : 'border-gray-300 bg-white text-gray-900';
  const accion = 'inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-50';
  const secundario = `inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${input}`;

  if (cargando && !inventario && !historial.length) {
    return (
      <div className={`${card} flex items-center justify-center gap-2 rounded-2xl border p-10 ${muted}`}>
        <Loader2 size={18} className="animate-spin" /> Cargando inventario diario...
      </div>
    );
  }

  return (
    <section className={`${card} overflow-hidden rounded-2xl border`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-inherit p-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-amber-500/10 p-2 text-amber-500"><Boxes size={20} /></span>
          <div>
            <h2 className={`text-base font-black ${texto}`}>{mostrarPlanilla ? 'Planilla de inventario diario de pollo crudo' : 'Inventarios diarios'}</h2>
            <p className={`text-xs ${muted}`}>{nombreSucursal || 'Mi sucursal'}{mostrarPlanilla ? ` · ${fechaVisible}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mostrarPlanilla && inventario && (iniciado || !esHoy) && (
            <span className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${
              cerrado ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
            }`}>
              {cerrado ? <CheckCircle size={14} /> : <Clock3 size={14} />}
              {cerrado ? 'Cerrado' : 'Abierto'} · corte {horaVisible}
            </span>
          )}
          <button type="button" onClick={() => cargar()} disabled={cargando || guardando || eliminando} className={secundario}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Actualizar datos
          </button>
          {mostrarPlanilla && (
            <button
              type="button"
              onClick={cerrarGuardandoConteo}
              disabled={guardando || eliminando}
              className={secundario}
              aria-label="Guardar borrador y cerrar planilla"
              title="Guardar los cambios sin ajustar el stock y volver a la lista"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      {mensaje && (
        <p className={`mx-4 mt-4 rounded-lg border px-3 py-2 text-sm ${
          mensaje.tipo === 'error'
            ? 'border-red-500/30 bg-red-500/10 text-red-500'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
        }`}>
          {mensaje.texto}
        </p>
      )}

      {(!inventario || !iniciado) && esHoy && !mostrarPlanilla && (
        <div className={`m-4 flex flex-wrap items-end justify-between gap-4 rounded-xl border-l-4 border-amber-500 p-4 shadow-sm ${card}`}>
          <div className="min-w-[220px] flex-1">
            <h3 className={`font-black ${texto}`}>Planilla de Inventario Diario de Pollo Crudo</h3>
            <p className={`mt-1 max-w-2xl text-xs ${muted}`}>
              Iníciala una vez al día. El saldo inicial se toma del último cierre y las recepciones confirmadas se agregan automáticamente.
            </p>
          </div>
          <label className={`text-xs font-semibold text-amber-600`}>
            Hora de corte
            <input type="time" value={horaCorte} onChange={(event) => setHoraCorte(event.target.value)} className={`mt-1 block min-w-36 rounded-lg border px-3 py-2 text-sm ${input}`} />
          </label>
          <button type="button" onClick={iniciarInventario} disabled={guardando || eliminando} className={`${accion} min-h-10`}>
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Iniciar inventario del día
          </button>
          <label className={`w-full text-xs font-semibold ${muted}`}>
            Observaciones generales (opcional)
            <input value={observaciones} onChange={(event) => setObservaciones(event.target.value)} maxLength={500} placeholder="Novedad de apertura, si hay" className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal ${input}`} />
          </label>
        </div>
      )}

      {!inventario && !esHoy && (
        !mostrarPlanilla && <p className={`m-4 rounded-lg bg-slate-500/5 p-4 text-sm ${muted}`}>
          No hay una planilla guardada para esta fecha. Los inventarios anteriores se conservan en el historial y no se pueden iniciar retroactivamente.
        </p>
      )}

      {!mostrarPlanilla && inventario && iniciado && esHoy && (
        <div className={`m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${card}`}>
          <div>
            <h3 className={`font-black ${texto}`}>Planilla de hoy guardada</h3>
            <p className={`mt-1 text-xs ${muted}`}>
              {inventario.cerrado_en
                ? `Cerrada · conteo: ${inventario.pollos_crudos_contados ?? inventario.pollos_crudos}`
                : inventario.conteo_guardado_en
                  ? `Borrador guardado · conteo: ${inventario.pollos_crudos_contados}`
                  : 'Borrador guardado · conteo pendiente'}
            </p>
          </div>
          <button type="button" onClick={() => abrirPlanilla({ fecha })} disabled={cargando} className={accion}>
            {cargando ? <Loader2 size={14} className="animate-spin" /> : <Boxes size={14} />}
            Abrir planilla
          </button>
        </div>
      )}

      {mostrarPlanilla && inventario && (iniciado || !esHoy) && (
        <>
          <div className={`mx-4 mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs ${muted}`}>
            <p className={`font-bold ${texto}`}>Cómo llenar la planilla</p>
            <p className="mt-1">
              1. Anota el ingreso manual recibido fuera del sistema (usa 0 si no hubo). 2. Cuenta los pollos físicamente y escribe el inventario final.
              3. Guarda el conteo. Guardar no cambia el stock; al cerrar el día se aplica la diferencia.
            </p>
          </div>
          <div className={`mx-4 mt-3 grid grid-cols-2 gap-2 rounded-lg border p-3 text-[11px] font-bold uppercase tracking-wide md:grid-cols-3 xl:grid-cols-6 ${darkMode ? 'border-slate-800 bg-slate-950 text-slate-400' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
            <span>Inicial: {Number(inventario.pollos_crudos_iniciales) || 0}</span>
            <span>Ingreso sistema: {ingresoAutomatico}</span>
            <span>Ingreso manual: {(Number(inventario.pollos_ingreso_manual) || 0) + ingresoManualPendiente}</span>
            <span>Disponible: {disponible}</span>
            <span>Conteo final: {pollosCrudos === '' ? '—' : contado}</span>
            <span>Diferencia: {diferencia === null ? '—' : diferencia > 0 ? `+${diferencia}` : diferencia}</span>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className={darkMode ? 'bg-slate-950 text-slate-400' : 'bg-gray-50 text-gray-600'}>
                  <th className="px-3 py-3 text-left">Producto</th>
                  <th className="px-3 py-3 text-left">Unidad</th>
                  <th className="px-3 py-3 text-right">Inv. inicial</th>
                  <th className="bg-amber-400/15 px-3 py-3 text-left">Ingreso manual</th>
                  <th className="px-3 py-3 text-right">Disp. al contar</th>
                  <th className="bg-amber-500/10 px-3 py-3 text-right">Inv. final</th>
                  <th className="px-3 py-3 text-right">Diferencia</th>
                  <th className="px-3 py-3 text-left">Control / estado</th>
                  <th className="px-3 py-3 text-left">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-inherit">
                  <td className={`px-3 py-3 font-bold ${texto}`}>Pollo crudo</td>
                  <td className={`px-3 py-3 ${muted}`}>unidad</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${muted}`}>{Number(inventario.pollos_crudos_iniciales) || 0}</td>
                  <td className="px-3 py-3">
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-emerald-600">
                        Sistema: +{ingresoAutomatico}
                      </p>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={ingresoUnidades}
                          disabled={cerrado || !esHoy}
                          onChange={(event) => setIngresoUnidades(event.target.value)}
                          placeholder="0"
                          className={`w-24 rounded-lg border px-2 py-1.5 text-right text-sm font-semibold disabled:opacity-60 ${input}`}
                          aria-label="Ingreso manual de pollos crudos"
                        />
                        {ingresoUnidades !== '' && !cerrado && esHoy && (
                          <button
                            type="button"
                            onClick={() => setIngresoUnidades('')}
                            className={`rounded-md border p-1.5 ${input}`}
                            aria-label="Borrar ingreso manual sin guardar"
                            title="Borrar ingreso manual sin guardar"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      <p className={`text-right text-[10px] ${muted}`}>
                        Guardado: {Number(inventario.pollos_ingreso_manual) || 0}
                      </p>
                    </div>
                  </td>
                  <td className={`px-3 py-3 text-right font-black tabular-nums ${texto}`}>{disponibleParaConteo}</td>
                  <td className="px-3 py-3 text-right">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={pollosCrudos}
                      disabled={cerrado || !esHoy}
                      onChange={(event) => setPollosCrudos(event.target.value)}
                      className={`w-28 rounded-lg border px-3 py-2 text-right font-semibold disabled:opacity-60 ${input}`}
                      aria-label="Conteo final de pollos crudos"
                    />
                  </td>
                  <td className={`px-3 py-3 text-right font-bold tabular-nums ${
                    diferencia > 0 ? 'text-blue-500' : diferencia < 0 ? 'text-amber-600' : texto
                  }`}>
                    {diferencia === null ? '—' : diferencia > 0 ? `+${diferencia} sobrante` : diferencia < 0 ? `${Math.abs(diferencia)} faltante` : 0}
                  </td>
                  <td className={`px-3 py-3 text-xs ${
                    diferencia > 0 ? 'text-blue-500' : diferencia < 0 ? 'text-amber-600' : 'text-emerald-500'
                  }`}>
                    {diferencia > 0
                      ? <span className="inline-flex items-center gap-1"><AlertCircle size={13} /> Conteo mayor al disponible</span>
                      : diferencia === null
                        ? <span className="inline-flex items-center gap-1"><Clock3 size={13} /> Conteo pendiente</span>
                      : diferencia < 0
                        ? <span className="inline-flex items-center gap-1"><AlertCircle size={13} /> Conteo menor al disponible</span>
                      : <span className="inline-flex items-center gap-1"><CheckCircle size={13} />{
                        cerrado ? 'Stock ajustado al cierre'
                          : conteoGuardado ? 'Conteo guardado, sin ajustar'
                            : 'Conteo pendiente de guardar'
                      }</span>}
                  </td>
                  <td className="px-3 py-3">
                    <input
                      value={observacionesProducto}
                      onChange={(event) => setObservacionesProducto(event.target.value)}
                      disabled={cerrado || !esHoy}
                      maxLength={300}
                      placeholder="Observaciones del pollo"
                      aria-label="Observaciones del pollo crudo"
                      className={`w-48 rounded-lg border px-3 py-2 text-xs disabled:opacity-60 ${input}`}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-inherit p-4">
            <label className={`min-w-[240px] flex-1 text-xs font-semibold ${muted}`}>
              Observaciones generales
              <textarea value={observaciones} onChange={(event) => setObservaciones(event.target.value)} disabled={cerrado || !esHoy} maxLength={500} rows={2} placeholder="Anota novedades del inventario" className={`mt-1 block w-full resize-y rounded-lg border px-3 py-2 text-sm font-normal disabled:opacity-60 ${input}`} />
            </label>
            {inventario.cerrado_en ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-500">
                <CheckCircle size={14} /> Cierre confirmado
              </span>
            ) : esHoy ? (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={exportar} className={secundario}><Download size={14} /> Exportar planilla</button>
                <button type="button" onClick={() => window.print()} className={secundario}><Printer size={14} /> Imprimir planilla</button>
                <button
                  type="button"
                  onClick={() => setConfirmacion('eliminar')}
                  disabled={guardando || eliminando}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  {eliminando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Borrar planilla
                </button>
                <button type="button" onClick={() => guardarConteo(false)} disabled={guardando || eliminando} className={secundario}>
                  {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Guardar conteo
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmacion('cerrar')}
                  disabled={guardando || eliminando}
                  className={accion}
                  title="Cerrar el día y aplicar el ajuste al stock"
                >
                  {guardando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Cerrar día y ajustar stock
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={exportar} className={secundario}><Download size={14} /> Exportar planilla</button>
                <button type="button" onClick={() => window.print()} className={secundario}><Printer size={14} /> Imprimir planilla</button>
              </div>
            )}
          </div>
          <p className={`px-4 pb-4 text-xs ${muted}`}>
            La diferencia entre disponible e inventario final se registra como ajuste únicamente al cerrar el día. Archivar desde Inventario general solo oculta/organiza el registro; no cambia el saldo.
          </p>
        </>
      )}

      {!mostrarPlanilla && <footer className="border-t border-inherit p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className={`text-sm font-bold ${texto}`}>Historial de inventarios</h3>
          <span className={`text-xs ${muted}`}>Últimos {historial.length} registros</span>
        </div>
        {historial.length ? (
          <>
            <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.5fr_1fr_auto_auto]">
              <label className={`text-xs font-semibold ${muted}`}>
                Desde
                <input type="date" value={filtroDesde} max={filtroHasta || hoy} onChange={(event) => setFiltroDesde(event.target.value)} className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm ${input}`} />
              </label>
              <label className={`text-xs font-semibold ${muted}`}>
                Hasta
                <input type="date" value={filtroHasta} min={filtroDesde} max={hoy} onChange={(event) => setFiltroHasta(event.target.value)} className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm ${input}`} />
              </label>
              <label className={`text-xs font-semibold ${muted}`}>
                Buscar
                <span className={`mt-1 flex items-center gap-2 rounded-lg border px-3 py-2 ${input}`}>
                  <Search size={14} />
                  <input value={busquedaHistorial} onChange={(event) => setBusquedaHistorial(event.target.value)} placeholder="Producto, fecha o conteo" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                </span>
              </label>
              <label className={`text-xs font-semibold ${muted}`}>
                Estado
                <select value={filtroEstadoHistorial} onChange={(event) => setFiltroEstadoHistorial(event.target.value)} className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm ${input}`}>
                  <option value="todos">Todos</option>
                  <option value="abiertos">Abiertos</option>
                  <option value="cerrados">Cerrados</option>
                </select>
              </label>
              <button type="button" onClick={() => { setFiltroDesde(''); setFiltroHasta(''); setBusquedaHistorial(''); setFiltroEstadoHistorial('todos'); }} className={`${secundario} self-end`}>
                Limpiar
              </button>
              <span className={`self-center text-xs ${muted}`}>{historialVisible.length} de {historial.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className={darkMode ? 'bg-slate-950 text-slate-400' : 'bg-gray-50 text-gray-600'}>
                  <tr>
                    <th className="px-3 py-3">Fecha</th>
                    <th className="px-3 py-3">Producto</th>
                    <th className="px-3 py-3">Sucursal</th>
                    <th className="px-3 py-3">Hora de corte</th>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-3 py-3 text-right">Conteo</th>
                    <th className="px-3 py-3 text-right">Faltan</th>
                    <th className="px-3 py-3 text-right">Sobran</th>
                    <th className="px-3 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {historialVisible.map((registro) => {
                    const conteo = registro.pollos_crudos_contados ?? (registro.cerrado_en ? registro.pollos_crudos : null);
                    const disponibleRegistro = (Number(registro.pollos_crudos_iniciales) || 0)
                      + (Number(registro.pollos_recibidos_en_conteo ?? registro.pollos_recibidos) || 0);
                    const diferenciaRegistro = conteo === null || !registro.conteo_guardado_en
                      ? null
                      : Number(conteo) - disponibleRegistro;
                    return (
                      <tr key={registro.id} className={`border-t border-inherit ${registro.fecha === fecha ? 'bg-amber-500/5' : ''}`}>
                        <td className={`whitespace-nowrap px-3 py-3 ${texto}`}>{new Date(`${registro.fecha}T12:00:00`).toLocaleDateString('es-BO')}</td>
                        <td className={`px-3 py-3 font-semibold ${texto}`}>Pollo crudo</td>
                        <td className={`px-3 py-3 ${muted}`}>{nombreSucursal || 'Mi sucursal'}</td>
                        <td className={`px-3 py-3 tabular-nums ${muted}`}>{registro.hora_corte ? String(registro.hora_corte).slice(0, 5) : '—'}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-1 font-bold ${
                            registro.cerrado_en
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : registro.conteo_guardado_en
                                ? 'bg-amber-500/10 text-amber-600'
                                : 'bg-slate-500/10 text-slate-500'
                          }`}>
                            {registro.cerrado_en ? 'Cerrado' : registro.conteo_guardado_en ? 'Abierto' : 'Borrador'}
                          </span>
                        </td>
                        <td className={`px-3 py-3 text-right tabular-nums ${texto}`}>{conteo ?? '—'}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-amber-600">{diferenciaRegistro === null ? '—' : Math.max(-diferenciaRegistro, 0)}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-blue-500">{diferenciaRegistro === null ? '—' : Math.max(diferenciaRegistro, 0)}</td>
                        <td className="px-3 py-3 text-right">
                          <button type="button" onClick={() => abrirPlanilla(registro)} disabled={cargando} className="rounded-lg border border-amber-500/40 px-3 py-1.5 font-bold text-amber-600 transition hover:bg-amber-500/10 disabled:opacity-50">
                            Abrir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!historialVisible.length && (
                    <tr><td colSpan={9} className={`px-3 py-8 text-center ${muted}`}>No hay registros que coincidan con los filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className={`text-xs ${muted}`}>Todavía no hay inventarios guardados.</p>
        )}
      </footer>}
      {confirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="confirmacion-inventario-titulo" className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${card}`}>
            <h3 id="confirmacion-inventario-titulo" className={`text-base font-black ${texto}`}>
              {confirmacion === 'eliminar' ? '¿Borrar la planilla de hoy?' : '¿Cerrar el inventario de hoy?'}
            </h3>
            <p className={`mt-2 text-sm ${muted}`}>
              {confirmacion === 'eliminar'
                ? 'Se eliminará la planilla abierta y se anularán los ingresos manuales. Las recepciones automáticas se conservarán.'
                : 'El conteo quedará bloqueado y la diferencia se aplicará al stock. Esta acción no se puede deshacer desde esta pantalla.'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmacion(null)} className={secundario}>Cancelar</button>
              <button
                type="button"
                onClick={confirmarAccion}
                disabled={guardando || eliminando}
                className={confirmacion === 'eliminar' ? 'inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50' : accion}
              >
                {confirmacion === 'eliminar' ? 'Borrar planilla' : 'Cerrar y ajustar stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
