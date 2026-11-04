import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { sucursalRepository } from '../../repositories/sucursalRepository';
import { evidenciasRepository } from '../../repositories/evidenciasRepository';
import {
  CheckCircle2, Clock, AlertCircle, RefreshCw, Camera, FileCheck2,
  Images, User, X, Loader2, PackageCheck,
} from 'lucide-react';
import FirmaCanvas from '../../components/FirmaCanvas';
import SelectorFoto from '../../components/SelectorFoto';
import FotosObservaciones from '../../components/FotosObservaciones';

export default function EntregasDirectas() {
  const { perfil } = useAuth();
  const { darkMode } = useTheme();
  const [entregas, setEntregas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [recibiendo, setRecibiendo] = useState(null);
  const [formRecepcion, setFormRecepcion] = useState({ recibido_por: '', observaciones: '' });
  const [foto, setFoto] = useState(null);
  const [fotosExtra, setFotosExtra] = useState([]);
  const [firma, setFirma] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [viendoEvidencia, setViendoEvidencia] = useState(null);

  const cargarEntregas = useCallback(async ({ silencioso = false } = {}) => {
    if (!perfil?.sucursal_id) {
      setEntregas([]);
      setCargando(false);
      return;
    }
    try {
      if (!silencioso) setCargando(true);
      const data = await sucursalRepository.obtenerEntregasPorSucursal(perfil.sucursal_id);
      setEntregas(data);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudieron cargar las entregas.' });
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [perfil]);

  useEffect(() => {
    cargarEntregas();
  }, [cargarEntregas]);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(null), 5000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const abrirRecepcion = (fila) => {
    setRecibiendo(fila);
    setFormRecepcion({
      recibido_por: perfil?.nombre_completo || '',
      observaciones: '',
    });
    setFoto(null);
    setFotosExtra([]);
    setFirma(null);
  };

  const handleConfirmar = async (e) => {
    e.preventDefault();

    if (!formRecepcion.recibido_por.trim()) {
      setMensaje({ tipo: 'error', texto: 'Escribe el nombre de quien recibió la entrega.' });
      return;
    }
    if (!foto) {
      setMensaje({ tipo: 'error', texto: 'Adjunta la foto de la entrega.' });
      return;
    }
    if (!firma) {
      setMensaje({ tipo: 'error', texto: 'Falta la firma de quien recibió.' });
      return;
    }

    try {
      setEnviando(true);
      await sucursalRepository.confirmarEntrega(recibiendo.id, {
        observaciones: formRecepcion.observaciones,
        recibido_por: formRecepcion.recibido_por,
        foto,
        firma: evidenciasRepository.dataUrlABlob(firma),
        fotosExtra,
      });
      setMensaje({ tipo: 'exito', texto: 'Recepción confirmada con foto y firma.' });
      setRecibiendo(null);
      await cargarEntregas({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo confirmar la recepción.' });
    } finally {
      setEnviando(false);
    }
  };

  const verEvidencia = async (tipo, ruta) => {
    try {
      const url = await evidenciasRepository.url(ruta);
      if (url) setViendoEvidencia({ tipo, url });
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo abrir la evidencia.' });
    }
  };

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const tableHead = darkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-gray-50 text-gray-600 border-gray-200';
  const rowHover = darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50';
  const divider = darkMode ? 'border-slate-800' : 'border-gray-200';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500 focus:ring-amber-500/20'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-amber-500/20';
  const bordeInput = darkMode ? 'border-slate-700 hover:border-slate-600' : 'border-gray-300 hover:border-gray-400';

  return (
    <section className={`p-5 md:p-6 rounded-2xl shadow border transition-colors duration-300 ${card}`}>
      <h2 className={`text-lg font-bold mb-6 border-b pb-3 flex flex-wrap items-center justify-between gap-2 ${strong} ${divider}`}>
        <span>Entregas directas de planta</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg border border-emerald-500/20">
            {entregas.length} registros
          </span>
          <button
            onClick={async () => {
              setActualizando(true);
              await cargarEntregas({ silencioso: true });
              setActualizando(false);
            }}
            disabled={actualizando || cargando}
            aria-label="Actualizar entregas"
            title="Actualizar entregas"
            className={`p-2 rounded-lg border transition disabled:opacity-50 ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800' : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'}`}
          >
            <RefreshCw size={15} className={actualizando ? 'animate-spin' : ''} />
          </button>
        </div>
      </h2>

      {mensaje && (
        <div className={`mb-4 p-3 rounded-xl border flex items-center gap-2 text-sm ${mensaje.tipo === 'exito' ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200' : 'bg-red-950/50 border-red-500/50 text-red-200'}`}>
          {mensaje.tipo === 'exito' ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
          <span>{mensaje.texto}</span>
        </div>
      )}

      {cargando ? (
        <p className={`text-center py-12 ${muted}`}>Cargando despachos...</p>
      ) : entregas.length === 0 ? (
        <p className={`text-center py-12 ${muted}`}>No hay despachos directos registrados para esta sucursal.</p>
      ) : (
        <div className={`overflow-x-auto rounded-xl border -mx-5 md:mx-0 ${divider}`}>
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className={`text-xs font-bold uppercase tracking-wider sticky top-0 border-b ${tableHead}`}>
                <th className="p-3 md:p-3.5">Hora</th>
                <th className="p-3 md:p-3.5">Unidades</th>
                <th className="p-3 md:p-3.5">Kilos</th>
                <th className="p-3 md:p-3.5">Estado</th>
                <th className="p-3 md:p-3.5 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className={`divide-y text-sm ${darkMode ? 'divide-slate-800' : 'divide-gray-200'} ${normal}`}>
              {entregas.map((row) => (
                <tr key={row.id} className={`transition ${rowHover}`}>
                  <td className={`p-3 md:p-3.5 font-medium ${muted}`}>
                    {new Date(row.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="p-3 md:p-3.5">{row.unidades} u</td>
                  <td className={`p-3 md:p-3.5 font-bold ${strong}`}>{row.kilos} kg</td>
                  <td className="p-3 md:p-3.5">
                    {row.estado_recepcion === 'RECIBIDO' ? (
                      <div className="space-y-1.5">
                        <span className="px-3 py-1 text-xs rounded-full font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 inline-flex items-center gap-1.5">
                          <CheckCircle2 size={14} /> Confirmado
                        </span>
                        {row.recibido_por_nombre && (
                          <p className={`text-[11px] ${muted}`}>
                            Recibió: <span className="font-bold">{row.recibido_por_nombre}</span>
                            {row.recibido_en
                              ? ` · ${new Date(row.recibido_en).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                              : ''}
                          </p>
                        )}
                        {row.observaciones && (
                          <p className={`text-[11px] italic ${muted}`}>“{row.observaciones}”</p>
                        )}
                        {(row.recibido_foto_url || row.recibido_firma_url) && (
                          <div className="flex flex-wrap gap-1.5">
                            {row.recibido_foto_url && (
                              <button
                                onClick={() => verEvidencia('Foto de la entrega', row.recibido_foto_url)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition ${input}`}
                              >
                                <Camera size={12} /> Ver foto
                              </button>
                            )}
                            {row.recibido_firma_url && (
                              <button
                                onClick={() => verEvidencia('Firma de recepción', row.recibido_firma_url)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition ${input}`}
                              >
                                <FileCheck2 size={12} /> Ver firma
                              </button>
                            )}
                            {row.fotos_extra_recepcion?.length > 0 && (
                              <button
                                onClick={() => verEvidencia(`Fotos de apoyo (${row.fotos_extra_recepcion.length})`, row.fotos_extra_recepcion[0])}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition ${input}`}
                              >
                                <Images size={12} /> +{row.fotos_extra_recepcion.length} fotos
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="px-3 py-1 text-xs rounded-full font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 inline-flex items-center gap-1.5">
                        <Clock size={14} /> En Tránsito
                      </span>
                    )}
                  </td>
                  <td className="p-3 md:p-3.5 text-center">
                    {row.estado_recepcion !== 'RECIBIDO' && (
                      <button
                        onClick={() => abrirRecepcion(row)}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-3 md:px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-600/25 uppercase tracking-wide whitespace-nowrap"
                      >
                        Recibir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de recepcion con evidencia */}
      {recibiendo && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className={`${card} border rounded-2xl w-full max-w-md p-5 md:p-6 shadow-2xl my-4`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className={`text-lg font-black ${strong}`}>Recibir entrega #{recibiendo.id}</h2>
              <button onClick={() => setRecibiendo(null)} className={`p-2 rounded-xl ${muted} hover:bg-slate-500/10`} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <p className={`text-xs mb-5 ${muted}`}>
              Llegaron <span className={`font-bold ${normal}`}>{recibiendo.unidades} u</span>
              {' · '}
              <span className={`font-bold ${normal}`}>{recibiendo.kilos} kg</span>. Contá lo que llegó y firmá el comprobante.
            </p>

            <form onSubmit={handleConfirmar} className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${normal}`}>
                  Quién recibió *
                </label>
                <div className="relative">
                  <User size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${muted} pointer-events-none`} />
                  <input
                    type="text"
                    required
                    value={formRecepcion.recibido_por}
                    onChange={(e) => setFormRecepcion({ ...formRecepcion, recibido_por: e.target.value })}
                    placeholder="Nombre de quien recibió"
                    className={`w-full pl-10 pr-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
                  />
                </div>
              </div>

              <SelectorFoto
                etiqueta="Foto de la entrega"
                ayuda="Puedes tomarla con la camara o buscarla en la galeria"
                theme={{ borde: bordeInput, texto: normal, tenue: muted, hoja: card }}
                onSeleccionar={setFoto}
                onError={(texto) => setMensaje({ tipo: 'error', texto })}
              />

              <FirmaCanvas
                titulo="Firma de quien recibe"
                theme={{
                  card: 'bg-white',
                  borde: 'border-slate-300',
                  texto: normal,
                  tenue: muted,
                }}
                onCambio={(dataUrl) => setFirma(dataUrl)}
              />

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${normal}`}>
                  Observaciones (opcional)
                </label>
                <textarea
                  rows={2}
                  value={formRecepcion.observaciones}
                  onChange={(e) => setFormRecepcion({ ...formRecepcion, observaciones: e.target.value })}
                  placeholder="Ej: todo bien / faltaban 5 unidades / llegó frío"
                  className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
                />
              </div>

              <FotosObservaciones
                fotos={fotosExtra}
                onCambio={setFotosExtra}
                onError={(texto) => setMensaje({ tipo: 'error', texto })}
                theme={{ borde: bordeInput, texto: normal, tenue: muted, hoja: card }}
              />

              {/* Módulo futuro: la captura de ubicación (MapaUbicacion) se
                  activa en este rol cuando se implemente. Las columnas
                  de coordenadas ya existen en la base. */}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setRecibiendo(null)} className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold border ${input}`}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white px-4 py-3 rounded-xl text-sm font-bold transition shadow-lg shadow-emerald-500/20"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
                  Firmar y confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visor de evidencia */}
      {viendoEvidencia && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 bg-black/90"
          onClick={() => setViendoEvidencia(null)}
        >
          <p className="text-white text-sm font-bold mb-3">{viendoEvidencia.tipo}</p>
          <img
            src={viendoEvidencia.url}
            alt={viendoEvidencia.tipo}
            className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl"
          />
          <button className="mt-5 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold">
            Cerrar
          </button>
        </div>
      )}
    </section>
  );
}
