import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../config/supabaseClient';
import { authRepository } from '../../repositories/AuthRepository';
import {
  ArrowLeft, LogOut, Sun, Moon, Loader2, Plus, X, FileText,
  AlertTriangle, DollarSign, Eye, CheckCircle, Clock, Crown, AlertCircle,
} from 'lucide-react';
import PanelNotificaciones from '../../components/PanelNotificaciones';

const TIPOS = [
  { valor: 'REVISION', label: 'Revisión' },
  { valor: 'MULTA', label: 'Multa' },
  { valor: 'OBSERVACION', label: 'Observación' },
  { valor: 'ALERTA', label: 'Alerta' },
];

const SEVERIDADES = [
  { valor: 'INFO', label: 'Informativa', color: 'text-blue-500' },
  { valor: 'ADVERTENCIA', label: 'Advertencia', color: 'text-amber-500' },
  { valor: 'GRAVE', label: 'Grave', color: 'text-red-500' },
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
    titulo: '',
    descripcion: '',
    tipo: 'REVISION',
    severidad: 'INFO',
    monto_multa: '',
    documento_url: '',
  });

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);
      // Cargar dueños
      const { data: duenosData, error: errDuenos } = await supabase
        .from('duenos')
        .select('id, nombre, empresa')
        .order('nombre');
      if (errDuenos) throw errDuenos;
      setDuenos(duenosData || []);

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
      const { error: err } = await supabase.rpc('crear_revision_dueno', {
        p_dueno_id: Number(form.dueno_id),
        p_titulo: form.titulo.trim(),
        p_descripcion: form.descripcion.trim(),
        p_tipo: form.tipo,
        p_severidad: form.severidad,
        p_monto_multa: form.monto_multa ? Number(form.monto_multa) : null,
        p_documento_url: form.documento_url.trim() || null,
      });
      if (err) throw err;
      setMensaje('✓ Revisión creada y notificada al dueño.');
      setForm({ dueno_id: '', titulo: '', descripcion: '', tipo: 'REVISION', severidad: 'INFO', monto_multa: '', documento_url: '' });
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
                    {duenos.map((d) => (
                      <option key={d.id} value={d.id}>{d.nombre}{d.empresa ? ` · ${d.empresa}` : ''}</option>
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Severidad
                  <select
                    value={form.severidad}
                    onChange={(e) => setForm({ ...form, severidad: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  >
                    {SEVERIDADES.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
                  </select>
                </label>
                {form.tipo === 'MULTA' && (
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                    Monto (Bs)
                    <input
                      type="number"
                      step="0.01"
                      value={form.monto_multa}
                      onChange={(e) => setForm({ ...form, monto_multa: e.target.value })}
                      className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                      placeholder="0.00"
                    />
                  </label>
                )}
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  URL del documento (opcional)
                  <input
                    value={form.documento_url}
                    onChange={(e) => setForm({ ...form, documento_url: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                    placeholder="https://..."
                  />
                </label>
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
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${severidadColor(r.severidad)}`}>
                        {r.severidad}
                      </span>
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
                    {r.monto_multa && (
                      <p className="mt-1 text-sm font-bold text-red-500">
                        Monto: Bs. {Number(r.monto_multa).toFixed(2)}
                      </p>
                    )}
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
