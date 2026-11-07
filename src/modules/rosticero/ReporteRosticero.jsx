import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabaseClient';
import { authRepository } from '../../repositories/AuthRepository';
import { evidenciasRepository } from '../../repositories/evidenciasRepository';
import FirmaCanvas from '../../components/FirmaCanvas';
import {
  ArrowLeft, LogOut, Sun, Moon, Loader2, Plus, X,
  ClipboardList, CheckCircle, Trash2, AlertCircle, Archive, ArchiveRestore,
  Search, ChevronLeft, ChevronRight, Printer,
} from 'lucide-react';
import {
  normalizarBusqueda,
  POR_PAGINA,
  rangoUltimos30Dias,
} from '../../utils/filtrosHistorial';

const escaparHtml = (valor) => String(valor ?? 'No registrado').replace(/[&<>"']/g, (caracter) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[caracter]);
const textoNoInformado = 'No registrado';

export default function ReporteRosticero() {
  const { darkMode, toggleTheme } = useTheme();
  const { perfil } = useAuth();
  const navigate = useNavigate();

  const [reportes, setReportes] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [verArchivados, setVerArchivados] = useState(false);
  const [procesandoId, setProcesandoId] = useState(null);
  const [periodo, setPeriodo] = useState(rangoUltimos30Dias);
  const [sucursalFiltro, setSucursalFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [pagina, setPagina] = useState(0);
  const [totalReportes, setTotalReportes] = useState(0);

  const [form, setForm] = useState({
    sucursal_id: '',
    fecha: new Date().toISOString().slice(0, 10),
    hora_ingreso: '',
    saldo_inicio_dia: '',
    ingresos_dia: '',
    saldo_final_dia: '',
    pollos_vendidos_sistema: '',
    obs_pollos_enfermos: false,
    obs_pollos_pequenos: false,
    obs_otros: false,
    observaciones_detalle: '',
    cajero: '',
    supervisor: '',
  });
  const [firma, setFirma] = useState(null);

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';
  const puedeGestionarReportes = perfil?.roles?.nombre === 'rosticero';
  const puedeVerArchivados = puedeGestionarReportes
    || ['administrador', 'superadmin', 'superadministrador'].includes(perfil?.roles?.nombre);

  const cargar = useCallback(async (paginaSolicitada = pagina) => {
    try {
      setCargando(true);
      setError(null);
      // Cargar sucursales
      const { data: sucData } = await supabase.from('sucursales').select('id, nombre, sector').order('nombre');
      setSucursales(sucData || []);

      let query = supabase
        .from('reportes_rosticero')
        .select('*, sucursales(nombre, sector)', { count: 'exact' })
        .order('fecha', { ascending: false })
        .range(paginaSolicitada * POR_PAGINA, (paginaSolicitada + 1) * POR_PAGINA - 1)
        .eq('archivado', verArchivados);
      if (periodo.desde) query = query.gte('fecha', periodo.desde);
      if (periodo.hasta) query = query.lte('fecha', periodo.hasta);
      if (sucursalFiltro !== 'todas') query = query.eq('sucursal_id', Number(sucursalFiltro));
      const termino = normalizarBusqueda(busquedaAplicada);
      if (termino) {
        query = query.or(`cajero.ilike.%${termino}%,supervisor.ilike.%${termino}%,observaciones_detalle.ilike.%${termino}%`);
      }
      const { data: repData, error: err, count } = await query;
      if (err) throw err;
      setReportes(repData || []);
      setTotalReportes(count || 0);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos');
    } finally {
      setCargando(false);
    }
  }, [busquedaAplicada, pagina, periodo, sucursalFiltro, verArchivados]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setBusquedaAplicada(busqueda);
      setPagina(0);
    }, 300);
    return () => window.clearTimeout(temporizador);
  }, [busqueda]);

  const totalPollosHornear = (Number(form.saldo_inicio_dia) || 0) + (Number(form.ingresos_dia) || 0);
  const pollosVendidos = totalPollosHornear - (Number(form.saldo_final_dia) || 0);

  const crearReporte = async (e) => {
    e.preventDefault();
    if (!puedeGestionarReportes) {
      setError('Solo el rol rosticero puede registrar reportes.');
      return;
    }
    if (!form.sucursal_id || !form.fecha) {
      setError('Selecciona sucursal y fecha.');
      return;
    }
    try {
      setEnviando(true);
      setError(null);

      let firmaUrl = null;
      if (firma) {
        const archivoFirma = evidenciasRepository.dataUrlABlob(firma);
        const fileName = `rosticero-firmas/${form.sucursal_id}-${form.fecha}-${Date.now()}.png`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('revisiones-videos')
          .upload(fileName, archivoFirma, { cacheControl: '3600', upsert: false, contentType: 'image/png' });
        if (uploadErr) {
          if (/mime type .* is not supported/i.test(uploadErr.message || '')) {
            throw new Error('Supabase todavía no acepta firmas PNG. Ejecuta nuevamente supabase/FIRMA_ROSTICERO.sql en el SQL Editor y vuelve a guardar el reporte.');
          }
          throw uploadErr;
        }
        const { data: urlData } = supabase.storage
          .from('revisiones-videos')
          .getPublicUrl(uploadData.path);
        firmaUrl = urlData.publicUrl;
      }

      const { error: err } = await supabase.rpc('crear_reporte_rosticero', {
        p_sucursal_id: Number(form.sucursal_id),
        p_fecha: form.fecha,
        p_hora_ingreso: form.hora_ingreso || null,
        p_saldo_inicio_dia: Number(form.saldo_inicio_dia) || 0,
        p_ingresos_dia: Number(form.ingresos_dia) || 0,
        p_saldo_final_dia: Number(form.saldo_final_dia) || 0,
        p_pollos_vendidos_sistema: form.pollos_vendidos_sistema ? Number(form.pollos_vendidos_sistema) : null,
        p_obs_pollos_enfermos: form.obs_pollos_enfermos,
        p_obs_pollos_pequenos: form.obs_pollos_pequenos,
        p_obs_otros: form.obs_otros,
        p_observaciones_detalle: form.observaciones_detalle.trim() || null,
        p_cajero: form.cajero.trim() || null,
        p_supervisor: form.supervisor.trim() || null,
        p_firma_url: firmaUrl,
      });
      if (err) throw err;
      setMensaje('Reporte guardado correctamente.');
      setForm({
        sucursal_id: '', fecha: new Date().toISOString().slice(0, 10), hora_ingreso: '',
        saldo_inicio_dia: '', ingresos_dia: '', saldo_final_dia: '', pollos_vendidos_sistema: '',
        obs_pollos_enfermos: false, obs_pollos_pequenos: false, obs_otros: false,
        observaciones_detalle: '', cajero: '', supervisor: '',
      });
      setFirma(null);
      setMostrarForm(false);
      setPagina(0);
      await cargar(0);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el reporte');
    } finally {
      setEnviando(false);
    }
  };

  const archivarReporte = async (id, archivado) => {
    if (!puedeGestionarReportes) {
      setError('Solo el rol rosticero puede administrar reportes.');
      return;
    }
    try {
      setProcesandoId(id);
      await supabase.rpc('archivar_reporte_rosticero', {
        p_reporte_id: id,
        p_archivado: archivado,
      });
      setMensaje(archivado ? 'Reporte archivado.' : 'Reporte restaurado.');
      setPagina(0);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo archivar el reporte');
    } finally {
      setProcesandoId(null);
    }
  };

  const eliminarReporte = async (id) => {
    if (!puedeGestionarReportes) {
      setError('Solo el rol rosticero puede administrar reportes.');
      return;
    }
    if (!window.confirm('¿Eliminar definitivamente este reporte? Esta acción no se puede deshacer.')) return;
    try {
      setProcesandoId(id);
      await supabase.rpc('eliminar_reporte_rosticero', { p_reporte_id: id });
      setMensaje('Reporte eliminado.');
      setPagina(0);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el reporte');
    } finally {
      setProcesandoId(null);
    }
  };

  const imprimirReporte = (reporte) => {
    const ventana = window.open('', '_blank', 'width=850,height=750');
    if (!ventana) {
      setError('Permite las ventanas emergentes para imprimir el reporte.');
      return;
    }

    const fechaReporte = reporte.fecha
      ? new Date(`${reporte.fecha}T12:00:00`).toLocaleDateString('es-BO')
      : textoNoInformado;
    const campos = [
      ['Sucursal', reporte.sucursales?.nombre || `Sucursal ${reporte.sucursal_id}`],
      ['Sector', reporte.sucursales?.sector || textoNoInformado],
      ['Fecha', fechaReporte],
      ['Hora de ingreso', reporte.hora_ingreso || textoNoInformado],
      ['Saldo inicial', reporte.saldo_inicio_dia],
      ['Ingresos del día', reporte.ingresos_dia],
      ['Total para hornear', reporte.total_pollos_hornear],
      ['Saldo final', reporte.saldo_final_dia],
      ['Pollos vendidos', reporte.pollos_vendidos],
      ['Pollos vendidos según sistema', reporte.pollos_vendidos_sistema ?? textoNoInformado],
      ['Cajero', reporte.cajero || textoNoInformado],
      ['Supervisor', reporte.supervisor || textoNoInformado],
      ['Registrado por', reporte.creado_por_nombre || textoNoInformado],
      ['Observaciones', reporte.observaciones_detalle || textoNoInformado],
    ];
    const observaciones = [
      reporte.obs_pollos_enfermos && 'Pollos enfermos',
      reporte.obs_pollos_pequenos && 'Pollos pequeños',
      reporte.obs_otros && 'Otros',
    ].filter(Boolean);

    ventana.document.write(`<!doctype html>
      <html lang="es"><head><meta charset="utf-8">
      <title>Reporte rosticero ${escaparHtml(reporte.sucursales?.nombre || reporte.id)}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111827;margin:32px}
        h1{font-size:22px;margin:0 0 6px}p{color:#4b5563;margin:0 0 20px}
        table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #d1d5db}
        th{width:35%;color:#374151}.firma{margin-top:32px;width:280px;text-align:center}
        .firma img{display:block;width:100%;height:100px;object-fit:contain;border-bottom:1px solid #111827}
        .firma span{display:block;margin-top:8px;font-size:12px}
        @media print{body{margin:12mm}}
      </style></head><body>
      <h1>Reporte diario de Rosticero</h1>
      <p>Sistema de Control Avícola</p>
      <table>${campos.map(([etiqueta, valor]) => `<tr><th>${escaparHtml(etiqueta)}</th><td>${escaparHtml(valor)}</td></tr>`).join('')}</table>
      <p style="margin-top:16px"><strong>Observaciones marcadas:</strong> ${escaparHtml(observaciones.join(', ') || 'Ninguna')}</p>
      ${reporte.firma_url ? `<div class="firma"><img src="${escaparHtml(reporte.firma_url)}" alt="Firma del responsable"><span>Firma del responsable</span></div>` : ''}
      </body></html>`);
    ventana.document.close();
    const imagenes = [...ventana.document.images];
    Promise.all(imagenes.map((imagen) => (
      imagen.complete
        ? (imagen.naturalWidth > 0
          ? Promise.resolve()
          : Promise.reject(new Error('No se pudo cargar la firma del reporte.')))
        : new Promise((resolve, reject) => {
          imagen.onload = resolve;
          imagen.onerror = () => reject(new Error('No se pudo cargar la firma del reporte.'));
        })
    ))).then(() => {
      ventana.focus();
      ventana.print();
    }).catch((err) => {
      ventana.close();
      setError(err.message || 'No se pudo preparar el reporte para imprimir.');
    });
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-800'}`}>
      <header className={`${card} border-b sticky top-0 z-30`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={20} className="text-amber-500" />
            <h1 className={`font-black tracking-tight ${strong}`}>Reporte de Rosticero</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/panel')} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Volver">
              <ArrowLeft size={18} />
            </button>
            <button onClick={toggleTheme} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Tema">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={() => authRepository.logout()} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Salir">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {error && (
          <div className={`mb-4 p-3 border text-sm flex items-center gap-2 rounded-xl ${darkMode ? 'bg-red-950/50 border-red-500/50 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {mensaje && (
          <div className={`mb-4 p-3 rounded-xl border text-sm font-medium ${darkMode ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {mensaje}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div className={`text-sm ${muted}`}>
            <p>Reporte diario de pollos rostizados por sucursal.</p>
            <p className="mt-1 text-xs">
              Vendidos (conteo) se calcula: total para hornear menos saldo final. Vendidos (sistema) es el dato que se anota manualmente para comparar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {puedeVerArchivados && (
              <button
                onClick={() => {
                  setVerArchivados((actual) => !actual);
                  setPagina(0);
                }}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${input}`}
              >
                {verArchivados ? 'Ver activos' : 'Ver archivados'}
              </button>
            )}
            {puedeGestionarReportes && (
              <>
                <button
                  onClick={() => setMostrarForm(true)}
                  className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-purple-700"
                >
                  <Plus size={16} /> Nuevo reporte
                </button>
              </>
            )}
          </div>
        </div>

        <div className={`${card} mb-4 grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-5`}>
          <label className={`relative text-xs font-semibold ${muted}`}>
            Buscar cajero, supervisor u observación
            <Search size={15} className="pointer-events-none absolute left-3 top-9" />
            <input
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              className={`mt-1 w-full rounded-xl border py-2 pl-9 pr-3 text-sm font-normal ${input}`}
              placeholder="Escribe para buscar..."
            />
          </label>
          <label className={`text-xs font-semibold ${muted}`}>
            Sucursal
            <select
              value={sucursalFiltro}
              onChange={(evento) => { setSucursalFiltro(evento.target.value); setPagina(0); }}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
            >
              <option value="todas">Todas las sucursales</option>
              {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
            </select>
          </label>
          <label className={`text-xs font-semibold ${muted}`}>
            Desde
            <input
              type="date"
              value={periodo.desde}
              max={periodo.hasta}
              onChange={(evento) => { setPeriodo((actual) => ({ ...actual, desde: evento.target.value })); setPagina(0); }}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
            />
          </label>
          <label className={`text-xs font-semibold ${muted}`}>
            Hasta
            <input
              type="date"
              value={periodo.hasta}
              min={periodo.desde}
              onChange={(evento) => { setPeriodo((actual) => ({ ...actual, hasta: evento.target.value })); setPagina(0); }}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setPeriodo(rangoUltimos30Dias());
              setSucursalFiltro('todas');
              setBusqueda('');
              setBusquedaAplicada('');
              setPagina(0);
            }}
            className={`self-end rounded-xl border px-3 py-2 text-sm font-semibold ${input}`}
          >
            Limpiar filtros
          </button>
        </div>

        <div className={`mb-3 text-xs ${muted}`}>
          Mostrando {reportes.length} de {totalReportes} reportes de los últimos 30 días o del período elegido.
        </div>

        {puedeGestionarReportes && mostrarForm && (
          <div className={`mb-6 rounded-2xl border p-5 ${card}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-black ${strong}`}>Nuevo reporte diario</h2>
              <button onClick={() => setMostrarForm(false)} className={`p-2 rounded-lg ${muted} hover:bg-slate-500/10`}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={crearReporte} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Sucursal *
                  <select
                    required
                    value={form.sucursal_id}
                    onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  >
                    <option value="">Selecciona</option>
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}{s.sector ? ` · ${s.sector}` : ''}</option>
                    ))}
                  </select>
                </label>
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Fecha *
                  <input
                    type="date" required
                    value={form.fecha}
                    onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  />
                </label>
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Hora de ingreso
                  <input
                    type="time"
                    value={form.hora_ingreso}
                    onChange={(e) => setForm({ ...form, hora_ingreso: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  />
                </label>
              </div>

              <div className={`rounded-xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-950/50' : 'border-gray-200 bg-gray-50'}`}>
                <p className={`text-xs font-bold uppercase tracking-wider ${muted} mb-3`}>Inventario de pollos</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className={`block text-xs ${muted}`}>
                    Saldo inicio del día
                    <input
                      type="number" min="0" step="1"
                      value={form.saldo_inicio_dia}
                      onChange={(e) => setForm({ ...form, saldo_inicio_dia: e.target.value })}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
                    />
                  </label>
                  <label className={`block text-xs ${muted}`}>
                    Ingresos del día
                    <input
                      type="number" min="0" step="1"
                      value={form.ingresos_dia}
                      onChange={(e) => setForm({ ...form, ingresos_dia: e.target.value })}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
                    />
                  </label>
                  <div className={`rounded-xl p-2 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                    <p className={`text-[10px] ${muted}`}>Total para hornear</p>
                    <p className={`text-lg font-black ${strong}`}>{totalPollosHornear}</p>
                  </div>
                  <label className={`block text-xs ${muted}`}>
                    Saldo final del día
                    <input
                      type="number" min="0" step="1"
                      value={form.saldo_final_dia}
                      onChange={(e) => setForm({ ...form, saldo_final_dia: e.target.value })}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className={`rounded-xl p-2 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                    <p className={`text-[10px] ${muted}`}>Pollos vendidos</p>
                    <p className={`text-lg font-black ${strong}`}>{pollosVendidos}</p>
                  </div>
                  <label className={`block text-xs ${muted}`}>
                    Pollos vendidos según sistema
                    <input
                      type="number" min="0" step="1"
                      value={form.pollos_vendidos_sistema}
                      onChange={(e) => setForm({ ...form, pollos_vendidos_sistema: e.target.value })}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
                    />
                    <span className={`mt-1 block text-[11px] ${muted}`}>
                      Anota aquí las ventas que muestra el sistema. Es un dato opcional de comparación.
                    </span>
                  </label>
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-950/50' : 'border-gray-200 bg-gray-50'}`}>
                <p className={`text-xs font-bold uppercase tracking-wider ${muted} mb-3`}>Observaciones</p>
                <div className="flex flex-wrap gap-4 mb-3">
                  <label className={`flex items-center gap-2 text-xs ${normal}`}>
                    <input
                      type="checkbox"
                      checked={form.obs_pollos_enfermos}
                      onChange={(e) => setForm({ ...form, obs_pollos_enfermos: e.target.checked })}
                      className="h-4 w-4 accent-amber-500"
                    />
                    Pollos enfermos
                  </label>
                  <label className={`flex items-center gap-2 text-xs ${normal}`}>
                    <input
                      type="checkbox"
                      checked={form.obs_pollos_pequenos}
                      onChange={(e) => setForm({ ...form, obs_pollos_pequenos: e.target.checked })}
                      className="h-4 w-4 accent-amber-500"
                    />
                    Pollos pequeños
                  </label>
                  <label className={`flex items-center gap-2 text-xs ${normal}`}>
                    <input
                      type="checkbox"
                      checked={form.obs_otros}
                      onChange={(e) => setForm({ ...form, obs_otros: e.target.checked })}
                      className="h-4 w-4 accent-amber-500"
                    />
                    Otros
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={form.observaciones_detalle}
                  onChange={(e) => setForm({ ...form, observaciones_detalle: e.target.value })}
                  placeholder="Detalle de observaciones..."
                  className={`w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Cajero (firma)
                  <input
                    value={form.cajero}
                    onChange={(e) => setForm({ ...form, cajero: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                    placeholder="Nombre del cajero"
                  />
                </label>
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Supervisor (firma)
                  <input
                    value={form.supervisor}
                    onChange={(e) => setForm({ ...form, supervisor: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                    placeholder="Nombre del supervisor"
                  />
                </label>
              </div>

              <FirmaCanvas
                titulo="Firma del responsable"
                onCambio={(dataUrl) => {
                  setFirma(dataUrl);
                }}
                theme={{
                  card: darkMode ? 'bg-slate-950/60' : 'bg-white',
                  borde: darkMode ? 'border-slate-700' : 'border-gray-300',
                  texto: darkMode ? 'text-slate-300' : 'text-gray-600',
                  tenue: darkMode ? 'text-slate-500' : 'text-gray-400',
                  btn: darkMode
                    ? 'border border-slate-700 text-slate-300'
                    : 'border border-gray-300 text-gray-600',
                }}
              />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMostrarForm(false)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold ${input}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-purple-700 disabled:opacity-60"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Guardar reporte
                </button>
              </div>
            </form>
          </div>
        )}

        {cargando ? (
          <div className="flex items-center justify-center gap-3 py-20">
            <Loader2 size={24} className="animate-spin text-amber-500" />
            <span className={muted}>Cargando...</span>
          </div>
        ) : totalReportes === 0 ? (
          <div className={`${card} border rounded-2xl p-10 text-center`}>
            <ClipboardList size={40} className={`mx-auto mb-4 ${muted}`} />
            <p className={`font-bold mb-2 ${strong}`}>No hay resultados</p>
            <p className={`text-sm ${muted}`}>Prueba cambiando el período o los filtros. Los reportes antiguos se conservan.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reportes.map((r) => (
              <div key={r.id} className={`${card} border rounded-2xl p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${strong}`}>
                        {r.sucursales?.nombre || `Sucursal ${r.sucursal_id}`}
                      </span>
                      <span className={`text-xs ${muted}`}>
                        {new Date(`${r.fecha}T12:00:00`).toLocaleDateString('es-BO')}
                        {r.hora_ingreso ? ` · ${r.hora_ingreso}` : ''}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-3 xl:grid-cols-6">
                      <div className={`rounded-xl p-3 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-xs ${muted}`}>Saldo inicial</p>
                        <p className={`mt-1 text-lg font-bold ${strong}`}>{r.saldo_inicio_dia}</p>
                      </div>
                      <div className={`rounded-xl p-3 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-xs ${muted}`}>Ingresos del día</p>
                        <p className={`mt-1 text-lg font-bold ${strong}`}>{r.ingresos_dia}</p>
                      </div>
                      <div className={`rounded-xl p-3 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-xs ${muted}`}>Total para hornear</p>
                        <p className={`mt-1 text-lg font-bold ${strong}`}>{r.total_pollos_hornear}</p>
                      </div>
                      <div className={`rounded-xl p-3 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-xs ${muted}`}>Saldo final</p>
                        <p className={`mt-1 text-lg font-bold ${strong}`}>{r.saldo_final_dia}</p>
                      </div>
                      <div className={`rounded-xl p-3 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-xs ${muted}`}>Vendidos (conteo)</p>
                        <p className={`mt-1 text-lg font-bold ${strong}`}>{r.pollos_vendidos}</p>
                      </div>
                      <div className={`rounded-xl p-3 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-xs ${muted}`}>Vendidos (sistema)</p>
                        <p className={`mt-1 ${r.pollos_vendidos_sistema == null ? `text-xs ${muted}` : `text-lg font-bold ${strong}`}`}>
                          {r.pollos_vendidos_sistema ?? textoNoInformado}
                        </p>
                      </div>
                    </div>
                    {(r.obs_pollos_enfermos || r.obs_pollos_pequenos || r.obs_otros) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.obs_pollos_enfermos && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-500/10 text-red-500">Pollos enfermos</span>}
                        {r.obs_pollos_pequenos && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-500">Pollos pequeños</span>}
                        {r.obs_otros && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-gray-500/10 text-gray-500">Otros</span>}
                      </div>
                    )}
                    {!cargando && totalReportes > POR_PAGINA && (
                      <div className={`mt-4 flex items-center justify-between ${muted}`}>
                        <span className="text-xs">Página {pagina + 1} de {Math.ceil(totalReportes / POR_PAGINA)}</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={pagina === 0}
                            onClick={() => setPagina((actual) => actual - 1)}
                            className={`rounded-lg border p-2 disabled:opacity-40 ${input}`}
                            aria-label="Página anterior"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            type="button"
                            disabled={(pagina + 1) * POR_PAGINA >= totalReportes}
                            onClick={() => setPagina((actual) => actual + 1)}
                            className={`rounded-lg border p-2 disabled:opacity-40 ${input}`}
                            aria-label="Página siguiente"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                    {r.observaciones_detalle && (
                      <p className={`mt-2 text-xs italic ${muted}`}>“{r.observaciones_detalle}”</p>
                    )}
                    <p className={`mt-2 text-[10px] ${muted}`}>
                      Cajero: {r.cajero || textoNoInformado} · Supervisor: {r.supervisor || textoNoInformado} · Registrado por: {r.creado_por_nombre || textoNoInformado}
                    </p>
                    {r.firma_url && (
                      <img
                        src={r.firma_url}
                        alt={`Firma del responsable del reporte de ${r.sucursales?.nombre || 'la sucursal'}`}
                        className="mt-3 h-20 max-w-xs rounded-lg border border-slate-300 bg-white object-contain p-2"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => imprimirReporte(r)}
                      title="Imprimir reporte"
                      aria-label={`Imprimir reporte de ${r.sucursales?.nombre || 'la sucursal'}`}
                      className={`rounded-lg p-2 ${muted} hover:text-cyan-500 hover:bg-cyan-500/10`}
                    >
                      <Printer size={14} />
                    </button>
                    {puedeGestionarReportes && (
                      <>
                      {!verArchivados && (
                        <button
                          onClick={() => archivarReporte(r.id, true)}
                          disabled={procesandoId === r.id}
                          className={`p-2 rounded-lg ${muted} hover:text-amber-500 hover:bg-amber-500/10`}
                          title="Archivar"
                        >
                          <Archive size={14} />
                        </button>
                      )}
                      {verArchivados && (
                        <>
                          <button
                            onClick={() => archivarReporte(r.id, false)}
                            disabled={procesandoId === r.id}
                            className={`p-2 rounded-lg ${muted} hover:text-emerald-500 hover:bg-emerald-500/10`}
                            title="Restaurar"
                          >
                            <ArchiveRestore size={14} />
                          </button>
                          <button
                            onClick={() => eliminarReporte(r.id)}
                            disabled={procesandoId === r.id}
                            className={`p-2 rounded-lg ${muted} hover:text-red-500 hover:bg-red-500/10`}
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
