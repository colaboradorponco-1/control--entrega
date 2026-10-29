import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useTheme } from '../../context/ThemeContext';
import { RefreshCw, Search, Table, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

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
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [tablaFiltro, setTablaFiltro] = useState('todas');
  const [accionFiltro, setAccionFiltro] = useState('todas');
  const [abierto, setAbierto] = useState(null);

  const cargarLogs = useCallback(async () => {
    setCargando(true);
    setError('');
    const { data, error: err } = await supabase
      .from('auditoria')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(200);

    if (err) {
      setError(err.message || 'No se pudo cargar la auditoría.');
    } else {
      setLogs(data || []);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargarLogs();
  }, [cargarLogs]);

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
        <button
          onClick={cargarLogs}
          disabled={cargando}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${card} ${muted} hover:opacity-80`}
        >
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${muted}`} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`w-full rounded-xl border py-2 pl-9 pr-3 text-sm outline-none ${input}`}
            placeholder="Buscar usuario, tabla o ID..."
          />
        </div>
        <select
          value={tablaFiltro}
          onChange={(e) => setTablaFiltro(e.target.value)}
          className={`rounded-xl border px-3 py-2 text-sm outline-none ${input}`}
        >
          <option value="todas">Todas las tablas</option>
          {tablas.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={accionFiltro}
          onChange={(e) => setAccionFiltro(e.target.value)}
          className={`rounded-xl border px-3 py-2 text-sm outline-none ${input}`}
        >
          <option value="todas">Todas las acciones</option>
          <option value="INSERT">Creados</option>
          <option value="UPDATE">Modificados</option>
          <option value="DELETE">Eliminados</option>
        </select>
      </div>

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
            {!cargando && filtrados.length === 0 && (
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
