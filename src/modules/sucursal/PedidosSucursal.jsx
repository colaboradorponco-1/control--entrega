import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { pedidosRepository } from '../../repositories/pedidosRepository';
import { authRepository } from '../../repositories/AuthRepository';
import { evidenciasRepository } from '../../repositories/evidenciasRepository';
import {
  LogOut, Sun, Moon, Plus, X, ArrowLeft, CheckCircle, AlertCircle,
  ShoppingCart, PackageCheck, Truck, Loader2, CalendarDays, Ban,
  Camera, User, MapPin, FileCheck2, Images
} from 'lucide-react';
import FirmaCanvas from '../../components/FirmaCanvas';
import SelectorFoto from '../../components/SelectorFoto';
import FotosObservaciones from '../../components/FotosObservaciones';

const ESTADOS = {
  PENDIENTE: { label: 'Pendiente', badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: ShoppingCart },
  EN_PREPARACION: { label: 'En preparación', badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: PackageCheck },
  LISTO: { label: 'Listo', badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: PackageCheck },
  RECOGIDO: { label: 'En camino', badge: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20', icon: Truck },
  ENTREGADO: { label: 'Entregado', badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: CheckCircle },
  CANCELADO: { label: 'Cancelado', badge: 'bg-red-500/10 text-red-500 border-red-500/20', icon: Ban },
};

const hoyISO = () => new Date().toISOString().split('T')[0];

export default function PedidosSucursal() {
  const { perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const [modalNuevo, setModalNuevo] = useState(false);
  const [form, setForm] = useState({ unidades: '', fecha: hoyISO(), observaciones: '' });

  const [recibiendo, setRecibiendo] = useState(null);
  const [formRecepcion, setFormRecepcion] = useState({
    unidades_recibidas: '',
    recibido_por: '',
    observaciones: '',
  });
  const [foto, setFoto] = useState(null);
  const [fotosExtra, setFotosExtra] = useState([]);
  const [firma, setFirma] = useState(null);
  const [ubicacion, setUbicacion] = useState(null);
  const [viendoEvidencia, setViendoEvidencia] = useState(null);

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500 focus:ring-amber-500/20'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-amber-500/20';
  const label = darkMode ? 'text-slate-300' : 'text-gray-600';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';
  const bordeInput = darkMode ? 'border-slate-700 hover:border-slate-600' : 'border-gray-300 hover:border-gray-400';

  const cargar = async () => {
    try {
      setCargando(true);
      setPedidos(await pedidosRepository.listar());
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudieron cargar los pedidos' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(null), 5000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const activos = useMemo(() => pedidos.filter((p) => !['ENTREGADO', 'CANCELADO'].includes(p.estado)), [pedidos]);
  const historicos = useMemo(() => pedidos.filter((p) => ['ENTREGADO', 'CANCELADO'].includes(p.estado)), [pedidos]);

  const handleCrear = async (e) => {
    e.preventDefault();

    const unidades = Number(form.unidades);

    if (!unidades || unidades <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresa cuántas unidades necesitas' });
      return;
    }

    try {
      setEnviando(true);
      await pedidosRepository.crear(form);
      setMensaje({ tipo: 'exito', texto: `Pedido de ${unidades} unidades enviado a la planta` });
      setForm({ unidades: '', fecha: hoyISO(), observaciones: '' });
      setModalNuevo(false);
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo enviar el pedido' });
    } finally {
      setEnviando(false);
    }
  };

  const handleCancelar = async (p) => {
    if (!window.confirm(`¿Cancelar el pedido de ${p.unidades} unidades?`)) return;
    try {
      await pedidosRepository.cancelar(p.id);
      setMensaje({ tipo: 'exito', texto: 'Pedido cancelado' });
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo cancelar' });
    }
  };

  const abrirRecepcion = (p) => {
    setRecibiendo(p);
    setFormRecepcion({
      unidades_recibidas: String(p.unidades),
      recibido_por: perfil?.nombre_completo || '',
      observaciones: '',
    });
    setFoto(null);
    setFirma(null);
    setUbicacion(null);
  };

  // La ubicacion es un extra: si el celular no la da, se sigue
  // sin ella, porque la foto y la firma ya son la prueba.
  const pedirUbicacion = () => {
    if (!navigator.geolocation) {
      setMensaje({ tipo: 'aviso', texto: 'Este celular no puede compartir la ubicación' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUbicacion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => setMensaje({ tipo: 'aviso', texto: 'No se pudo tomar la ubicación, podés confirmar igual' }),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleRecepcion = async (e) => {
    e.preventDefault();

    const unidades = Number(formRecepcion.unidades_recibidas);
    if (Number.isNaN(unidades) || unidades < 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresa las unidades recibidas' });
      return;
    }
    if (!formRecepcion.recibido_por.trim()) {
      setMensaje({ tipo: 'error', texto: 'Escribe el nombre de quien recibió el pedido' });
      return;
    }
    if (!foto) {
      setMensaje({ tipo: 'error', texto: 'Adjunta la foto de la entrega' });
      return;
    }
    if (!firma) {
      setMensaje({ tipo: 'error', texto: 'Falta la firma de quien recibió' });
      return;
    }

    const faltantes = unidades < recibiendo.unidades;

    try {
      setEnviando(true);
      await pedidosRepository.confirmarRecepcion(recibiendo.id, {
        unidades_recibidas: unidades,
        recibido_por: formRecepcion.recibido_por,
        observaciones: formRecepcion.observaciones,
        fotosExtra,
        foto,
        firma: evidenciasRepository.dataUrlABlob(firma),
        ubicacion,
      });

      setMensaje({
        tipo: faltantes ? 'aviso' : 'exito',
        texto: faltantes
          ? `Recepción registrada con faltantes: pediste ${recibiendo.unidades} y recibiste ${unidades}`
          : 'Recepción registrada con foto y firma. El pedido quedó entregado.',
      });
      setRecibiendo(null);
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo registrar la recepción' });
    } finally {
      setEnviando(false);
    }
  };

  // Abrir la foto o la firma de una entrega ya hecha
  const verEvidencia = async (tipo, ruta) => {
    try {
      const url = await evidenciasRepository.url(ruta);
      if (url) setViendoEvidencia({ tipo, url });
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo abrir la evidencia' });
    }
  };

  const renderPedido = (p) => {
    const est = ESTADOS[p.estado] || ESTADOS.PENDIENTE;
    const Icono = est.icon;
    const recepcion = p.pedido_recepciones?.[0];
    // Solo se cuenta lo que ya salio de la planta, que es lo unico
    // que la base acepta como entregado.
    const falta = p.estado === 'RECOGIDO';

    return (
      <div key={p.id} className={`${card} border rounded-2xl p-4`}>
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
            <Icono size={17} className="text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border ${est.badge}`}>
                {est.label}
              </span>
              <span className={`text-[11px] ${muted}`}>
                #{p.id} · {new Date(p.creado_en).toLocaleDateString('es-BO')}
              </span>
            </div>

            <p className={`mt-2 text-sm font-bold ${strong}`}>
              {p.unidades} unidades
            </p>

            <p className={`mt-1 flex items-center gap-1.5 text-xs ${muted}`}>
              <CalendarDays size={12} /> Para el {new Date(`${p.fecha}T00:00:00`).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>

            {p.observaciones && (
              <p className={`mt-2 text-xs italic ${muted}`}>“{p.observaciones}”</p>
            )}

            {recepcion && (
              <div className={`mt-3 p-3 rounded-xl border ${darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Recibido</p>
                <p className={`text-xs mt-1 ${normal}`}>
                  {recepcion.unidades_recibidas} unidades
                  {' · '}
                  {new Date(recepcion.recibido_en).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
                {recepcion.faltantes && (
                  <p className="text-xs font-bold text-amber-500 mt-1">
                    Con faltantes: se pidieron {p.unidades} y llegaron {recepcion.unidades_recibidas}
                  </p>
                )}
                {recepcion.observaciones && (
                  <p className={`text-xs italic mt-1 ${muted}`}>“{recepcion.observaciones}”</p>
                )}
                {recepcion.recibido_por_nombre && (
                  <p className={`text-xs mt-1 ${normal}`}>
                    Recibió: <span className="font-bold">{recepcion.recibido_por_nombre}</span>
                  </p>
                )}
                {(recepcion.foto_url || recepcion.firma_url || recepcion.fotos_extra?.length > 0) && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {recepcion.foto_url && (
                      <button
                        onClick={() => verEvidencia('Foto de la entrega', recepcion.foto_url)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${input}`}
                      >
                        <Camera size={12} /> Ver foto
                      </button>
                    )}
                    {recepcion.firma_url && (
                      <button
                        onClick={() => verEvidencia('Firma de recepción', recepcion.firma_url)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${input}`}
                      >
                        <FileCheck2 size={12} /> Ver firma
                      </button>
                    )}
                    {recepcion.fotos_extra?.length > 0 && (
                      <button
                        onClick={() => verEvidencia(`Fotos de apoyo (${recepcion.fotos_extra.length})`, recepcion.fotos_extra[0])}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${input}`}
                      >
                        <Images size={12} /> +{recepcion.fotos_extra.length} fotos
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {falta && (
              <button
                onClick={() => abrirRecepcion(p)}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition shadow-lg shadow-emerald-500/20"
              >
                <PackageCheck size={16} /> Recibir pedido
              </button>
            )}

            {p.estado === 'PENDIENTE' && (
              <button
                onClick={() => handleCancelar(p)}
                className={`mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition ${darkMode ? 'border-slate-800 text-slate-400 hover:bg-slate-800' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
              >
                <Ban size={14} /> Cancelar pedido
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <header className={`sticky top-0 z-20 border-b backdrop-blur-xl ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-gray-200'}`}>
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/sucursal')}
              className={`p-2.5 rounded-xl border transition ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'}`}
              aria-label="Volver"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="p-2 bg-purple-500/15 rounded-xl border border-purple-500/25">
                <ShoppingCart size={18} className="text-purple-500" />
              </div>
              <div className="min-w-0">
                <h1 className={`text-base md:text-xl font-black tracking-tight truncate ${strong}`}>Mis Pedidos</h1>
                <p className={`text-[10px] md:text-xs font-medium ${muted}`}>
                  {perfil?.sucursales?.nombre || 'Mi sucursal'}
                </p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`p-2.5 rounded-xl border transition ${darkMode ? 'bg-slate-900 border-slate-800 text-amber-400' : 'bg-gray-50 border-gray-300 text-amber-500'}`}
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() => authRepository.logout()}
              className="p-2.5 rounded-xl bg-red-950/50 border border-red-800/50 text-red-300 transition"
              aria-label="Salir"
            >
              <LogOut size={18} />
            </button>
            <button
              onClick={() => setModalNuevo(true)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-3 md:px-4 py-2.5 rounded-xl text-sm font-bold transition shadow-lg shadow-purple-600/25"
            >
              <Plus size={16} /> <span className="hidden sm:inline">Pedir</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-5 space-y-5">
        {mensaje && (
          <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
            mensaje.tipo === 'error'
              ? 'bg-red-950/40 border-red-800/50 text-red-300'
              : mensaje.tipo === 'aviso'
                ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
          }`}>
            {mensaje.tipo === 'error' ? <AlertCircle size={18} className="shrink-0 mt-0.5" /> : <CheckCircle size={18} className="shrink-0 mt-0.5" />}
            <p className="text-sm font-semibold">{mensaje.texto}</p>
          </div>
        )}

        {cargando ? (
          <div className={`flex items-center justify-center gap-2 py-20 ${muted}`}>
            <Loader2 size={20} className="animate-spin" /> Cargando pedidos...
          </div>
        ) : (
          <>
            <section>
              <h2 className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${muted}`}>
                Pedidos activos ({activos.length})
              </h2>
              {activos.length === 0 ? (
                <div className={`${card} border rounded-2xl py-12 text-center ${muted}`}>
                  <ShoppingCart size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-semibold">No tenés pedidos activos</p>
                  <p className="text-xs mt-1">Usá el botón Pedir para solicitar pollo a la planta</p>
                </div>
              ) : (
                <div className="space-y-2.5">{activos.map(renderPedido)}</div>
              )}
            </section>

            {historicos.length > 0 && (
              <section>
                <h2 className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${muted}`}>
                  Historial ({historicos.length})
                </h2>
                <div className="space-y-2.5 opacity-80">{historicos.map(renderPedido)}</div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Modal nuevo pedido */}
      {modalNuevo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className={`${card} border rounded-2xl w-full max-w-md p-5 md:p-6 shadow-2xl`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className={`text-lg font-black ${strong}`}>Nuevo Pedido</h2>
              <button onClick={() => setModalNuevo(false)} className={`p-2 rounded-xl ${muted} hover:bg-slate-500/10`} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCrear} className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  ¿Cuántas unidades necesitás? *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={form.unidades}
                  onChange={(e) => setForm({ ...form, unidades: e.target.value })}
                  placeholder="Ej: 120"
                  autoFocus
                  className={`w-full px-4 py-3 border rounded-xl text-lg font-bold outline-none focus:ring-2 transition ${input}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  ¿Para qué día lo necesitás?
                </label>
                <input
                  type="date"
                  min={hoyISO()}
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                  className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Observaciones
                </label>
                <textarea
                  rows={2}
                  value={form.observaciones}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  placeholder="Ej: pollo para el fin de semana"
                  className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModalNuevo(false)} className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold border ${input}`}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white px-4 py-3 rounded-xl text-sm font-bold transition"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
                  Enviar pedido
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal recepción con evidencia */}
      {recibiendo && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className={`${card} border rounded-2xl w-full max-w-md p-5 md:p-6 shadow-2xl my-4`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className={`text-lg font-black ${strong}`}>Recibir Pedido #{recibiendo.id}</h2>
              <button onClick={() => setRecibiendo(null)} className={`p-2 rounded-xl ${muted} hover:bg-slate-500/10`} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <p className={`text-xs mb-5 ${muted}`}>
              Pediste <span className={`font-bold ${normal}`}>{recibiendo.unidades} unidades</span>. Contá lo que llegó y firmá el comprobante.
            </p>

            <form onSubmit={handleRecepcion} className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Unidades recibidas *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={formRecepcion.unidades_recibidas}
                  onChange={(e) => setFormRecepcion({ ...formRecepcion, unidades_recibidas: e.target.value })}
                  autoFocus
                  className={`w-full px-4 py-3 border rounded-xl text-lg font-bold outline-none focus:ring-2 transition ${input}`}
                />
                {Number(formRecepcion.unidades_recibidas) < recibiendo.unidades && (
                  <p className="mt-1.5 text-[11px] font-bold text-amber-500">
                    Faltan {recibiendo.unidades - Number(formRecepcion.unidades_recibidas)} unidades. Quedará registrado.
                  </p>
                )}
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
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
                <p className={`mt-1.5 text-[11px] ${muted}`}>Si no sos vos, poné el nombre de quien recibió de verdad.</p>
              </div>

              <SelectorFoto
                etiqueta="Foto de la entrega"
                ayuda="Puedes tomarla con la camara o buscarla en la galeria"
                theme={{ borde: bordeInput, texto: label, tenue: muted, hoja: card }}
                onSeleccionar={setFoto}
                onError={(texto) => setMensaje({ tipo: 'error', texto })}
              />

              <FirmaCanvas
                titulo="Firma de quien recibe"
                theme={{
                  card: 'bg-white',
                  borde: 'border-slate-300',
                  texto: label,
                  tenue: muted,
                }}
                onCambio={(dataUrl) => setFirma(dataUrl)}
              />

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Observaciones
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
                theme={{ borde: bordeInput, texto: label, tenue: muted, hoja: card }}
              />

              <button
                type="button"
                onClick={pedirUbicacion}
                className={`flex items-center gap-2 text-[11px] font-semibold ${ubicacion ? 'text-emerald-500' : muted}`}
              >
                <MapPin size={13} />
                {ubicacion
                  ? 'Ubicación registrada'
                  : 'Agregar ubicación (opcional)'}
              </button>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setRecibiendo(null)} className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold border ${input}`}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white px-4 py-3 rounded-xl text-sm font-bold transition shadow-lg shadow-emerald-500/20"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <FileCheck2 size={16} />}
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
          <p className={`text-white text-sm font-bold mb-3`}>{viendoEvidencia.tipo}</p>
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
    </div>
  );
}
