import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../config/supabaseClient';
import { authRepository } from '../../repositories/AuthRepository';
import PanelNotificaciones from '../../components/PanelNotificaciones';
import {
  AlertCircle, ArrowLeft, CheckCircle, Clock, DollarSign, Eye,
  Loader2, LogOut, Moon, RefreshCw, Sun, Upload, Video,
} from 'lucide-react';

const AREAS = [
  ['area_atencion_cliente', 'Atención al cliente'],
  ['area_personal', 'Personal'],
  ['area_comida', 'Comida'],
  ['area_limpieza', 'Limpieza'],
  ['area_infraestructura', 'Infraestructura'],
];

export default function BandejaRevisionesAyudante() {
  const { usuario } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const usuarioId = usuario?.id;
  const [revisiones, setRevisiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [evidencias, setEvidencias] = useState({});
  const [urls, setUrls] = useState({});

  const cargar = useCallback(async () => {
    if (!usuarioId) {
      setCargando(false);
      return;
    }
    try {
      setCargando(true);
      setError('');
      const { data, error: errorConsulta } = await supabase
        .from('revisiones_dueno')
        .select('*')
        .eq('ayudante_usuario_id', usuarioId)
        .eq('estado_flujo', 'PENDIENTE_AYUDANTE')
        .order('creado_en', { ascending: false });
      if (errorConsulta) throw errorConsulta;
      setRevisiones(data || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las tareas asignadas.');
    } finally {
      setCargando(false);
    }
  }, [usuarioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!usuarioId) return undefined;
    const canal = supabase
      .channel(`ayudante-revisiones-${usuarioId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'revisiones_dueno',
          filter: `ayudante_usuario_id=eq.${usuarioId}`,
        },
        cargar
      )
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [usuarioId, cargar]);

  const enviarEvidencia = async (e, revision) => {
    e.preventDefault();
    const archivo = evidencias[revision.id];
    const url = (urls[revision.id] || '').trim();
    if (Boolean(archivo) === Boolean(url)) {
      setError('Adjunta un video o ingresa su URL; elige solo una opción.');
      return;
    }
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      setError('Ingresa una URL válida que comience con http:// o https://.');
      return;
    }
    if (archivo && (!archivo.type.startsWith('video/') || archivo.size > 50 * 1024 * 1024)) {
      setError('El archivo debe ser un video de hasta 50 MB.');
      return;
    }

    try {
      setProcesandoId(revision.id);
      setError('');
      setMensaje('');
      let videoUrl = url;
      if (archivo) {
        const nombreSeguro = archivo.name.replace(/[^\w.-]/g, '_');
        const ruta = `${revision.id}/${usuarioId}/${nombreSeguro}`;
        const { data, error: errorCarga } = await supabase.storage
          .from('revisiones-videos')
          .upload(ruta, archivo, { cacheControl: '3600', upsert: true });
        if (errorCarga) throw errorCarga;
        const { data: urlPublica } = supabase.storage
          .from('revisiones-videos')
          .getPublicUrl(data.path);
        videoUrl = urlPublica.publicUrl;
      }

      const { error: errorEnvio } = await supabase.rpc('enviar_evidencia_revision_dueno', {
        p_revision_id: revision.id,
        p_video_url: videoUrl,
      });
      if (errorEnvio) throw errorEnvio;
      setMensaje('Evidencia enviada. El registro ya está disponible para el dueño.');
      setEvidencias((actuales) => {
        const siguiente = { ...actuales };
        delete siguiente[revision.id];
        return siguiente;
      });
      setUrls((actuales) => {
        const siguiente = { ...actuales };
        delete siguiente[revision.id];
        return siguiente;
      });
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo enviar la evidencia.');
    } finally {
      setProcesandoId(null);
    }
  };

  const card = darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-white';
  const input = darkMode
    ? 'border-slate-700 bg-slate-950 text-white placeholder-slate-500'
    : 'border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';

  return (
    <main className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-800'}`}>
      <header className={`${card} sticky top-0 z-30 border-b`}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Video size={20} className="text-amber-500" />
            <h1 className={`font-black ${strong}`}>Bandeja de revisiones asignadas</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/panel')} className={`rounded-xl border p-2.5 ${input}`} aria-label="Volver al panel">
              <ArrowLeft size={18} />
            </button>
            <PanelNotificaciones
              titulo="Avisos de tareas"
              textoVacio="No tienes avisos nuevos."
              rutaPedido="/ayudante/revisiones"
              mostrarSucursal
            />
            <button onClick={toggleTheme} className={`rounded-xl border p-2.5 ${input}`} aria-label="Cambiar tema">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={() => authRepository.logout()} className={`rounded-xl border p-2.5 ${input}`} aria-label="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={`text-xl font-black ${strong}`}>Tareas pendientes</h2>
            <p className={`mt-1 text-sm ${muted}`}>Revisa los datos y agrega únicamente el video o su URL. No puedes cambiar el contenido del registro.</p>
          </div>
          <button
            type="button"
            onClick={cargar}
            disabled={cargando}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${input}`}
          >
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {mensaje && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">
            <CheckCircle size={16} /> {mensaje}
          </div>
        )}

        {cargando ? (
          <div className={`flex items-center justify-center gap-2 py-16 ${muted}`}>
            <Loader2 size={20} className="animate-spin" /> Cargando tareas...
          </div>
        ) : revisiones.length === 0 ? (
          <div className={`${card} rounded-2xl border p-10 text-center`}>
            <CheckCircle size={32} className="mx-auto mb-3 text-emerald-500" />
            <p className={`font-bold ${strong}`}>No tienes tareas pendientes</p>
            <p className={`mt-1 text-sm ${muted}`}>Cuando te asignen una revisión, multa, observación o alerta aparecerá aquí.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {revisiones.map((revision) => (
              <article key={revision.id} className={`${card} rounded-2xl border p-5`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`font-black ${strong}`}>{revision.titulo}</h3>
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">{revision.tipo}</span>
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-500">
                        <Clock size={12} /> Pendiente de evidencia
                      </span>
                    </div>
                    <p className={`mt-1 text-xs ${muted}`}>
                      Dueño #{revision.dueno_id}
                      {revision.sucursal_id ? ` · Sucursal #${revision.sucursal_id}` : ' · General'}
                      {revision.creado_en ? ` · ${new Date(revision.creado_en).toLocaleString('es-BO')}` : ''}
                    </p>
                  </div>
                </div>

                <p className={`mt-4 whitespace-pre-wrap text-sm ${normal}`}>{revision.descripcion}</p>
                {revision.tipo === 'MULTA' && revision.monto_multa != null && (
                  <p className="mt-3 flex items-center gap-1.5 font-bold text-red-500">
                    <DollarSign size={16} /> Monto de multa: Bs. {Number(revision.monto_multa).toFixed(2)}
                  </p>
                )}
                {revision.documento_url && (
                  <a
                    href={revision.documento_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-600 hover:underline"
                  >
                    <Eye size={14} /> Ver documento
                  </a>
                )}
                {AREAS.some(([campo]) => revision[campo]) && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {AREAS.filter(([campo]) => revision[campo]).map(([, etiqueta]) => (
                      <span key={etiqueta} className="rounded bg-slate-500/10 px-2 py-1 text-[10px] font-semibold">{etiqueta}</span>
                    ))}
                  </div>
                )}

                <form onSubmit={(e) => enviarEvidencia(e, revision)} className={`mt-5 grid gap-3 rounded-xl border p-4 ${darkMode ? 'border-slate-800 bg-slate-950/50' : 'border-gray-200 bg-gray-50'}`}>
                  <label className={`text-xs font-bold ${normal}`}>
                    Video (máximo 50 MB)
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => {
                        setEvidencias((actuales) => ({ ...actuales, [revision.id]: e.target.files?.[0] || null }));
                        setUrls((actuales) => ({ ...actuales, [revision.id]: '' }));
                      }}
                      className={`mt-1.5 block w-full rounded-lg border px-3 py-2 text-sm ${input}`}
                    />
                  </label>
                  <label className={`text-xs font-bold ${normal}`}>
                    O URL del video
                    <input
                      type="url"
                      value={urls[revision.id] || ''}
                      onChange={(e) => {
                        setUrls((actuales) => ({ ...actuales, [revision.id]: e.target.value }));
                        setEvidencias((actuales) => ({ ...actuales, [revision.id]: null }));
                      }}
                      placeholder="https://..."
                      className={`mt-1.5 block w-full rounded-lg border px-3 py-2 text-sm ${input}`}
                    />
                  </label>
                  {evidencias[revision.id] && (
                    <p className={`text-xs ${muted}`}>Video seleccionado: {evidencias[revision.id].name}</p>
                  )}
                  <button
                    type="submit"
                    disabled={procesandoId === revision.id}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-purple-700 disabled:opacity-60"
                  >
                    {procesandoId === revision.id ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Enviar evidencia al dueño
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
