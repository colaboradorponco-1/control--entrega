import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Archive, CheckCircle, Loader2, Lock, Play, TrendingUp, Trash2, Unlock, X, XCircle } from 'lucide-react';
import { planillaRepository } from '../../repositories/planillaRepository';

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

export default function VentasDiariasSucursal({ sucursalId, nombreSucursal, darkMode }) {
  const [fecha, setFecha] = useState(fechaHoyBolivia());
  const [formulario, setFormulario] = useState({ unidades: '', transacciones: '', importe: '' });
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [iniciadaEn, setIniciadaEn] = useState(null);
  const [cerradaEn, setCerradaEn] = useState(null);
  const [archivadaEn, setArchivadaEn] = useState(null);
  const [bandejaHistorial, setBandejaHistorial] = useState('activos');
  const [mostrarPlanilla, setMostrarPlanilla] = useState(true);
  const fechaSeleccionadaRef = useRef(fechaHoyBolivia());

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      fechaSeleccionadaRef.current = fecha;
      const registro = await planillaRepository.listarVentasSucursal({
        sucursalId,
        desde: fecha,
        hasta: fecha,
      });
      if (fechaSeleccionadaRef.current !== fecha) return;
      const actual = registro[0] || null;
      setIniciadaEn(actual?.iniciada_en || null);
      setCerradaEn(actual?.cerrada_en || null);
      setArchivadaEn(actual?.archivada_en || null);
      setFormulario({
        unidades: actual ? String(actual.unidades) : '',
        transacciones: actual ? String(actual.transacciones) : '',
        importe: actual ? String(actual.importe_bs) : '',
      });
      const ultimos = await planillaRepository.listarVentasSucursal({
        sucursalId,
      });
      setHistorial(ultimos);
      setMensaje(null);
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo cargar las ventas.' });
    } finally {
      setCargando(false);
    }
  }, [fecha, sucursalId]);

  useEffect(() => {
    if (sucursalId) cargar();
  }, [cargar, sucursalId]);

  const submit = async (event) => {
    event.preventDefault();
    if (!iniciadaEn) {
      setMensaje({ tipo: 'error', texto: 'Primero inicia la planilla de ventas del día.' });
      return;
    }
    if (cerradaEn) {
      setMensaje({ tipo: 'error', texto: 'La planilla de ventas ya está cerrada.' });
      return;
    }
    const unidades = Number(formulario.unidades);
    const transacciones = Number(formulario.transacciones);
    const importe = Number(formulario.importe);
    if (!Number.isInteger(unidades) || unidades < 0
      || !Number.isInteger(transacciones) || transacciones < 0
      || !Number.isFinite(importe) || importe < 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresa cantidades enteras y un importe igual o mayor a cero.' });
      return;
    }
    try {
      setGuardando(true);
      await planillaRepository.registrarVentaSucursal({
        sucursalId,
        fecha,
        unidades,
        transacciones,
        importeBs: importe,
      });
      setMensaje({ tipo: 'exito', texto: 'Venta diaria guardada correctamente.' });
      await cargar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo guardar la venta.' });
    } finally {
      setGuardando(false);
    }
  };

  const iniciarPlanilla = async () => {
    try {
      setGuardando(true);
      const data = await planillaRepository.iniciarPlanillaVentas({
        sucursalId,
        fecha: fechaHoyBolivia(),
      });
      setFecha(fechaHoyBolivia());
      setIniciadaEn(data?.iniciada_en || new Date().toISOString());
      setCerradaEn(data?.cerrada_en || null);
      setArchivadaEn(null);
      setMostrarPlanilla(true);
      setFormulario({ unidades: '', transacciones: '', importe: '' });
      setMensaje({ tipo: 'exito', texto: 'Planilla de ventas iniciada.' });
      await cargar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo iniciar la planilla de ventas.' });
    } finally {
      setGuardando(false);
    }
  };

  const cerrarPlanilla = async () => {
    const unidades = Number(formulario.unidades);
    const transacciones = Number(formulario.transacciones);
    const importe = Number(formulario.importe);
    if (!Number.isInteger(unidades) || unidades < 0
      || !Number.isInteger(transacciones) || transacciones < 0
      || !Number.isFinite(importe) || importe < 0) {
      setMensaje({ tipo: 'error', texto: 'Completa los datos antes de cerrar la venta del día.' });
      return;
    }
    try {
      setGuardando(true);
      await planillaRepository.registrarVentaSucursal({
        sucursalId,
        fecha,
        unidades,
        transacciones,
        importeBs: importe,
      });
      const data = await planillaRepository.cerrarPlanillaVentas({
        sucursalId,
        fecha,
      });
      setCerradaEn(data?.cerrada_en || new Date().toISOString());
      setMensaje({ tipo: 'exito', texto: 'Venta del día cerrada correctamente.' });
      await cargar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo cerrar la venta.' });
    } finally {
      setGuardando(false);
    }
  };

  const abrirPlanilla = async () => {
    try {
      setGuardando(true);
      const data = await planillaRepository.reabrirPlanillaVentas({
        sucursalId,
        fecha,
      });
      setCerradaEn(data?.cerrada_en || null);
      setMensaje({ tipo: 'exito', texto: 'Planilla abierta nuevamente para modificarla.' });
      await cargar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo abrir la planilla.' });
    } finally {
      setGuardando(false);
    }
  };

  const archivarPlanilla = async () => {
    try {
      setGuardando(true);
      await planillaRepository.archivarPlanillaVentas({
        sucursalId,
        fecha,
      });
      setArchivadaEn(new Date().toISOString());
      setBandejaHistorial('archivados');
      setMensaje({ tipo: 'exito', texto: 'Planilla archivada.' });
      await cargar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo archivar la planilla.' });
    } finally {
      setGuardando(false);
    }
  };

  const restaurarPlanilla = async (fila) => {
    try {
      setGuardando(true);
      await planillaRepository.restaurarPlanillaVentas({
        sucursalId,
        fecha: fila.fecha,
      });
      setMensaje({ tipo: 'exito', texto: 'Planilla restaurada.' });
      await cargar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo restaurar la planilla.' });
    } finally {
      setGuardando(false);
    }
  };

  const eliminarPlanilla = async (fila) => {
    if (!window.confirm(`¿Eliminar definitivamente la venta del ${fila.fecha}? Esta acción no se puede deshacer.`)) return;
    try {
      setGuardando(true);
      await planillaRepository.eliminarPlanillaVentasSucursal({
        sucursalId,
        fecha: fila.fecha,
      });
      setMensaje({ tipo: 'exito', texto: 'Planilla archivada eliminada definitivamente.' });
      await cargar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo eliminar la planilla.' });
    } finally {
      setGuardando(false);
    }
  };

  const cerrarVistaPlanilla = async () => {
    const hoy = fechaHoyBolivia();
    fechaSeleccionadaRef.current = hoy;
    setFecha(hoy);
    setFormulario({ unidades: '', transacciones: '', importe: '' });
    setIniciadaEn(null);
    setCerradaEn(null);
    setArchivadaEn(null);
    setMostrarPlanilla(false);
    setBandejaHistorial('activos');
    setMensaje(null);
  };

  const abrirFilaHistorial = async (fila) => {
    try {
      setGuardando(true);
      fechaSeleccionadaRef.current = fila.fecha;
      setFecha(fila.fecha);
      const actual = await planillaRepository.obtenerVentaSucursal({
        sucursalId,
        fecha: fila.fecha,
      });
      if (fechaSeleccionadaRef.current !== fila.fecha) return;
      const registroActual = actual || fila;
      setIniciadaEn(registroActual.iniciada_en || null);
      setCerradaEn(registroActual.cerrada_en || null);
      setArchivadaEn(registroActual.archivada_en || null);
      setMostrarPlanilla(true);
      setFormulario({
        unidades: String(registroActual.unidades ?? 0),
        transacciones: String(registroActual.transacciones ?? 0),
        importe: String(registroActual.importe_bs ?? 0),
      });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo abrir la planilla.' });
    } finally {
      setGuardando(false);
    }
  };

  const card = darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-white';
  const input = darkMode
    ? 'border-slate-700 bg-slate-950 text-white'
    : 'border-gray-300 bg-gray-50 text-gray-900';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const fechaEsHoy = fecha === fechaHoyBolivia();

  return (
    <div className="space-y-4">
      <section className={`rounded-2xl border p-4 ${card}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-500" />
            <div>
              <h2 className="font-black">Ventas del día</h2>
              <p className={`text-xs ${muted}`}>{nombreSucursal || 'Mi sucursal'} · Planilla diaria de ventas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={cerrarVistaPlanilla}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
            title="Cerrar vista y volver a hoy"
            aria-label="Cerrar vista y volver a hoy"
          >
            <X size={18} />
          </button>
        </div>
        {mostrarPlanilla && !fechaEsHoy && (
          <div className={`mt-4 rounded-xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-950/40' : 'border-gray-300 bg-gray-50'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-black">Venta del {fecha}</p>
                <p className={`mt-1 text-xs ${muted}`}>
                  {cerradaEn ? 'Planilla cerrada' : iniciadaEn ? 'Planilla iniciada' : 'Datos guardados'}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className={`rounded-lg border px-3 py-2 ${card}`}><span className={`text-xs ${muted}`}>Vendidas</span><p className="font-black">{formulario.unidades || 0}</p></div>
              <div className={`rounded-lg border px-3 py-2 ${card}`}><span className={`text-xs ${muted}`}>Transacciones</span><p className="font-black">{formulario.transacciones || 0}</p></div>
              <div className={`rounded-lg border px-3 py-2 ${card}`}><span className={`text-xs ${muted}`}>Importe</span><p className="font-black">Bs {Number(formulario.importe || 0).toLocaleString('es-BO')}</p></div>
            </div>
          </div>
        )}
        {mostrarPlanilla && fechaEsHoy && !iniciadaEn && (
          <div className={`mt-4 rounded-xl border border-dashed p-4 ${darkMode ? 'border-slate-700' : 'border-gray-300'}`}>
            <p className={`mb-3 text-sm ${muted}`}>
              La planilla no ha sido iniciada. Al iniciar se registran automáticamente esta sucursal, la fecha y la hora.
            </p>
            <button
              type="button"
              disabled={guardando || cargando}
              onClick={iniciarPlanilla}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Iniciar planilla de ventas del día
            </button>
          </div>
        )}
        {mostrarPlanilla && fechaEsHoy && iniciadaEn && !cerradaEn && (
          <div className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${cerradaEn ? 'border-slate-500 text-slate-500' : 'border-emerald-500/40 text-emerald-600'}`}>
            <CheckCircle size={14} />
            Planilla iniciada: {new Date(iniciadaEn).toLocaleString('es-BO')}
          </div>
        )}
        {mostrarPlanilla && fechaEsHoy && cerradaEn && (
          <div className={`mt-4 rounded-xl border border-dashed p-4 ${darkMode ? 'border-slate-700 bg-slate-950/40' : 'border-slate-300 bg-slate-50'}`}>
            <div className="flex items-center gap-2 font-black text-slate-500">
              <Lock size={17} />
              Planilla cerrada
            </div>
            <p className={`mt-1 text-sm ${muted}`}>
              Cerrada el {new Date(cerradaEn).toLocaleString('es-BO')}. Los datos se conservaron en el historial.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className={`rounded-lg border px-3 py-2 ${card}`}><span className={`text-xs ${muted}`}>Vendidas</span><p className="font-black">{formulario.unidades || 0}</p></div>
              <div className={`rounded-lg border px-3 py-2 ${card}`}><span className={`text-xs ${muted}`}>Transacciones</span><p className="font-black">{formulario.transacciones || 0}</p></div>
              <div className={`rounded-lg border px-3 py-2 ${card}`}><span className={`text-xs ${muted}`}>Importe</span><p className="font-black">Bs {Number(formulario.importe || 0).toLocaleString('es-BO')}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={guardando} onClick={abrirPlanilla} className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-bold text-emerald-600">
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                Abrir planilla
              </button>
              <button type="button" disabled={guardando || Boolean(archivadaEn)} onClick={archivarPlanilla} className="inline-flex items-center gap-2 rounded-lg border border-slate-400 px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-50">
                <Archive size={16} />
                {archivadaEn ? 'Planilla archivada' : 'Archivar planilla'}
              </button>
            </div>
          </div>
        )}
        {mostrarPlanilla && fechaEsHoy && iniciadaEn && !cerradaEn && <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-4">
          <label className={`text-xs font-bold ${muted}`}>
            Fecha
            <input type="date" value={fecha} readOnly className={`mt-1 w-full rounded-lg border px-3 py-2 ${input}`} />
          </label>
          <label className={`text-xs font-bold ${muted}`}>
            Pollos vendidos
            <input type="number" min="0" step="1" required disabled={!iniciadaEn || Boolean(cerradaEn)} value={formulario.unidades} onChange={(event) => setFormulario((actual) => ({ ...actual, unidades: event.target.value }))} className={`mt-1 w-full rounded-lg border px-3 py-2 disabled:opacity-60 ${input}`} />
          </label>
          <label className={`text-xs font-bold ${muted}`}>
            Transacciones
            <input type="number" min="0" step="1" required disabled={!iniciadaEn || Boolean(cerradaEn)} value={formulario.transacciones} onChange={(event) => setFormulario((actual) => ({ ...actual, transacciones: event.target.value }))} className={`mt-1 w-full rounded-lg border px-3 py-2 disabled:opacity-60 ${input}`} />
          </label>
          <label className={`text-xs font-bold ${muted}`}>
            Importe (Bs)
            <input type="number" min="0" step="0.01" required disabled={!iniciadaEn || Boolean(cerradaEn)} value={formulario.importe} onChange={(event) => setFormulario((actual) => ({ ...actual, importe: event.target.value }))} className={`mt-1 w-full rounded-lg border px-3 py-2 disabled:opacity-60 ${input}`} />
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-4">
            <button disabled={guardando || cargando || !iniciadaEn || Boolean(cerradaEn)} type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              Guardar venta diaria
            </button>
            <button disabled={guardando || cargando || !iniciadaEn || Boolean(cerradaEn)} type="button" onClick={cerrarPlanilla} className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500 bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-600 disabled:opacity-50">
              <XCircle size={16} />
              Cerrar venta del día
            </button>
          </div>
        </form>}
        {mensaje && (
          <p className={`mt-3 flex items-center gap-2 text-xs font-bold ${mensaje.tipo === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>
            {mensaje.tipo === 'error' && <AlertCircle size={14} />}{mensaje.texto}
          </p>
        )}
      </section>
      <section className={`rounded-2xl border p-3 ${card}`}>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBandejaHistorial('activos')}
            className={`rounded-lg border px-3 py-2 text-xs font-bold ${bandejaHistorial === 'activos' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-inherit text-slate-500'}`}
          >
            Planillas activas ({historial.filter((fila) => !fila.archivada_en).length})
          </button>
          <button
            type="button"
            onClick={() => setBandejaHistorial('archivados')}
            className={`rounded-lg border px-3 py-2 text-xs font-bold ${bandejaHistorial === 'archivados' ? 'border-slate-600 bg-slate-600 text-white' : 'border-inherit text-slate-500'}`}
          >
            <span className="inline-flex items-center gap-1.5"><Archive size={13} /> Archivados ({historial.filter((fila) => fila.archivada_en).length})</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={darkMode ? 'bg-slate-950 text-slate-400' : 'bg-gray-50 text-gray-600'}>
              <tr><th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-right">Vendidas</th><th className="px-3 py-2 text-right">Transacciones</th><th className="px-3 py-2 text-right">Importe Bs</th><th className="px-3 py-2 text-right">Acción</th></tr>
            </thead>
            <tbody>
              {historial.filter((fila) => bandejaHistorial === 'archivados' ? Boolean(fila.archivada_en) : !fila.archivada_en).map((fila) => (
                <tr key={fila.fecha} className={`border-t ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                  <td className="px-3 py-2">{fila.fecha}</td>
                  <td className="px-3 py-2 text-right font-bold">{fila.unidades}</td>
                  <td className="px-3 py-2 text-right">{fila.transacciones}</td>
                  <td className="px-3 py-2 text-right font-bold">Bs {Number(fila.importe_bs).toLocaleString('es-BO')}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {bandejaHistorial === 'archivados' ? (
                        <>
                          <button type="button" onClick={() => restaurarPlanilla(fila)} disabled={guardando} className="rounded-lg border border-slate-400 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-50">Restaurar</button>
                          <button type="button" onClick={() => eliminarPlanilla(fila)} disabled={guardando} className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-600 disabled:opacity-50">
                            <Trash2 size={13} /> Eliminar
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => abrirFilaHistorial(fila)} disabled={guardando} className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-600 disabled:opacity-50">Abrir</button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                setGuardando(true);
                                await planillaRepository.archivarPlanillaVentas({ sucursalId, fecha: fila.fecha });
                                setMensaje({ tipo: 'exito', texto: 'Planilla archivada.' });
                                await cargar();
                              } catch (error) {
                                setMensaje({ tipo: 'error', texto: error.message || 'No se pudo archivar la planilla.' });
                              } finally {
                                setGuardando(false);
                              }
                            }}
                            disabled={guardando || !fila.cerrada_en || Boolean(fila.archivada_en)}
                            title={fila.cerrada_en ? 'Archivar planilla cerrada' : 'Primero debe cerrarse la planilla del día'}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-400/50 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Archive size={13} /> Archivar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!historial.filter((fila) => bandejaHistorial === 'archivados' ? Boolean(fila.archivada_en) : !fila.archivada_en).length && !cargando && (
                <tr><td colSpan="5" className={`px-3 py-6 text-center ${muted}`}>No hay planillas en esta bandeja.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
