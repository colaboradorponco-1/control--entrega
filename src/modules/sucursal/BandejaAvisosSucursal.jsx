import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAvisos } from '../../hooks/useAvisos';
import TarjetaAviso from '../../components/TarjetaAviso';
import {
  ArrowLeft, Bell, CheckCheck, Inbox, Loader2, Moon, PackageCheck, RefreshCw, Sun, X,
} from 'lucide-react';

const FILTROS = [
  { id: 'todos', texto: 'Todos' },
  { id: 'sin-leer', texto: 'Sin leer' },
  { id: 'pedidos', texto: 'Pedidos' },
  { id: 'faltantes', texto: 'Faltantes' },
];

const FILTRAR = {
  todos: () => true,
  'sin-leer': (aviso) => !aviso.leido,
  pedidos: (aviso) => String(aviso.tipo || '').startsWith('PEDIDO_'),
  faltantes: (aviso) => aviso.tipo === 'RECEPCION_FALTANTES',
};

export default function BandejaAvisosSucursal() {
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { avisos, urls, cargando, error, cargar, marcarLeida, marcarTodas } = useAvisos();
  const [filtro, setFiltro] = useState('todos');
  const [foto, setFoto] = useState(null);

  useEffect(() => {
    const cerrar = (evento) => {
      if (evento.key === 'Escape') setFoto(null);
    };
    document.addEventListener('keydown', cerrar);
    return () => document.removeEventListener('keydown', cerrar);
  }, []);

  const sinLeer = avisos.filter((aviso) => !aviso.leido).length;
  const pedidos = avisos.filter((aviso) => String(aviso.tipo || '').startsWith('PEDIDO_')).length;
  const faltantes = avisos.filter((aviso) => aviso.tipo === 'RECEPCION_FALTANTES').length;

  const visibles = useMemo(
    () => avisos.filter(FILTRAR[filtro] || FILTRAR.todos),
    [avisos, filtro]
  );

  const verFoto = (url) => {
    if (url) setFoto(url);
  };

  const abrirPedido = async (aviso) => {
    if (!aviso.leido) await marcarLeida(aviso);
    const destino = aviso.pedido_id ? `/sucursal?pedido=${aviso.pedido_id}` : '/sucursal';
    navigate(destino);
  };

  const card = darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-white';
  const texto = darkMode ? 'text-slate-100' : 'text-gray-900';
  const tenue = darkMode ? 'text-slate-400' : 'text-gray-500';
  const borde = darkMode ? 'border-slate-800' : 'border-gray-200';
  const suave = darkMode ? 'bg-slate-800/60' : 'bg-gray-50';
  const tema = { borde, texto, tenue, hoja: darkMode ? 'bg-slate-900' : 'bg-white', suave };

  return (
    <main className={`min-h-screen px-4 py-6 md:px-8 md:py-8 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <div className="mx-auto max-w-5xl">
        <header className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5 shadow ${card}`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/sucursal')}
              className={`rounded-xl border p-2.5 transition ${borde} ${tenue} hover:opacity-80`}
              title="Volver a mis pedidos"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className={`text-xl font-black md:text-2xl ${texto}`}>Mis avisos</h1>
              <p className={`text-sm ${tenue}`}>
                Cambios de tus pedidos y faltantes al recibir
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sinLeer > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm font-semibold text-amber-600 transition hover:bg-amber-500/20"
              >
                <CheckCheck size={16} /> Marcar todo
              </button>
            )}
            <button
              type="button"
              onClick={() => cargar()}
              className={`rounded-xl border p-2.5 transition ${borde} ${tenue} hover:opacity-80`}
              title="Actualizar"
            >
              <RefreshCw size={18} />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className={`rounded-xl border p-2.5 transition ${borde} ${tenue} hover:opacity-80`}
              title="Cambiar tema"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { texto: 'Avisos totales', valor: avisos.length, icono: Bell },
            { texto: 'Sin leer', valor: sinLeer, icono: Bell },
            { texto: 'Pedidos', valor: pedidos, icono: PackageCheck },
            { texto: 'Faltantes', valor: faltantes, icono: Inbox },
          ].map(({ texto: rotulo, valor, icono: Icono }) => (
            <div key={rotulo} className={`rounded-2xl border p-4 ${card}`}>
              <div className="flex items-center justify-between">
                <p className={`text-xs font-bold uppercase tracking-wide ${tenue}`}>{rotulo}</p>
                <Icono size={14} className="text-amber-500" />
              </div>
              <p className={`mt-1 text-2xl font-black ${texto}`}>{valor}</p>
            </div>
          ))}
        </section>

        <div className="mb-4 flex flex-wrap gap-2">
          {FILTROS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFiltro(item.id)}
              className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                filtro === item.id
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-600'
                  : `${borde} ${tenue} hover:opacity-80`
              }`}
            >
              {item.texto}
            </button>
          ))}
        </div>

        {cargando && (
          <div className={`flex items-center justify-center gap-2 py-16 text-sm ${tenue}`}>
            <Loader2 size={18} className="animate-spin" /> Cargando avisos...
          </div>
        )}

        {!cargando && error && (
          <div className={`rounded-2xl border p-6 text-center text-sm ${card} ${tenue}`}>{error}</div>
        )}

        {!cargando && !error && visibles.length === 0 && (
          <div className={`rounded-2xl border p-10 text-center ${card}`}>
            <Inbox size={26} className={`mx-auto mb-2 ${tenue}`} />
            <p className={`text-sm ${tenue}`}>
              {avisos.length === 0
                ? 'Todavia no tenes avisos de tus pedidos.'
                : 'No hay avisos con este filtro.'}
            </p>
          </div>
        )}

        <div className="grid gap-3">
          {visibles.map((aviso) => (
            <TarjetaAviso
              key={aviso.id}
              aviso={aviso}
              urls={urls}
              theme={tema}
              onMarcarLeida={marcarLeida}
              onAbrir={abrirPedido}
              onVerFoto={verFoto}
            />
          ))}
        </div>
      </div>

      {foto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setFoto(null)}
        >
          <img
            src={foto}
            alt="Evidencia del aviso"
            onClick={(evento) => evento.stopPropagation()}
            className="max-h-[90vh] max-w-full rounded-xl object-contain"
          />
          <button
            type="button"
            onClick={() => setFoto(null)}
            className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white"
            title="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </main>
  );
}
