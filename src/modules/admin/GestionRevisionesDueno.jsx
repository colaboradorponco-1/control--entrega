import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../config/supabaseClient';
import { authRepository } from '../../repositories/AuthRepository';
import { duenosRepository } from '../../repositories/duenosRepository';
import {
  ArrowLeft, LogOut, Sun, Moon, Loader2, Plus, X, FileText,
  AlertTriangle, DollarSign, Eye, CheckCircle, Clock, Crown, AlertCircle, Camera,
} from 'lucide-react';
import PanelNotificaciones from '../../components/PanelNotificaciones';

const TIPOS = [
  { valor: 'REVISION', label: 'Revisión' },
  { valor: 'MULTA', label: 'Multa' },
  { valor: 'OBSERVACION', label: 'Observación' },
  { valor: 'ALERTA', label: 'Alerta' },
];

export default function GestionRevisionesDueno() {
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [duenos, setDuenos] = useState([]);
  const [revisiones, setRevisiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const [form, setForm] = useState({
    dueno_id: '',
    sucursal_id: '',
    titulo: '',
    descripcion: '',
    tipo: 'REVISION',
    area_atencion_cliente: false,
    area_personal: false,
    area_comida: false,
    area_limpieza: false,
    area_infraestructura: false,
    documento_url: '',
  });
  const [videosFiles, setVideosFiles] = useState([]);
  const [sucursales, setSucursales] = useState([]);

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
      // Cargar dueños
      try {
        const duenosData = await duenosRepository.listar();
        setDuenos(duenosData || []);
        if (!duenosData || duenosData.length === 0) {
          setError('No se encontraron dueños registrados. Crea dueños primero en Gestión de Dueños.');
        }
      } catch (e) {
        setError('Error al cargar dueños: ' + (e.message || 'verifica que existan dueños'));
        setDuenos([]);
      }

      // Cargar sucursales
      const { data: sucData } = await supabase.from('sucursales').select('id, nombre, sector').order('nombre');
      setSucursales(sucData || []);

      // Cargar revisiones recientes
      const { data: revData, error: errRev } = await supabase
        .from('revisiones_dueno')
        .select('*')
        .order('creado_en', { ascending: false })
        .limit(50);
      if (errRev) throw errRev;
      setRevisiones(revData || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const crearRevision = async (e) => {
    e.preventDefault();
    if (!form.dueno_id || !form.titulo.trim() || !form.descripcion.trim()) {
      setError('Completa todos los campos obligatorios.');
      return;
    }
    try {
      setEnviando(true);
      setError(null);

      // Subir videos a Supabase Storage
      const videoUrls = await Promise.all(
        videosFiles.map(async (file) => {
          const fileName = `${Date.now()}-${file.name}`;
          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('revisiones-videos')
            .upload(fileName, file, { cacheControl: '3600', upsert: false });
          if (uploadErr) throw uploadErr;
          const { data: urlData } = supabase.storage
            .from('revisiones-videos')
            .getPublicUrl(uploadData.path);
          return urlData.publicUrl;
        })
      );

      const { error: err } = await supabase.rpc('crear_revision_dueno', {
        p_dueno_id: Number(form.dueno_id),
        p_titulo: form.titulo.trim(),
        p_descripcion: form.descripcion.trim(),
        p_tipo: form.tipo,
        p_sucursal_id: form.sucursal_id ? Number(form.sucursal_id) : null,
        p_area_atencion_cliente: form.area_atencion_cliente,
        p_area_personal: form.area_personal,
        p_area_comida: form.area_comida,
        p_area_limpieza: form.area_limpieza,
        p_area_infraestructura: form.area_infraestructura,
        p_documento_url: form.documento_url.trim() || null,
        p_videos: videoUrls,
      });
      if (err) throw err;
      setMensaje('✓ Revisión creada y notificada al dueño.');
      setForm({ dueno_id: '', sucursal_id: '', titulo: '', descripcion: '', tipo: 'REVISION', area_atencion_cliente: false, area_personal: false, area_comida: false, area_limpieza: false, area_infraestructura: false, documento_url: '' });
      setVideosFiles([]);
      setMostrarForm(false);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo crear la revisión');
    } finally {
      setEnviando(false);
    }
  };

  const severidadColor = (s) => {
    if (s === 'GRAVE') return 'text-red-500 bg-red-500/10';
    if (s === 'ADVERTENCIA') return 'text-amber-500 bg-amber-500/10';
    return 'text-blue-500 bg-blue-500/10';
  };

  const tipoIcono = (tipo) => {
    if (tipo === 'MULTA') return <DollarSign size={16} className="text-red-500" />;
    if (tipo === 'ALERTA') return <AlertTriangle size={16} className="text-amber-500" />;
    return <FileText size={16} className="text-blue-500" />;
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-800'}`}>
      <header className={`${card} border-b sticky top-0 z-30`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crown size={20} className="text-amber-500" />
            <h1 className={`font-black tracking-tight ${strong}`}>Revisiones y Multas</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/panel')} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Volver">
              <ArrowLeft size={18} />
            </button>
            <PanelNotificaciones rutaPedido="/admin" />
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
          <p className={`text-sm ${muted}`}>Crea revisiones y multas que se notifican al dueño.</p>
          <button
            onClick={() => setMostrarForm(true)}
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-purple-700"
          >
            <Plus size={16} /> Nueva revisión
          </button>
        </div>

        {/* Formulario */}
        {mostrarForm && (
          <div className={`mb-6 rounded-2xl border p-5 ${card}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-black ${strong}`}>Nueva revisión / multa</h2>
              <button onClick={() => setMostrarForm(false)} className={`p-2 rounded-lg ${muted} hover:bg-slate-500/10`}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={crearRevision} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Dueño *
                  <select
                    required
                    value={form.dueno_id}
                    onChange={(e) => setForm({ ...form, dueno_id: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  >
                    <option value="">Selecciona un dueño</option>
                    {duenos.length === 0 && (
                      <option value="" disabled>No hay dueños registrados</option>
                    )}
                    {duenos.map((d) => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                </label>
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Tipo
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  >
                    {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                  </select>
                </label>
              </div>

              <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                Título *
                <input
                  required
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  placeholder="Ej: Multa por faltantes recurrentes"
                />
              </label>

              <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                Descripción *
                <textarea
                  required
                  rows={4}
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  placeholder="Detalle de la revisión o multa..."
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Sucursal (opcional)
                  <select
                    value={form.sucursal_id}
                    onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  >
                    <option value="">Todas / General</option>
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}{s.sector ? ` · ${s.sector}` : ''}</option>
                    ))}
                  </select>
                </label>
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  URL del documento (opcional)
                  <input
                    value={form.documento_url}
                    onChange={(e) => setForm({ ...form, documento_url: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                    placeholder="https://..."
                  />
                </label>
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Videos de evidencia (opcional, máx. 50MB cada uno)
                  <input
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={(e) => setVideosFiles(Array.from(e.target.files || []))}
                    className={`mt-2 w-full rounded-xl border px-4 py-2 text-sm ${input}`}
                  />
                  {videosFiles.length > 0 && (
                    <p className={`mt-1 text-[11px] ${muted}`}>
                      {videosFiles.length} video(s) seleccionado(s): {videosFiles.map((f) => f.name).join(', ')}
                    </p>
                  )}
                </label>

                <div className={`rounded-xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-950/50' : 'border-gray-200 bg-gray-50'}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider ${muted} mb-3`}>Áreas afectadas</p>
                  <div className="flex flex-wrap gap-4">
                    <label className={`flex items-center gap-2 text-xs ${normal}`}>
                      <input
                        type="checkbox"
                        checked={form.area_atencion_cliente}
                        onChange={(e) => setForm({ ...form, area_atencion_cliente: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Atención al cliente
                    </label>
                    <label className={`flex items-center gap-2 text-xs ${normal}`}>
                      <input
                        type="checkbox"
                        checked={form.area_personal}
                        onChange={(e) => setForm({ ...form, area_personal: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Personal
                    </label>
                    <label className={`flex items-center gap-2 text-xs ${normal}`}>
                      <input
                        type="checkbox"
                        checked={form.area_comida}
                        onChange={(e) => setForm({ ...form, area_comida: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Comida
                    </label>
                    <label className={`flex items-center gap-2 text-xs ${normal}`}>
                      <input
                        type="checkbox"
                        checked={form.area_limpieza}
                        onChange={(e) => setForm({ ...form, area_limpieza: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Limpieza
                    </label>
                    <label className={`flex items-center gap-2 text-xs ${normal}`}>
                      <input
                        type="checkbox"
                        checked={form.area_infraestructura}
                        onChange={(e) => setForm({ ...form, area_infraestructura: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Infraestructura
                    </label>
                  </div>
                </div>

              </div>

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
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Crear y notificar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de revisiones */}
        {cargando ? (
          <div className="flex items-center justify-center gap-3 py-20">
            <Loader2 size={24} className="animate-spin text-amber-500" />
            <span className={muted}>Cargando...</span>
          </div>
        ) : revisiones.length === 0 ? (
          <div className={`${card} border rounded-2xl p-10 text-center`}>
            <FileText size={40} className={`mx-auto mb-4 ${muted}`} />
            <p className={`font-bold mb-2 ${strong}`}>Sin revisiones</p>
            <p className={`text-sm ${muted}`}>Aún no se han creado revisiones o multas.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {revisiones.map((r) => (
              <div key={r.id} className={`${card} border rounded-2xl p-4`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${severidadColor(r.severidad)}`}>
                    {tipoIcono(r.tipo)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${strong}`}>{r.titulo}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>
                        {r.tipo}
                      </span>
                      {r.leido ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                          <CheckCircle size={10} /> Leído
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-amber-500">
                          <Clock size={10} /> Pendiente
                        </span>
                      )}
                    </div>
                    <p className={`mt-1 text-xs ${muted}`}>
                      Dueño #{r.dueno_id} · {r.creado_por_nombre || 'Sistema'} · {new Date(r.creado_en).toLocaleString('es-BO')}
                    </p>

                    {r.documento_url && (
                      <a
                        href={r.documento_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 hover:underline"
                      >
                        <Eye size={12} /> Ver documento
                      </a>
                    )}
                    {r.sucursal_id && (
                      <p className={`text-[10px] ${muted} mt-0.5`}>
                        Sucursal #{r.sucursal_id}
                      </p>
                    )}
                    {(r.area_atencion_cliente || r.area_personal || r.area_comida || r.area_limpieza || r.area_infraestructura) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.area_atencion_cliente && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-500">Atención al cliente</span>}
                        {r.area_personal && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/10 text-purple-500">Personal</span>}
                        {r.area_comida && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-500">Comida</span>}
                        {r.area_limpieza && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500">Limpieza</span>}
                        {r.area_infraestructura && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500/10 text-gray-500">Infraestructura</span>}
                      </div>
                    )}
                    {r.videos?.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-blue-500">
                        <Camera size={12} /> {r.videos.length} video(s) adjunto(s)
                      </div>
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
