import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { authRepository } from '../../repositories/AuthRepository';
import { pedidosRepository } from '../../repositories/pedidosRepository';
import { supabase } from '../../config/supabaseClient';
import SeguimientoRepartidor from '../../components/SeguimientoRepartidor';
import {
  ArrowLeft, LogOut, Sun, Moon, MapPin, Loader2, Crown,
  TrendingUp, Boxes, AlertCircle, Search, Plus, X, ShoppingCart,
} from 'lucide-react';

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

const ESTADOS_PROGRESO = ['PENDIENTE', 'APROBADO', 'EN_PREPARACION', 'LISTO', 'RECOGIDO', 'ENTREGADO'];
const ETIQUETA_ESTADO = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
  RECOGIDO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
  RECHAZADO: 'Rechazado',
};

export default function MisSucursalesDueno() {
  const { usuario, perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [sucursales, setSucursales] = useState([]);
  const [mostrarPedido, setMostrarPedido] = useState(false);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const [formPedido, setFormPedido] = useState({
    sucursal_id: '',
    unidades: '',
    fecha: fechaHoyBolivia(),
    observaciones: '',
  });
  const [busquedaSucursal, setBusquedaSucursal] = useState('');
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [cargandoDisponibilidad, setCargandoDisponibilidad] = useState(false);

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500 focus:ring-amber-500/20'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-amber-500/20';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';
  const tableHead = darkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-gray-50 text-gray-600 border-gray-200';
  const rowHover = darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50';

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setCargando(true);
      setError(null);
      // La base filtra los pedidos por las sucursales asignadas al dueño.
      setPedidos(await pedidosRepository.listar());
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los pedidos');
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const intervalo = window.setInterval(() => cargar({ silencioso: true }), 20000);
    return () => window.clearInterval(intervalo);
  }, [cargar]);

  // Si el rol es dueno pero no tiene dueno_id vinculado, se avisa
  // en vez de mostrarle la operación completa.
  const [duenoId, setDuenoId] = useState(undefined);

  useEffect(() => {
    const revisar = async () => {
      const { data, error: err } = await supabase
        .from('perfiles_usuario')
        .select('dueno_id')
        .eq('usuario_id', usuario?.id)
        .maybeSingle();

      if (err) {
        setDuenoId(null);
        return;
      }
      setDuenoId(data?.dueno_id ?? null);
    };
    if (usuario?.id) revisar();
  }, [usuario?.id]);

  useEffect(() => {
    if (!duenoId) return;
    pedidosRepository.listarSucursalesParaPedidoDueno()
      .then((asignadas) => setSucursales(asignadas))
      .catch((err) => setError(err.message || 'No se pudieron cargar tus sucursales'));
  }, [duenoId]);

  const esDueño = perfil?.roles?.nombre === 'dueno';
  const sinVinculo = esDueño && duenoId === null;

  const crearPedido = async (e) => {
    e.preventDefault();
    const sucursalId = Number(formPedido.sucursal_id);
    const unidades = Number(formPedido.unidades);
    if (!Number.isInteger(sucursalId) || sucursalId <= 0 || !Number.isInteger(unidades) || unidades <= 0) {
      setError('Selecciona una sucursal e ingresa una cantidad válida de unidades.');
      return;
    }
    if (!formPedido.fecha) {
      setError('Selecciona la fecha en que necesitas el pedido.');
      return;
    }
    if (formPedido.fecha < fechaHoyBolivia()) {
      setError('La fecha del pedido no puede estar en el pasado.');
      return;
    }

    try {
      setEnviandoPedido(true);
      await pedidosRepository.crearParaDueno({
        sucursalId,
        unidades,
        fecha: formPedido.fecha,
        observaciones: formPedido.observaciones,
      });
      setFormPedido({
        sucursal_id: '',
        unidades: '',
        fecha: fechaHoyBolivia(),
        observaciones: '',
      });
      setMostrarPedido(false);
      setError(null);
      setMensaje('El pedido se envió a la planta y ya aparece en el seguimiento.');
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo enviar el pedido');
    } finally {
      setEnviandoPedido(false);
    }
  };

  // La consulta y las politicas RLS limitan al dueño a sus sucursales asignadas.
  const datos = pedidos;

  const sucursalesFiltradas = useMemo(() => {
    const t = busquedaSucursal.trim().toLowerCase();
    const base = t
      ? sucursales.filter((s) => (
        (s.nombre || '').toLowerCase().includes(t)
        || (s.sector || '').toLowerCase().includes(t)
      ))
      : sucursales;
    const seleccionada = sucursales.find((s) => String(s.id) === String(formPedido.sucursal_id));
    if (seleccionada && !base.some((s) => s.id === seleccionada.id)) {
      return [seleccionada, ...base];
    }
    return base;
  }, [sucursales, busquedaSucursal, formPedido.sucursal_id]);

  const unidadesPedidas = Number(formPedido.unidades) || 0;
  const unidadesDisponibles = disponibilidad?.unidades_disponibles;
  const excedeDisponible = typeof unidadesDisponibles === 'number' && unidadesPedidas > unidadesDisponibles;

  const abrirNuevoPedido = async () => {
    setFormPedido({ sucursal_id: '', unidades: '', fecha: fechaHoyBolivia(), observaciones: '' });
    setBusquedaSucursal('');
    setError(null);
    setMostrarPedido(true);
    try {
      setCargandoDisponibilidad(true);
      setDisponibilidad(await pedidosRepository.obtenerDisponibilidadPedidosPlanta());
    } catch {
      setDisponibilidad(null);
    } finally {
      setCargandoDisponibilidad(false);
    }
  };

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return datos;
    return datos.filter(
      (p) =>
        String(p.id).includes(t) ||
        (p.sucursales?.nombre || '').toLowerCase().includes(t) ||
        (p.estado || '').toLowerCase().includes(t)
    );
  }, [datos, busqueda]);

  const metricas = useMemo(() => {
    const num = (v) => parseFloat(v) || 0;
    return {
      pedidos: datos.length,
      unidades: datos.reduce((a, p) => a + (parseInt(p.unidades) || 0), 0),
      kilos: datos.reduce((a, p) => a + num(p.kilos_despachados), 0),
      pendientes: datos.filter((p) => p.estado !== 'ENTREGADO').length,
    };
  }, [datos]);

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-800'}`}>
      <header className={`${card} border-b sticky top-0 z-30`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Crown size={20} className="text-amber-500" />
            <h1 className={`font-black tracking-tight ${strong}`}>Mis Sucursales</h1>
          </div>
          <button onClick={() => navigate('/panel')} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Volver al panel">
            <ArrowLeft size={18} />
          </button>
          <button onClick={toggleTheme} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Cambiar modo">
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => authRepository.logout()} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Salir">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className={`mb-6 p-4 border rounded-2xl ${darkMode ? 'bg-blue-950/30 border-blue-500/30' : 'bg-blue-50 border-blue-200'}`}>
          <p className={`text-sm ${normal}`}>
            <span className="font-bold">{perfil?.nombre_completo}</span>, desde aquí puedes crear
            pedidos para tus sucursales y revisar el avance. La planta y despacho actualizan los
            estados; la sucursal confirma la recepción.
          </p>
        </div>

        {sinVinculo && (
          <div className={`mb-6 p-4 border text-sm flex items-start gap-3 rounded-xl ${darkMode ? 'bg-amber-950/50 border-amber-500/50 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>
              Tu cuenta tiene el rol de dueño pero no está vinculada a un dueño concreto.
              Avisale al administrador para que te asigne el tuyo en la pantalla de Dueños.
            </span>
          </div>
        )}

        {error && (
          <div className={`mb-6 p-4 border text-sm flex items-center gap-3 rounded-xl ${darkMode ? 'bg-red-950/50 border-red-500/50 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <AlertCircle size={18} /> <span>{error}</span>
          </div>
        )}
        {mensaje && (
          <div className={`mb-6 rounded-xl border p-4 text-sm ${darkMode ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {mensaje}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className={`${card} border rounded-2xl p-4`}>
            <p className={`text-xs uppercase tracking-wider ${muted} mb-1 flex items-center gap-1`}>
              <Boxes size={12} /> Pedidos
            </p>
            <p className={`text-3xl font-black ${strong}`}>{metricas.pedidos}</p>
          </div>
          <div className={`${card} border rounded-2xl p-4`}>
            <p className={`text-xs uppercase tracking-wider ${muted} mb-1`}>Unidades</p>
            <p className={`text-3xl font-black ${strong}`}>{metricas.unidades}</p>
          </div>
          <div className={`${card} border rounded-2xl p-4`}>
            <p className={`text-xs uppercase tracking-wider ${muted} mb-1 flex items-center gap-1`}>
              <TrendingUp size={12} /> Kilos
            </p>
            <p className={`text-3xl font-black ${strong}`}>{metricas.kilos.toFixed(1)}</p>
          </div>
          <div className={`${card} border rounded-2xl p-4`}>
            <p className={`text-xs uppercase tracking-wider ${muted} mb-1`}>Sin entregar</p>
            <p className={`text-3xl font-black ${metricas.pendientes ? 'text-amber-500' : 'text-emerald-500'}`}>
              {metricas.pendientes}
            </p>
          </div>

          {mostrarPedido && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className={`${card} w-full max-w-lg rounded-2xl border p-5 shadow-2xl`}>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className={`text-lg font-black ${strong}`}>Nuevo pedido para sucursal</h2>
                  <button
                    onClick={() => setMostrarPedido(false)}
                    className={`rounded-xl p-2 ${muted} hover:bg-slate-500/10`}
                    aria-label="Cerrar"
                  >
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={crearPedido} className="space-y-4">
                  <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                    darkMode ? 'border-slate-800 bg-slate-950/50' : 'border-gray-200 bg-gray-50'
                  } ${muted}`}>
                    {cargandoDisponibilidad ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Consultando disponibilidad de planta...
                      </>
                    ) : disponibilidad ? (
                      <>
                        <Boxes size={14} className="text-emerald-500" /> Disponible en planta:
                        <span className={`font-bold ${strong}`}>{disponibilidad.unidades_disponibles ?? 0} u</span>
                        {disponibilidad.kilos_stock ? <span>· {Number(disponibilidad.kilos_stock).toFixed(1)} kg</span> : null}
                      </>
                    ) : (
                      <>No se pudo consultar la disponibilidad de planta.</>
                    )}
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                      Sucursal *
                    </label>
                    <div className="relative mt-2">
                      <Search className={`absolute left-3.5 top-3 ${muted}`} size={16} />
                      <input
                        type="text"
                        value={busquedaSucursal}
                        onChange={(e) => setBusquedaSucursal(e.target.value)}
                        placeholder="Buscar sucursal o zona..."
                        className={`w-full rounded-xl border pl-10 pr-4 py-3 text-sm normal-case ${input}`}
                      />
                    </div>
                    <select
                      required
                      value={formPedido.sucursal_id}
                      onChange={(e) => setFormPedido({ ...formPedido, sucursal_id: e.target.value })}
                      className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                    >
                      <option value="">{sucursalesFiltradas.length ? 'Selecciona una sucursal' : 'Sin resultados'}</option>
                      {sucursalesFiltradas.map((sucursal) => (
                        <option key={sucursal.id} value={sucursal.id}>
                          {sucursal.nombre}{sucursal.sector ? ` · ${sucursal.sector}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                    Unidades *
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={formPedido.unidades}
                      onChange={(e) => setFormPedido({ ...formPedido, unidades: e.target.value })}
                      className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                    />
                    {excedeDisponible && (
                      <span className="mt-1.5 block text-[11px] font-bold normal-case text-amber-500">
                        Pediste más de lo disponible en planta ({unidadesDisponibles} u). La planta podría no cubrirlo.
                      </span>
                    )}
                  </label>
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                    Fecha requerida *
                    <input
                      type="date"
                      min={fechaHoyBolivia()}
                      required
                      value={formPedido.fecha}
                      onChange={(e) => setFormPedido({ ...formPedido, fecha: e.target.value })}
                      className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                    />
                  </label>
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                    Nota para planta (opcional)
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={formPedido.observaciones}
                      onChange={(e) => setFormPedido({ ...formPedido, observaciones: e.target.value })}
                      className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                    />
                  </label>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setMostrarPedido(false)}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold ${input}`}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={enviandoPedido}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-purple-700 disabled:opacity-60"
                    >
                      {enviandoPedido ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
                      Enviar pedido
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative max-w-md flex-1">
            <Search className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por número o sucursal"
              className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm ${input}`}
            />
            </div>
            {esDueño && !sinVinculo && (
              <button
                onClick={abrirNuevoPedido}
                disabled={!sucursales.length}
                className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={17} /> Crear pedido
              </button>
            )}
          </div>
        </div>

        {cargando ? (
          <div className="flex items-center justify-center gap-3 py-20">
            <Loader2 size={24} className="animate-spin text-amber-500" />
            <span className={muted}>Cargando...</span>
          </div>
        ) : filtrados.length === 0 ? (
          <div className={`${card} border rounded-2xl p-10 text-center`}>
            <MapPin size={40} className={`mx-auto mb-4 ${muted}`} />
            <p className={`font-bold mb-2 ${strong}`}>Sin pedidos para mostrar</p>
            <p className={`text-sm ${muted}`}>
              {busqueda ? 'No hay resultados para esa búsqueda.' : 'Todavía no hay pedidos en tus sucursales.'}
            </p>
          </div>
        ) : (
          <div className={`${card} border rounded-2xl overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className={`text-left px-4 py-3 font-black text-xs uppercase tracking-wider ${muted}`}>#</th>
                  <th className={`text-left px-4 py-3 font-black text-xs uppercase tracking-wider ${muted}`}>Sucursal</th>
                  <th className={`text-left px-4 py-3 font-black text-xs uppercase tracking-wider ${muted}`}>Fecha</th>
                  <th className={`text-right px-4 py-3 font-black text-xs uppercase tracking-wider ${muted}`}>Unidades</th>
                  <th className={`text-right px-4 py-3 font-black text-xs uppercase tracking-wider ${muted}`}>Kilos</th>
                  <th className={`text-left px-4 py-3 font-black text-xs uppercase tracking-wider ${muted}`}>Estado</th>
                  <th className={`text-left px-4 py-3 font-black text-xs uppercase tracking-wider ${muted}`}>Observaciones de entrega</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <Fragment key={p.id}>
                    <tr className={`border-t border-inherit ${rowHover}`}>
                      <td className={`px-4 py-3 font-bold ${normal}`}>{p.id}</td>
                      <td className={`px-4 py-3 ${normal}`}>{p.sucursales?.nombre || '—'}</td>
                      <td className={`px-4 py-3 ${muted}`}>
                        {p.fecha ? new Date(p.fecha).toLocaleDateString('es-BO') : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${normal}`}>{p.unidades}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${normal}`}>
                        {p.kilos_despachados ? parseFloat(p.kilos_despachados).toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-bold ${
                              p.estado === 'ENTREGADO'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : p.estado === 'CANCELADO'
                                ? 'bg-red-500/10 text-red-500'
                                : p.estado === 'RECHAZADO'
                                ? 'bg-rose-500/10 text-rose-500'
                                : 'bg-amber-500/10 text-amber-500'
                            }`}
                          >
                            {ETIQUETA_ESTADO[p.estado] || p.estado}
                          </span>
                          {p.estado !== 'CANCELADO' && p.estado !== 'RECHAZADO' && (
                            <div
                              className="flex max-w-32 gap-1"
                              aria-label={`Avance: ${p.estado}`}
                            >
                              {ESTADOS_PROGRESO.map((estado, indice) => (
                                <span
                                  key={estado}
                                  className={`h-1.5 flex-1 rounded-full ${
                                    indice <= ESTADOS_PROGRESO.indexOf(p.estado)
                                      ? 'bg-emerald-500'
                                      : darkMode ? 'bg-slate-700' : 'bg-gray-200'
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-xs ${muted}`}>
                        {p.reporte_entrega?.observaciones_entrega || '—'}
                      </td>
                    </tr>
                    {p.estado === 'RECOGIDO' && (
                      <tr>
                        <td colSpan={7} className="px-4 pb-4">
                          <SeguimientoRepartidor pedido={p} darkMode={darkMode} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
