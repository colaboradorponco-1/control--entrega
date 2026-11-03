import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabaseClient';
import { useTheme } from '../../context/ThemeContext';
import {
  ArrowLeft, RefreshCw, Search, Table, AlertCircle, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  inicioDiaISO,
  inicioDiaSiguienteISO,
  normalizarBusqueda,
  POR_PAGINA,
  rangoUltimos30Dias,
} from '../../utils/filtrosHistorial';

const COLOR_ACCION = {
  INSERT: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  UPDATE: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  DELETE: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const ETIQUETA_ACCION = {
  INSERT: 'Creado',
  UPDATE: 'Modificado',
  DELETE: 'Eliminado',
};

const formatearJson = (valor) => {
  if (valor == null) return null;
  if (typeof valor === 'string') {
    try {
      return JSON.stringify(JSON.parse(valor), null, 2);
    } catch {
      return valor;
    }
  }
  try {
    return JSON.stringify(valor, null, 2);
  } catch {
    return String(valor);
  }
};

export default function RegistroActividad() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [tablaFiltro, setTablaFiltro] = useState('todas');
  const [accionFiltro, setAccionFiltro] = useState('todas');
  const [abierto, setAbierto] = useState(null);
  const [periodo, setPeriodo] = useState(rangoUltimos30Dias);
  const [pagina, setPagina] = useState(0);
  const [totalLogs, setTotalLogs] = useState(0);

  const cargarLogs = useCallback(async (paginaSolicitada = pagina) => {
    setCargando(true);
    setError('');
    let consulta = supabase
      .from('auditoria')
      .select('*', { count: 'exact' })
      .order('creado_en', { ascending: false })
      .range(paginaSolicitada * POR_PAGINA, (paginaSolicitada + 1) * POR_PAGINA - 1);
    if (periodo.desde) consulta = consulta.gte('creado_en', inicioDiaISO(periodo.desde));
    if (periodo.hasta) consulta = consulta.lt('creado_en', inicioDiaSiguienteISO(periodo.hasta));
    if (tablaFiltro !== 'todas') consulta = consulta.eq('tabla', tablaFiltro);
    if (accionFiltro !== 'todas') consulta = consulta.eq('accion', accionFiltro);
    const termino = normalizarBusqueda(busquedaAplicada);
    if (termino) {
      const filtros = [`usuario_nombre.ilike.%${termino}%`, `tabla.ilike.%${termino}%`];
      if (/^\d+$/.test(termino)) filtros.push(`registro_id.eq.${termino}`);
      consulta = consulta.or(filtros.join(','));
    }
    const { data, error: err, count } = await consulta;

    if (err) {
      setError(err.message || 'No se pudo cargar la auditoría.');
    } else {
      setLogs(data || []);
      setTotalLogs(count || 0);
    }
    setCargando(false);
  }, [accionFiltro, busquedaAplicada, pagina, periodo, tablaFiltro]);

  useEffect(() => {
    cargarLogs();
  }, [cargarLogs]);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setBusquedaAplicada(busqueda);
      setPagina(0);
    }, 300);
    return () => window.clearTimeout(temporizador);
  }, [busqueda]);

  const tablas = useMemo(
    () => [...new Set(logs.map((l) => l.tabla).filter(Boolean))].sort(),
    [logs]
  );

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return logs.filter((l) => {
      if (tablaFiltro !== 'todas' && l.tabla !== tablaFiltro) return false;
      if (accionFiltro !== 'todas' && l.accion !== accionFiltro) return false;
      if (!texto) return true;
      return (
        (l.usuario_nombre || '').toLowerCase().includes(texto) ||
        (l.tabla || '').toLowerCase().includes(texto) ||
        String(l.registro_id ?? '').toLowerCase().includes(texto)
      );
    });
  }, [logs, busqueda, tablaFiltro, accionFiltro]);

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const input = darkMode
    ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400';
  const thead = darkMode ? 'bg-slate-900 text-slate-400' : 'bg-gray-50 text-gray-600';
  const divide = darkMode ? 'divide-slate-800' : 'divide-gray-200';

  return (
    <div className={`min-h-screen p-4 md:p-8 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className={`flex items-center gap-3 text-2xl font-bold ${strong}`}>
          <Table className="text-emerald-500" /> Registro de Actividad
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/panel')}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${card} ${muted} hover:opacity-80`}
          >
            <ArrowLeft size={16} /> Volver al panel
          </button>
          <button
            onClick={cargarLogs}
            disabled={cargando}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${card} ${muted} hover:opacity-80`}
          >
            <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${muted}`} />
          <input
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(0); }}
            className={`w-full rounded-xl border py-2 pl-9 pr-3 text-sm outline-none ${input}`}
            placeholder="Buscar usuario, tabla o ID..."
          />
        </div>
        <select
          value={tablaFiltro}
          onChange={(e) => { setTablaFiltro(e.target.value); setPagina(0); }}
          className={`rounded-xl border px-3 py-2 text-sm outline-none ${input}`}
        >
          <option value="todas">Todas las tablas</option>
          {tablas.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={accionFiltro}
          onChange={(e) => { setAccionFiltro(e.target.value); setPagina(0); }}
          className={`rounded-xl border px-3 py-2 text-sm outline-none ${input}`}
        >
          <option value="todas">Todas las acciones</option>
          <option value="INSERT">Creados</option>
          <option value="UPDATE">Modificados</option>
          <option value="DELETE">Eliminados</option>
        </select>
        <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${input}`}>
          Desde
          <input
            type="date"
            value={periodo.desde}
            max={periodo.hasta}
            onChange={(e) => { setPeriodo((actual) => ({ ...actual, desde: e.target.value })); setPagina(0); }}
            className="min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
        <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${input}`}>
          Hasta
          <input
            type="date"
            value={periodo.hasta}
            min={periodo.desde}
            onChange={(e) => { setPeriodo((actual) => ({ ...actual, hasta: e.target.value })); setPagina(0); }}
            className="min-w-0 bg-transparent text-sm outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setPeriodo(rangoUltimos30Dias());
            setBusqueda('');
            setBusquedaAplicada('');
            setTablaFiltro('todas');
            setAccionFiltro('todas');
            setPagina(0);
          }}
          className={`rounded-xl border px-3 py-2 text-sm font-semibold ${input}`}
        >
          Limpiar filtros
        </button>
      </div>

      <p className={`mb-3 text-xs ${muted}`}>
        Mostrando {logs.length} de {totalLogs} movimientos de los últimos 30 días o del período elegido.
      </p>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className={`overflow-x-auto rounded-2xl border ${card}`}>
        <table className="w-full text-sm">
          <thead className={thead}>
            <tr>
              <th className="p-3 text-left font-semibold">Fecha</th>
              <th className="p-3 text-left font-semibold">Usuario</th>
              <th className="p-3 text-left font-semibold">Acción</th>
              <th className="p-3 text-left font-semibold">Tabla</th>
              <th className="p-3 text-left font-semibold">Registro</th>
              <th className="p-3 text-right font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${divide}`}>
            {cargando && (
              <tr>
                <td colSpan={6} className={`p-6 text-center ${muted}`}>Cargando actividad...</td>
              </tr>
            )}
            {!cargando && totalLogs === 0 && (
              <tr>
                <td colSpan={6} className={`p-6 text-center ${muted}`}>No hay movimientos para mostrar.</td>
              </tr>
            )}
            {!cargando && filtrados.map((l) => {
              const tieneDetalle = Boolean(l.datos_anteriores || l.datos_nuevos);
              const estaAbierto = abierto === l.id;
              return (
                <tr key={l.id} className="align-top">
                  <td className={`whitespace-nowrap p-3 ${muted}`}>
                    {l.creado_en ? new Date(l.creado_en).toLocaleString() : '—'}
                  </td>
                  <td className={`p-3 font-medium ${strong}`}>{l.usuario_nombre || 'Sistema'}</td>
                  <td className="p-3">
                    <span className={`inline-block rounded-lg border px-2 py-0.5 text-[11px] font-bold uppercase ${COLOR_ACCION[l.accion] || COLOR_ACCION.UPDATE}`}>
                      {ETIQUETA_ACCION[l.accion] || l.accion}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-xs">{l.tabla}</td>
                  <td className={`p-3 font-mono text-xs ${muted}`}>{l.registro_id ?? '—'}</td>
                  <td className="p-3 text-right">
                    {tieneDetalle ? (
                      <button
                        onClick={() => setAbierto(estaAbierto ? null : l.id)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${muted} ${darkMode ? 'border-slate-700' : 'border-gray-300'}`}
                      >
                        {estaAbierto ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {estaAbierto ? 'Ocultar' : 'Ver'}
                      </button>
                    ) : (
                      <span className={`text-[11px] ${muted}`}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!cargando && totalLogs > POR_PAGINA && (
        <div className={`mt-4 flex items-center justify-between ${muted}`}>
          <span className="text-xs">Página {pagina + 1} de {Math.ceil(totalLogs / POR_PAGINA)}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagina === 0}
              onClick={() => setPagina((actual) => actual - 1)}
              className={`rounded-lg border p-2 disabled:opacity-40 ${input}`}
              aria-label="Página anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              disabled={(pagina + 1) * POR_PAGINA >= totalLogs}
              onClick={() => setPagina((actual) => actual + 1)}
              className={`rounded-lg border p-2 disabled:opacity-40 ${input}`}
              aria-label="Página siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {abierto != null && (() => {
        const log = filtrados.find((l) => l.id === abierto);
        if (!log) return null;
        return (
          <div className={`mt-4 grid gap-4 md:grid-cols-2`}>
            {log.datos_anteriores && (
              <div className={`rounded-2xl border p-4 ${card}`}>
                <p className={`mb-2 text-xs font-bold uppercase tracking-wider ${muted}`}>Antes</p>
                <pre className={`max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px] ${strong}`}>
                  {formatearJson(log.datos_anteriores)}
                </pre>
              </div>
            )}
            {log.datos_nuevos && (
              <div className={`rounded-2xl border p-4 ${card}`}>
                <p className={`mb-2 text-xs font-bold uppercase tracking-wider ${muted}`}>Después</p>
                <pre className={`max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px] ${strong}`}>
                  {formatearJson(log.datos_nuevos)}
                </pre>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
