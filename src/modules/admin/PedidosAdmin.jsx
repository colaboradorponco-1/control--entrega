import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Check, Clock, Loader2, LogOut, RefreshCw, Search,
  ShieldCheck, ShoppingCart, Sun, Moon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { authRepository } from '../../repositories/AuthRepository';
import { pedidosRepository } from '../../repositories/pedidosRepository';
import { supabase } from '../../config/supabaseClient';

const ESTADOS = [
  'TODOS',
  'PENDIENTE',
  'APROBADO',
  'EN_PREPARACION',
  'LISTO',
  'RECOGIDO',
  'ENTREGADO',
  'CANCELADO',
  'RECHAZADO',
];

const ETIQUETAS = {
  PENDIENTE: 'Pendiente de aprobación',
  APROBADO: 'Aprobado',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
  RECOGIDO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
  RECHAZADO: 'Rechazado',
};

const FECHA = (valor) => (
  valor ? new Date(`${valor}T12:00:00`).toLocaleDateString('es-BO') : '—'
);

export default function PedidosAdmin() {
  const { perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState([]);
  const [estado, setEstado] = useState('PENDIENTE');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [aprobando, setAprobando] = useState(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setCargando(true);
      setError('');
      setPedidos(await pedidosRepository.listarParaAdministrador({ estado }));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los pedidos de la base de datos.');
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [estado]);

  useEffect(() => {
    cargar();
    const canal = supabase
      .channel('admin-pedidos-bandeja')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' },
        () => cargar({ silencioso: true }))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [cargar]);

  const aprobar = async (pedido) => {
    if (perfil?.roles?.nombre !== 'administrador') {
      setError('Solo el rol administrador puede aprobar pedidos.');
      return;
    }
    try {
      setAprobando(pedido.id);
      setError('');
      setMensaje('');
      await pedidosRepository.aprobar(pedido.id);
      setMensaje(`Pedido #${pedido.id} de ${pedido.sucursales?.nombre || 'la sucursal'} aprobado.`);
      await cargar({ silencioso: true });
    } catch (err) {
      setError(err.message || `No se pudo aprobar el pedido #${pedido.id}.`);
    } finally {
      setAprobando(null);
    }
  };

  const termino = busqueda.trim().toLocaleLowerCase('es-BO');
  const visibles = pedidos.filter((pedido) => (
    !termino
    || String(pedido.id).includes(termino)
    || (pedido.sucursales?.nombre || '').toLocaleLowerCase('es-BO').includes(termino)
    || (pedido.sucursales?.sector || '').toLocaleLowerCase('es-BO').includes(termino)
  ));
  const card = darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-white';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const input = darkMode
    ? 'border-slate-700 bg-slate-950 text-slate-100'
    : 'border-gray-300 bg-white text-gray-900';

  return (
    <main className={`min-h-screen p-4 md:p-8 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <header className={`mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${card}`}>
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-500"><ShoppingCart size={21} /></span>
          <div>
            <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-amber-500">
              <ShieldCheck size={14} /> Bandeja administrativa
            </p>
            <h1 className={`text-xl font-black ${strong}`}>Pedidos de sucursales</h1>
            <p className={`text-xs ${muted}`}>Solo el administrador aprueba pedidos pendientes.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate('/admin')} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}>
            <ArrowLeft size={15} /> Panel
          </button>
          <button type="button" onClick={toggleTheme} className={`rounded-lg border p-2 ${input}`} aria-label="Cambiar tema">
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button type="button" onClick={() => authRepository.logout()} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-500">
            <LogOut size={15} /> Salir
          </button>
        </div>
      </header>

      <section className={`rounded-2xl border p-4 md:p-6 ${card}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <label className={`flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border px-3 py-2 ${input}`}>
            <Search size={16} className={muted} />
            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar por número, sucursal o sector"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className={muted}>Estado</span>
            <select value={estado} onChange={(event) => setEstado(event.target.value)} className={`rounded-lg border px-3 py-2 ${input}`}>
              {ESTADOS.map((opcion) => (
                <option key={opcion} value={opcion}>{opcion === 'TODOS' ? 'Todos' : ETIQUETAS[opcion]}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => cargar()}
            disabled={cargando}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        {error && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
        {mensaje && <p role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">{mensaje}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className={darkMode ? 'bg-slate-950 text-slate-400' : 'bg-gray-50 text-gray-600'}>
              <tr>
                <th className="px-3 py-3 text-left">Pedido</th>
                <th className="px-3 py-3 text-left">Sucursal</th>
                <th className="px-3 py-3 text-left">Fecha solicitada</th>
                <th className="px-3 py-3 text-right">Unidades</th>
                <th className="px-3 py-3 text-left">Estado</th>
                <th className="px-3 py-3 text-left">Observaciones</th>
                <th className="px-3 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((pedido) => (
                <tr key={pedido.id} className="border-t border-inherit">
                  <td className={`px-3 py-3 font-bold ${strong}`}>#{pedido.id}</td>
                  <td className={`px-3 py-3 ${strong}`}>
                    {pedido.sucursales?.nombre || 'Sucursal sin nombre'}
                    {pedido.sucursales?.sector && <span className={`block text-xs ${muted}`}>{pedido.sucursales.sector}</span>}
                  </td>
                  <td className={`px-3 py-3 ${muted}`}>{FECHA(pedido.fecha)}</td>
                  <td className={`px-3 py-3 text-right font-bold ${strong}`}>{pedido.unidades}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
                      pedido.estado === 'PENDIENTE'
                        ? 'bg-amber-500/10 text-amber-500'
                        : 'bg-slate-500/10 text-slate-500'
                    }`}>
                      {pedido.estado === 'PENDIENTE' ? <Clock size={12} /> : null}
                      {ETIQUETAS[pedido.estado] || pedido.estado}
                    </span>
                  </td>
                  <td className={`max-w-[260px] px-3 py-3 ${muted}`}>{pedido.observaciones || '—'}</td>
                  <td className="px-3 py-3 text-right">
                    {pedido.estado === 'PENDIENTE' && perfil?.roles?.nombre === 'administrador' ? (
                      <button
                        type="button"
                        onClick={() => aprobar(pedido)}
                        disabled={aprobando !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {aprobando === pedido.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Aprobar
                      </button>
                    ) : pedido.estado === 'PENDIENTE' ? (
                      <span className={`text-xs ${muted}`}>Solo administrador</span>
                    ) : <span className={`text-xs ${muted}`}>—</span>}
                  </td>
                </tr>
              ))}
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan="7" className={`px-3 py-10 text-center ${muted}`}>
                    No hay pedidos reales para este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {cargando && (
          <p className={`mt-3 flex items-center justify-center gap-2 text-sm ${muted}`}>
            <Loader2 size={16} className="animate-spin" /> Consultando pedidos...
          </p>
        )}
      </section>
    </main>
  );
}
