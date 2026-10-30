import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../config/supabaseClient';
import { authRepository } from '../../repositories/AuthRepository';
import {
  ArrowLeft, LogOut, Sun, Moon, Loader2, Plus, X,
  ClipboardList, CheckCircle, Trash2, AlertCircle, Archive, ArchiveRestore,
} from 'lucide-react';

export default function ReporteRosticero() {
  const { darkMode, toggleTheme } = useTheme();
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

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);
      // Cargar sucursales
      const { data: sucData } = await supabase.from('sucursales').select('id, nombre, sector').order('nombre');
      setSucursales(sucData || []);

      // Cargar reportes del usuario
      let query = supabase
        .from('reportes_rosticero')
        .select('*, sucursales(nombre, sector)')
        .order('fecha', { ascending: false })
        .limit(50);
      if (verArchivados) {
        query = query.eq('archivado', true);
      } else {
        query = query.eq('archivado', false);
      }
      const { data: repData, error: err } = await query;
      if (err) throw err;
      setReportes(repData || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos');
    } finally {
      setCargando(false);
    }
  }, [verArchivados]);

  useEffect(() => { cargar(); }, [cargar, verArchivados]);

  const totalPollosHornear = (Number(form.saldo_inicio_dia) || 0) + (Number(form.ingresos_dia) || 0);
  const pollosVendidos = totalPollosHornear - (Number(form.saldo_final_dia) || 0);

  const crearReporte = async (e) => {
    e.preventDefault();
    if (!form.sucursal_id || !form.fecha) {
      setError('Selecciona sucursal y fecha.');
      return;
    }
    try {
      setEnviando(true);
      setError(null);

      let firmaUrl = null;
      if (firma) {
        const fileName = 'rosticero-firma-' + Date.now() + '.png';
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('revisiones-videos')
          .upload(fileName, firma, { cacheControl: '3600', upsert: false });
        if (uploadErr) throw uploadErr;
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
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el reporte');
    } finally {
      setEnviando(false);
    }
  };

  const archivarReporte = async (id, archivado) => {
    try {
      setProcesandoId(id);
      await supabase.rpc('archivar_reporte_rosticero', {
        p_reporte_id: id,
        p_archivado: archivado,
      });
      setMensaje(archivado ? 'Reporte archivado.' : 'Reporte restaurado.');
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo archivar el reporte');
    } finally {
      setProcesandoId(null);
    }
  };

  const eliminarReporte = async (id) => {
    if (!window.confirm('¿Eliminar definitivamente este reporte? Esta acción no se puede deshacer.')) return;
    try {
      setProcesandoId(id);
      await supabase.rpc('eliminar_reporte_rosticero', { p_reporte_id: id });
      setMensaje('Reporte eliminado.');
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el reporte');
    } finally {
      setProcesandoId(null);
    }
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
          <p className={`text-sm ${muted}`}>Reporte diario de pollos rostizados por sucursal.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setVerArchivados((v) => !v)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${input}`}
            >
              {verArchivados ? 'Ver activos' : 'Ver archivados'}
            </button>
            <button
              onClick={() => setMostrarForm(true)}
              className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-purple-700"
            >
              <Plus size={16} /> Nuevo reporte
            </button>
          </div>
        </div>

        {mostrarForm && (
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
                    Pollos vend. según sistema
                    <input
                      type="number" min="0" step="1"
                      value={form.pollos_vendidos_sistema}
                      onChange={(e) => setForm({ ...form, pollos_vendidos_sistema: e.target.value })}
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
                    />
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

              <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                Firma (imagen)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFirma(e.target.files?.[0] || null)}
                  className={`mt-2 w-full rounded-xl border px-4 py-2 text-sm ${input}`}
                />
                {firma && (
                  <p className={`mt-1 text-[11px] ${muted}`}>{firma.name}</p>
                )}
              </label>

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
        ) : reportes.length === 0 ? (
          <div className={`${card} border rounded-2xl p-10 text-center`}>
            <ClipboardList size={40} className={`mx-auto mb-4 ${muted}`} />
            <p className={`font-bold mb-2 ${strong}`}>Sin reportes</p>
            <p className={`text-sm ${muted}`}>Aún no hay reportes de rosticero.</p>
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
                      <span className={`text-[10px] ${muted}`}>
                        {new Date(r.fecha).toLocaleDateString('es-BO')} · {r.hora_ingreso || '—'}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-[9px] ${muted}`}>Inicio</p>
                        <p className={`text-sm font-bold ${strong}`}>{r.saldo_inicio_dia}</p>
                      </div>
                      <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-[9px] ${muted}`}>Ingresos</p>
                        <p className={`text-sm font-bold ${strong}`}>{r.ingresos_dia}</p>
                      </div>
                      <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-[9px] ${muted}`}>Hornear</p>
                        <p className={`text-sm font-bold ${strong}`}>{r.total_pollos_hornear}</p>
                      </div>
                      <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-[9px] ${muted}`}>Final</p>
                        <p className={`text-sm font-bold ${strong}`}>{r.saldo_final_dia}</p>
                      </div>
                      <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-[9px] ${muted}`}>Vendidos</p>
                        <p className={`text-sm font-bold ${strong}`}>{r.pollos_vendidos}</p>
                      </div>
                      <div className={`rounded-lg p-2 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <p className={`text-[9px] ${muted}`}>Sistema</p>
                        <p className={`text-sm font-bold ${strong}`}>{r.pollos_vendidos_sistema ?? '—'}</p>
                      </div>
                    </div>
                    {(r.obs_pollos_enfermos || r.obs_pollos_pequenos || r.obs_otros) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.obs_pollos_enfermos && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-500/10 text-red-500">Pollos enfermos</span>}
                        {r.obs_pollos_pequenos && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-500">Pollos pequeños</span>}
                        {r.obs_otros && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-gray-500/10 text-gray-500">Otros</span>}
                      </div>
                    )}
                    {r.observaciones_detalle && (
                      <p className={`mt-2 text-xs italic ${muted}`}>“{r.observaciones_detalle}”</p>
                    )}
                    <p className={`mt-2 text-[10px] ${muted}`}>
                      Cajero: {r.cajero || '—'} · Supervisor: {r.supervisor || '—'} · Por: {r.creado_por_nombre || '—'}
                    </p>
                    {r.firma_url && (
                      <a
                        href={r.firma_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 hover:underline"
                      >
                        Ver firma
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
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
