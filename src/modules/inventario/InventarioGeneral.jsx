import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, Boxes, CalendarDays, Loader2,
  LogOut, RefreshCw, Search, Sun, Moon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { authRepository } from '../../repositories/AuthRepository';
import { supabase } from '../../config/supabaseClient';

const FECHA = (valor) => (
  valor ? new Date(`${valor}T12:00:00`).toLocaleDateString('es-BO') : '—'
);

const formatoHora = (valor) => (valor ? String(valor).slice(0, 5) : '—');

export default function InventarioGeneral() {
  const { perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState(null);
  const [verArchivados, setVerArchivados] = useState(false);
  const [sucursalFiltro, setSucursalFiltro] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setCargando(true);
      setError('');
      let query = supabase
        .from('inventario_sucursal')
        .select(`
          id, sucursal_id, fecha, pollos_crudos, pollos_crudos_contados, pollos_crudos_iniciales,
          pollos_recibidos, pollos_ingreso_manual, pollos_recibidos_en_conteo,
          hora_corte, conteo_guardado_en, cerrado_en,
          observaciones, observaciones_producto, archivado, archivado_en,
          sucursales ( nombre, sector )
        `)
        .not('hora_corte', 'is', null)
        .eq('archivado', verArchivados)
        .order('fecha', { ascending: false })
        .order('sucursal_id', { ascending: true })
        .limit(500);
      if (sucursalFiltro) query = query.eq('sucursal_id', Number(sucursalFiltro));
      if (fechaFiltro) query = query.eq('fecha', fechaFiltro);
      const { data, error: consultaError } = await query;
      if (consultaError) throw consultaError;
      setRegistros(data || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los inventarios diarios.');
      setRegistros([]);
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [fechaFiltro, sucursalFiltro, verArchivados]);

  useEffect(() => {
    cargar();
    const canal = supabase
      .channel('inventario-general-sucursales')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario_sucursal' },
        () => cargar({ silencioso: true }))
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [cargar]);

  const sucursales = useMemo(() => {
    const unicas = new Map();
    registros.forEach((registro) => {
      if (!unicas.has(registro.sucursal_id)) {
        unicas.set(registro.sucursal_id, registro.sucursales?.nombre || `Sucursal ${registro.sucursal_id}`);
      }
    });
    return [...unicas.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [registros]);

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es-BO');
    if (!termino) return registros;
    return registros.filter((registro) => (
      (registro.sucursales?.nombre || '').toLocaleLowerCase('es-BO').includes(termino)
      || (registro.sucursales?.sector || '').toLocaleLowerCase('es-BO').includes(termino)
      || registro.fecha.includes(termino)
    ));
  }, [busqueda, registros]);

  const cambiarArchivo = async (registro) => {
    const archivar = !registro.archivado;
    const accion = archivar ? 'archivar' : 'restaurar';
    if (!window.confirm(`¿${archivar ? 'Archivar' : 'Restaurar'} el inventario de ${registro.sucursales?.nombre || 'la sucursal'} del ${FECHA(registro.fecha)}?`)) {
      return;
    }
    try {
      setProcesandoId(registro.id);
      setError('');
      setMensaje('');
      const { error: rpcError } = await supabase.rpc('archivar_inventario_sucursal', {
        p_inventario_id: registro.id,
        p_archivado: archivar,
      });
      if (rpcError) throw rpcError;
      setMensaje(`Inventario ${archivar ? 'archivado' : 'restaurado'} correctamente.`);
      await cargar({ silencioso: true });
    } catch (err) {
      setError(err.message || `No se pudo ${accion} el inventario.`);
    } finally {
      setProcesandoId(null);
    }
  };

  const rol = perfil?.roles?.nombre;
  const puedeArchivar = ['administrador', 'superadministrador', 'dueno'].includes(rol);
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
          <span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-500"><Boxes size={21} /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-amber-500">Consulta general · solo lectura</p>
            <h1 className={`text-xl font-black ${strong}`}>Inventario diario de pollo crudo</h1>
            <p className={`text-xs ${muted}`}>El dueño ve solo sus sucursales; el pollo rostizado se consulta en el reporte de rosticero.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate(-1)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}>
            <ArrowLeft size={15} /> Volver
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
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className={`flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border px-3 py-2 ${input}`}>
            <Search size={16} className={muted} />
            <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar sucursal o sector" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${input}`}>
            <CalendarDays size={15} className={muted} />
            <input type="date" value={fechaFiltro} onChange={(event) => setFechaFiltro(event.target.value)} className="bg-transparent" aria-label="Filtrar por fecha" />
          </label>
          <select value={sucursalFiltro} onChange={(event) => setSucursalFiltro(event.target.value)} className={`rounded-lg border px-3 py-2 text-sm ${input}`} aria-label="Filtrar por sucursal">
            <option value="">Todas las sucursales visibles</option>
            {sucursales.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
          <button type="button" onClick={() => setVerArchivados((valor) => !valor)} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}>
            {verArchivados ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            {verArchivados ? 'Ver activos' : 'Ver archivados'}
          </button>
          <button type="button" onClick={() => cargar()} disabled={cargando} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        <div className="mb-4">
          <div className={`inline-block min-w-48 rounded-xl border p-3 ${card}`}>
            <p className={`text-xs ${muted}`}>{verArchivados ? 'Registros archivados' : 'Inventarios visibles'}</p>
            <p className={`text-xl font-black ${strong}`}>{visibles.length}</p>
          </div>
        </div>

        {error && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
        {mensaje && <p role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">{mensaje}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className={darkMode ? 'bg-slate-950 text-slate-400' : 'bg-gray-50 text-gray-600'}>
              <tr>
                <th className="px-3 py-3 text-left">Fecha / corte</th>
                <th className="px-3 py-3 text-left">Sucursal</th>
                <th className="px-3 py-3 text-right">Inicial</th>
                <th className="px-3 py-3 text-right">Auto.</th>
                <th className="px-3 py-3 text-right">Manual</th>
                <th className="px-3 py-3 text-right">Disponible</th>
                <th className="px-3 py-3 text-right">Conteo final</th>
                <th className="px-3 py-3 text-left">Estado</th>
                <th className="px-3 py-3 text-left">Observaciones</th>
                <th className="px-3 py-3 text-right">Archivo</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((registro) => {
                const automatico = Math.max(0, (Number(registro.pollos_recibidos) || 0) - (Number(registro.pollos_ingreso_manual) || 0));
                const disponible = (Number(registro.pollos_crudos_iniciales) || 0) + (Number(registro.pollos_recibidos) || 0);
                return (
                  <tr key={registro.id} className="border-t border-inherit">
                    <td className={`px-3 py-3 ${strong}`}>{FECHA(registro.fecha)}<span className={`block text-xs ${muted}`}>Corte {formatoHora(registro.hora_corte)}</span></td>
                    <td className={`px-3 py-3 ${strong}`}>{registro.sucursales?.nombre || `Sucursal ${registro.sucursal_id}`}<span className={`block text-xs ${muted}`}>{registro.sucursales?.sector || ''}</span></td>
                    <td className={`px-3 py-3 text-right ${muted}`}>{registro.pollos_crudos_iniciales ?? 0}</td>
                    <td className="px-3 py-3 text-right text-emerald-500">{automatico}</td>
                    <td className="px-3 py-3 text-right text-amber-500">{registro.pollos_ingreso_manual ?? 0}</td>
                    <td className={`px-3 py-3 text-right font-bold ${strong}`}>{disponible}</td>
                    <td className={`px-3 py-3 text-right font-black ${strong}`}>
                      {registro.pollos_crudos_contados
                        ?? (registro.conteo_guardado_en || registro.cerrado_en ? registro.pollos_crudos : '—')}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${registro.cerrado_en ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                        {registro.cerrado_en ? 'Cerrado' : 'Abierto'}
                      </span>
                    </td>
                    <td className={`max-w-[240px] px-3 py-3 ${muted}`}>
                      {registro.observaciones_producto || registro.observaciones || '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {puedeArchivar && (
                        <button
                          type="button"
                          onClick={() => cambiarArchivo(registro)}
                          disabled={procesandoId !== null}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 ${
                            registro.archivado ? 'border-amber-500/30 text-amber-500' : 'border-slate-500/30 text-slate-500'
                          }`}
                        >
                          {procesandoId === registro.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : registro.archivado ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                          {registro.archivado ? 'Restaurar' : 'Archivar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!cargando && visibles.length === 0 && (
                <tr><td colSpan="10" className={`px-3 py-10 text-center ${muted}`}>No hay inventarios diarios reales para estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {cargando && <p className={`mt-3 flex items-center justify-center gap-2 text-sm ${muted}`}><Loader2 size={16} className="animate-spin" /> Consultando inventarios...</p>}
        <p className={`mt-4 text-xs ${muted}`}>Esta vista no permite editar cantidades. Archivar solo organiza la consulta y no modifica saldos ni ajustes.</p>
      </section>
    </main>
  );
}
