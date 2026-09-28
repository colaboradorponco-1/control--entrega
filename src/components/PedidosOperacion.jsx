import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { pedidosRepository } from '../repositories/pedidosRepository';
import { authRepository } from '../repositories/AuthRepository';
import FirmaCanvas from './FirmaCanvas';
import SelectorFoto from './SelectorFoto';
import FotosObservaciones from './FotosObservaciones';
import {
  LogOut, Sun, Moon, ArrowLeft, CheckCircle, AlertCircle,
  PackageCheck, Loader2, Store, CalendarDays, ShoppingCart, X, Truck,
  FileCheck2
} from 'lucide-react';

const ESTADOS = {
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
  RECOGIDO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

const ORDEN = ['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'RECOGIDO', 'ENTREGADO', 'CANCELADO'];

const BADGE = {
  PENDIENTE: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  EN_PREPARACION: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  LISTO: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  RECOGIDO: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  ENTREGADO: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  CANCELADO: 'bg-red-500/10 text-red-500 border-red-500/20',
};

// Pantalla compartida por planta y despachador
// config.acciones: lista de { estado, texto, siguiente, color, icono }
export default function PedidosProduccion({ titulo, subtitulo, color, acciones }) {
  const { darkMode, toggleTheme } = useTheme();
  const { perfil } = useAuth();
  const navigate = useNavigate();

  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [procesando, setProcesando] = useState(null);
  const [pesando, setPesando] = useState(null);
  const [carga, setCarga] = useState({
    unidades: '', kilos: '', precio_por_kilo: '',
    transportista: '', entregado_por: '', observaciones: '',
  });
  const [fotoCarga, setFotoCarga] = useState(null);
  const [firmaCarga, setFirmaCarga] = useState(null);
  const [fotosExtra, setFotosExtra] = useState([]);

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const label = darkMode ? 'text-slate-300' : 'text-gray-600';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';

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

  const totalCarga = useMemo(() => {
    const k = parseFloat(carga.kilos);
    const p = parseFloat(carga.precio_por_kilo);
    if (Number.isNaN(k) || Number.isNaN(p)) return null;
    return (k * p).toFixed(2);
  }, [carga.kilos, carga.precio_por_kilo]);

  const abrirCarga = (p) => {
    setPesando(p);
    setCarga({
      unidades: String(p.unidades),
      kilos: p.kilos_despachados ? String(p.kilos_despachados) : '',
      precio_por_kilo: '',
      transportista: '',
      entregado_por: perfil?.nombre_completo || '',
      observaciones: '',
    });
    setFotoCarga(null);
    setFirmaCarga(null);
    setFotosExtra([]);
  };

  const cambiarEstado = async (p, siguiente) => {
    try {
      setProcesando(p.id);
      await pedidosRepository.actualizarEstado(p.id, siguiente);
      setMensaje({ tipo: 'exito', texto: `Pedido #${p.id} de ${p.sucursales?.nombre} → ${ESTADOS[siguiente]}` });
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo actualizar el pedido' });
    } finally {
      setProcesando(null);
    }
  };

  // El despacho es el unico cambio que pide evidencia
  const despachar = async () => {
    if (!carga.kilos || Number(carga.kilos) <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresa el peso que sale de la planta' });
      return;
    }
    if (!carga.unidades || Number(carga.unidades) <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresa cuántas unidades van' });
      return;
    }
    if (carga.precio_por_kilo === '' || Number(carga.precio_por_kilo) < 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresa el precio por kilo' });
      return;
    }
    if (!carga.transportista.trim()) {
      setMensaje({ tipo: 'error', texto: 'Escribe con quién va el pollo' });
      return;
    }
    if (!fotoCarga) {
      setMensaje({ tipo: 'error', texto: 'Adjunta la foto de la carga' });
      return;
    }
    if (!firmaCarga) {
      setMensaje({ tipo: 'error', texto: 'Falta la firma de quien autoriza la salida' });
      return;
    }

    try {
      setProcesando(pesando.id);
      await pedidosRepository.despachar(pesando.id, {
        ...carga,
        fotosExtra,
        foto: fotoCarga,
        firma: firmaCarga,
      });
      setMensaje({ tipo: 'exito', texto: `Carga registrada hacia ${pesando.sucursales?.nombre}` });
      setPesando(null);
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo registrar la carga' });
    } finally {
      setProcesando(null);
    }
  };

  const ejecutarAccion = (p, accion) => {
    if (accion.siguiente === 'RECOGIDO') {
      abrirCarga(p);
      return;
    }
    cambiarEstado(p, accion.siguiente);
  };

  const porEstado = useMemo(
    () => ORDEN.map((e) => ({ estado: e, items: pedidos.filter((p) => p.estado === e) })).filter((g) => g.items.length > 0),
    [pedidos]
  );

  const pendientesAccion = pedidos.filter((p) => acciones.some((a) => a.estado === p.estado)).length;

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <header className={`sticky top-0 z-20 border-b backdrop-blur-xl ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-gray-200'}`}>
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className={`p-2.5 rounded-xl border transition ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'}`}
              aria-label="Volver"
            >
              <ArrowLeft size={18} />
            </button>
            <div className={`p-2 rounded-xl border ${color} shrink-0`}>
              <PackageCheck size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className={`text-base md:text-xl font-black tracking-tight truncate ${strong}`}>{titulo}</h1>
              <p className={`text-[10px] md:text-xs font-medium ${muted}`}>
                {subtitulo}
                {pendientesAccion > 0 && <span className={`font-bold ${strong}`}> · {pendientesAccion} por atender</span>}
              </p>
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
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-5 space-y-5">
        {mensaje && (
          <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
            mensaje.tipo === 'error'
              ? 'bg-red-950/40 border-red-800/50 text-red-300'
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
        ) : pedidos.length === 0 ? (
          <div className={`${card} border rounded-2xl py-16 text-center ${muted}`}>
            <ShoppingCart size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">No hay pedidos registrados</p>
          </div>
        ) : (
          porEstado.map(({ estado, items }) => (
            <section key={estado}>
              <div className="flex items-center gap-2 mb-2.5">
                <h2 className={`text-xs font-bold uppercase tracking-wider ${muted}`}>{ESTADOS[estado]}</h2>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border ${BADGE[estado]}`}>{items.length}</span>
              </div>
              <div className="space-y-2.5">
                {items.map((p) => {
                  const disponibles = acciones.filter((a) => a.estado === estado);
                  const accion = disponibles[0];
                  return (
                    <div key={p.id} className={`${card} border rounded-2xl p-4`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2.5 rounded-xl shrink-0 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                          <Store size={17} className="text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-bold ${strong}`}>{p.sucursales?.nombre || 'Sucursal'}</span>
                            {p.sucursales?.sector && (
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${BADGE[estado]}`}>
                                {p.sucursales.sector}
                              </span>
                            )}
                            <span className={`text-[11px] ${muted}`}>#{p.id}</span>
                          </div>

                          <p className={`mt-1.5 text-sm ${normal}`}>
                            <span className="font-bold">{p.unidades} unidades</span>
                            {Number(p.kilos_despachados) > 0 && <span className={muted}> · {p.kilos_despachados} kg</span>}
                          </p>
                          <p className={`mt-1 flex items-center gap-1.5 text-xs ${muted}`}>
                            <CalendarDays size={12} /> Para el {new Date(`${p.fecha}T00:00:00`).toLocaleDateString('es-BO', { day: 'numeric', month: 'long' })}
                            <span className="ml-1">· pedido {new Date(p.creado_en).toLocaleDateString('es-BO')}</span>
                          </p>
                          {p.observaciones && <p className={`mt-2 text-xs italic ${muted}`}>“{p.observaciones}”</p>}

                          {accion && (
                            <button
                              onClick={() => ejecutarAccion(p, accion)}
                              disabled={procesando === p.id}
                              className={`mt-3 w-full flex items-center justify-center gap-2 ${accion.clase} disabled:opacity-60 px-4 py-2.5 rounded-xl text-sm font-bold transition`}
                            >
                              {procesando === p.id ? <Loader2 size={16} className="animate-spin" /> : <accion.icono size={16} />}
                              {accion.texto}
                            </button>
                          )}

                          {!accion && estado === 'ENTREGADO' && p.pedido_recepciones?.[0] && (
                            <p className={`mt-2 text-xs font-semibold text-emerald-500`}>
                              Recibió {p.pedido_recepciones[0].unidades_recibidas} unidades
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Formulario 2: salida de la planta hacia el distribuidor */}
      {pesando && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className={`${card} border rounded-2xl w-full max-w-md p-5 md:p-6 shadow-2xl my-4`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className={`text-lg font-black ${strong}`}>Cargar Pedido #{pesando.id}</h2>
              <button
                onClick={() => setPesando(null)}
                className={`p-2 rounded-xl ${muted} hover:bg-slate-500/10`}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <p className={`text-xs mb-5 ${muted}`}>
              Destino: <span className={`font-bold ${normal}`}>{pesando.sucursales?.nombre}</span>
              {pesando.sucursales?.sector && ` (${pesando.sucursales.sector})`} ·
              pidió <span className={`font-bold ${normal}`}>{pesando.unidades} unidades</span>.
              Pesá, valuá y firmá antes de que salga.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                    Unidades *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={carga.unidades}
                    onChange={(e) => setCarga({ ...carga, unidades: e.target.value })}
                    className={`w-full px-4 py-3 border rounded-xl text-lg font-bold outline-none focus:ring-2 transition ${input}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                    Kilos *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={carga.kilos}
                    onChange={(e) => setCarga({ ...carga, kilos: e.target.value })}
                    placeholder="0.00"
                    autoFocus
                    className={`w-full px-4 py-3 border rounded-xl text-lg font-bold outline-none focus:ring-2 transition ${input}`}
                  />
                </div>
              </div>

              {carga.kilos && carga.unidades && (
                <p className={`-mt-2 text-[11px] ${muted}`}>
                  Promedio: {((Number(carga.kilos) / Number(carga.unidades)) || 0).toFixed(3)} kg por unidad
                </p>
              )}

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Precio por kilo (Bs) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={carga.precio_por_kilo}
                  onChange={(e) => setCarga({ ...carga, precio_por_kilo: e.target.value })}
                  placeholder="0.00"
                  className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
                />
              </div>

              {totalCarga !== null && (
                <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${darkMode ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-cyan-50 border-cyan-200'}`}>
                  <span className={`text-xs font-bold uppercase tracking-wider ${label}`}>Total a cobrar</span>
                  <span className="text-xl font-black text-cyan-500">{totalCarga} Bs</span>
                </div>
              )}

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Con quién va el pollo *
                </label>
                <div className="relative">
                  <Truck size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${muted} pointer-events-none`} />
                  <input
                    type="text"
                    required
                    value={carga.transportista}
                    onChange={(e) => setCarga({ ...carga, transportista: e.target.value })}
                    placeholder="Nombre del distribuidor o chofer"
                    className={`w-full pl-10 pr-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
                  />
                </div>
              </div>

              <SelectorFoto
                etiqueta="Foto de la carga"
                ayuda="Puedes tomarla con la camara o buscarla en la galeria"
                theme={{ borde: input, texto: label, tenue: muted, hoja: card }}
                onSeleccionar={setFotoCarga}
                onError={(texto) => setMensaje({ tipo: 'error', texto })}
              />

              <FirmaCanvas
                titulo="Firma de quien autoriza la salida"
                theme={{ card: 'bg-white', borde: 'border-slate-300', texto: label, tenue: muted }}
                onCambio={(dataUrl) => setFirmaCarga(dataUrl)}
              />

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Observaciones
                </label>
                <textarea
                  rows={2}
                  value={carga.observaciones}
                  onChange={(e) => setCarga({ ...carga, observaciones: e.target.value })}
                  placeholder="Ej: se va 1 caja menos / va con refrigeración"
                  className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
                />
              </div>

              <FotosObservaciones
                fotos={fotosExtra}
                onCambio={setFotosExtra}
                onError={(texto) => setMensaje({ tipo: 'error', texto })}
                theme={{ borde: input, texto: label, tenue: muted, hoja: card }}
              />

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setPesando(null)}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold border ${input}`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={procesando === pesando.id}
                  onClick={despachar}
                  className="flex-1 flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60 text-white px-4 py-3 rounded-xl text-sm font-bold transition"
                >
                  {procesando === pesando.id ? <Loader2 size={16} className="animate-spin" /> : <FileCheck2 size={16} />}
                  Firmar y cargar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
