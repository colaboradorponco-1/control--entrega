import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../config/supabaseClient';
import { authRepository } from '../../repositories/AuthRepository';
import { duenosRepository } from '../../repositories/duenosRepository';
import {
  ArrowLeft, LogOut, Sun, Moon, Loader2, Plus, X, FileText,
  AlertTriangle, DollarSign, Eye, CheckCircle, Clock, Crown, AlertCircle,
  Search, ChevronLeft, ChevronRight,
} from 'lucide-react';
import PanelNotificaciones from '../../components/PanelNotificaciones';
import {
  inicioDiaISO,
  inicioDiaSiguienteISO,
  normalizarBusqueda,
  POR_PAGINA,
  rangoUltimos30Dias,
} from '../../utils/filtrosHistorial';

const TIPOS = [
  { valor: 'REVISION', label: 'Revisión' },
  { valor: 'MULTA', label: 'Multa' },
  { valor: 'OBSERVACION', label: 'Observación' },
  { valor: 'ALERTA', label: 'Alerta' },
];

export default function GestionRevisionesDueno() {
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [duenos, setDuenos] = useState([]);
  const [revisiones, setRevisiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [periodo, setPeriodo] = useState(rangoUltimos30Dias);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [lecturaFiltro, setLecturaFiltro] = useState('todas');
  const [duenoFiltro, setDuenoFiltro] = useState('todos');
  const [sucursalFiltro, setSucursalFiltro] = useState('todas');
  const [pagina, setPagina] = useState(0);
  const [totalRevisiones, setTotalRevisiones] = useState(0);

  const [form, setForm] = useState({
    dueno_id: '',
    sucursal_id: '',
    titulo: '',
    descripcion: '',
    tipo: 'REVISION',
    area_atencion_cliente: false,
    area_personal: false,
    area_comida: false,
    area_limpieza: false,
    area_infraestructura: false,
    documento_url: '',
    monto_multa: '',
    ayudante_usuario_id: '',
  });
  const [sucursales, setSucursales] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [ayudantes, setAyudantes] = useState([]);
  const [cargandoAyudantes, setCargandoAyudantes] = useState(false);
  const [errorAyudantes, setErrorAyudantes] = useState('');

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';

  const cargarAyudantes = useCallback(async () => {
    try {
      setCargandoAyudantes(true);
      setErrorAyudantes('');
      const { data: rol, error: errorRol } = await supabase
        .from('roles')
        .select('id')
        .eq('nombre', 'ayudante')
        .maybeSingle();
      if (errorRol) throw errorRol;
      if (!rol) {
        setAyudantes([]);
        setErrorAyudantes('No se encontró el rol ayudante. Verifica que la migración esté aplicada.');
        return;
      }

      const { data, error: errorPerfiles } = await supabase
        .from('perfiles_usuario')
        .select('usuario_id, nombre_completo, activo')
        .eq('rol_id', rol.id)
        .order('nombre_completo');
      if (errorPerfiles) throw errorPerfiles;
      const disponibles = (data || []).filter((perfil) => perfil.activo !== false);
      setAyudantes(disponibles);
      if (disponibles.length === 0) {
        setErrorAyudantes('No hay perfiles activos con el rol ayudante. Revisa el rol y estado de la cuenta en Gestión de usuarios.');
      }
    } catch (err) {
      setAyudantes([]);
      setErrorAyudantes(err.message || 'No se pudieron cargar los ayudantes.');
    } finally {
      setCargandoAyudantes(false);
    }
  }, []);

  const cargar = useCallback(async (paginaSolicitada = pagina) => {
    try {
      setCargando(true);
      setError(null);
      // Cargar dueños
      try {
        const duenosData = await duenosRepository.listar();
        setDuenos(duenosData || []);
        if (!duenosData || duenosData.length === 0) {
          setError('No se encontraron dueños registrados. Crea dueños primero en Gestión de Dueños.');
        }
      } catch (e) {
        setError('Error al cargar dueños: ' + (e.message || 'verifica que existan dueños'));
        setDuenos([]);
      }

      // Cargar sucursales
      const { data: sucData, error: errorSucursales } = await supabase
        .from('sucursales')
        .select('id, nombre, sector')
        .order('nombre');
      if (errorSucursales) throw errorSucursales;
      setSucursales(sucData || []);

      const { data: asignacionesData, error: errorAsignaciones } = await supabase
        .from('sucursal_duenos')
        .select('dueno_id, sucursal_id');
      if (errorAsignaciones) throw errorAsignaciones;
      setAsignaciones(asignacionesData || []);

      let consulta = supabase
        .from('revisiones_dueno')
        .select('*', { count: 'exact' })
        .order('creado_en', { ascending: false })
        .range(paginaSolicitada * POR_PAGINA, (paginaSolicitada + 1) * POR_PAGINA - 1);
      if (periodo.desde) consulta = consulta.gte('creado_en', inicioDiaISO(periodo.desde));
      if (periodo.hasta) consulta = consulta.lt('creado_en', inicioDiaSiguienteISO(periodo.hasta));
      if (tipoFiltro !== 'todos') consulta = consulta.eq('tipo', tipoFiltro);
      if (lecturaFiltro === 'leidas') consulta = consulta.eq('leido', true);
      if (lecturaFiltro === 'pendientes') consulta = consulta.eq('leido', false);
      if (duenoFiltro !== 'todos') consulta = consulta.eq('dueno_id', Number(duenoFiltro));
      if (sucursalFiltro !== 'todas') consulta = consulta.eq('sucursal_id', Number(sucursalFiltro));
      const termino = normalizarBusqueda(busquedaAplicada);
      if (termino) consulta = consulta.or(`titulo.ilike.%${termino}%,descripcion.ilike.%${termino}%`);
      const { data: revData, error: errRev, count } = await consulta;
      if (errRev) throw errRev;
      setRevisiones(revData || []);
      setTotalRevisiones(count || 0);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos');
    } finally {
      setCargando(false);
    }
  }, [busquedaAplicada, duenoFiltro, lecturaFiltro, pagina, periodo, sucursalFiltro, tipoFiltro]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarAyudantes(); }, [cargarAyudantes]);

  const sucursalesDelDueno = sucursales.filter((sucursal) =>
    asignaciones.some((asignacion) =>
      String(asignacion.sucursal_id) === String(sucursal.id)
      && String(asignacion.dueno_id) === String(form.dueno_id)
    )
  );

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setBusquedaAplicada(busqueda);
      setPagina(0);
    }, 300);
    return () => window.clearTimeout(temporizador);
  }, [busqueda]);

  const crearRevision = async (e) => {
    e.preventDefault();
    if (!form.dueno_id || !form.ayudante_usuario_id || !form.titulo.trim() || !form.descripcion.trim()) {
      setError('Completa todos los campos obligatorios.');
      return;
    }
    const montoMulta = form.tipo === 'MULTA' ? Number(form.monto_multa) : null;
    if (form.tipo === 'MULTA' && (!Number.isFinite(montoMulta) || montoMulta <= 0)) {
      setError('Ingresa un monto de multa mayor a cero.');
      return;
    }
    try {
      setEnviando(true);
      setError(null);

      const { error: err } = await supabase.rpc('crear_revision_dueno', {
        p_dueno_id: Number(form.dueno_id),
        p_titulo: form.titulo.trim(),
        p_descripcion: form.descripcion.trim(),
        p_tipo: form.tipo,
        p_sucursal_id: form.sucursal_id ? Number(form.sucursal_id) : null,
        p_area_atencion_cliente: form.area_atencion_cliente,
        p_area_personal: form.area_personal,
        p_area_comida: form.area_comida,
        p_area_limpieza: form.area_limpieza,
        p_area_infraestructura: form.area_infraestructura,
        p_documento_url: form.documento_url.trim() || null,
        p_monto_multa: montoMulta,
        p_ayudante_usuario_id: form.ayudante_usuario_id,
      });
      if (err) throw err;
      setMensaje('Registro asignado al ayudante. El dueño lo recibirá cuando se envíe la evidencia.');
      setForm({ dueno_id: '', sucursal_id: '', titulo: '', descripcion: '', tipo: 'REVISION', area_atencion_cliente: false, area_personal: false, area_comida: false, area_limpieza: false, area_infraestructura: false, documento_url: '', monto_multa: '', ayudante_usuario_id: '' });
      setMostrarForm(false);
      setPagina(0);
      await cargar(0);
    } catch (err) {
      setError(err.message || 'No se pudo crear la revisión');
    } finally {
      setEnviando(false);
    }
  };

  const severidadColor = (s) => {
    if (s === 'GRAVE') return 'text-red-500 bg-red-500/10';
    if (s === 'ADVERTENCIA') return 'text-amber-500 bg-amber-500/10';
    return 'text-blue-500 bg-blue-500/10';
  };

  const tipoIcono = (tipo) => {
    if (tipo === 'MULTA') return <DollarSign size={16} className="text-red-500" />;
    if (tipo === 'ALERTA') return <AlertTriangle size={16} className="text-amber-500" />;
    return <FileText size={16} className="text-blue-500" />;
  };

  useEffect(() => {
    if (!mostrarForm) return undefined;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const cerrarConEscape = (evento) => {
      if (evento.key === 'Escape' && !enviando) setMostrarForm(false);
    };
    document.addEventListener('keydown', cerrarConEscape);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', cerrarConEscape);
    };
  }, [mostrarForm, enviando]);

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-800'}`}>
      <header className={`${card} border-b sticky top-0 z-30`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Crown size={20} className="text-amber-500" />
            <h1 className={`font-black tracking-tight ${strong}`}>Revisiones y Multas</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/panel')} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Volver">
              <ArrowLeft size={18} />
            </button>
            <PanelNotificaciones rutaPedido="/admin" />
            <button onClick={toggleTheme} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Tema">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={() => authRepository.logout()} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Salir">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {error && (
          <div className={`mb-4 p-3 border text-sm flex items-center gap-2 rounded-xl ${darkMode ? 'bg-red-950/50 border-red-500/50 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {mensaje && (
          <div className={`mb-4 p-3 rounded-xl border text-sm font-medium ${darkMode ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {mensaje}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <p className={`text-sm ${muted}`}>Crea revisiones y multas, asigna un ayudante y envía el registro al dueño cuando se adjunte evidencia.</p>
          <button
            onClick={() => {
              setError(null);
              setMostrarForm(true);
              cargarAyudantes();
            }}
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-purple-700"
          >
            <Plus size={16} /> Nueva revisión
          </button>
        </div>

        {/* Formulario en ventana emergente */}
        {mostrarForm && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
            onClick={(evento) => {
              if (evento.target === evento.currentTarget && !enviando) setMostrarForm(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-revision-titulo"
              className={`${card} my-auto w-full max-w-4xl rounded-2xl border p-4 shadow-2xl sm:p-6`}
            >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="modal-revision-titulo" className={`text-lg font-black ${strong}`}>Nueva revisión / multa</h2>
              <button
                type="button"
                disabled={enviando}
                onClick={() => setMostrarForm(false)}
                className={`rounded-lg p-2 ${muted} hover:bg-slate-500/10 disabled:opacity-50`}
                aria-label="Cerrar formulario"
              >
                <X size={18} />
              </button>
            </div>
            {error && (
              <div className={`mb-4 flex items-center gap-2 rounded-xl border p-3 text-sm ${darkMode ? 'border-red-500/50 bg-red-950/50 text-red-200' : 'border-red-200 bg-red-50 text-red-700'}`}>
                <AlertCircle size={16} /> {error}
              </div>
            )}
            <form onSubmit={crearRevision} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Dueño *
                  <select
                    required
                    value={form.dueno_id}
                    onChange={(e) => setForm({ ...form, dueno_id: e.target.value, sucursal_id: '' })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  >
                    <option value="">Selecciona un dueño</option>
                    {duenos.length === 0 && (
                      <option value="" disabled>No hay dueños registrados</option>
                    )}
                    {duenos.map((d) => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                </label>
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Tipo
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  >
                    {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                  </select>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="ayudante-asignado" className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                    Ayudante asignado *
                  </label>
                  <button
                    type="button"
                    onClick={cargarAyudantes}
                    disabled={cargandoAyudantes}
                    className="text-[11px] font-semibold text-purple-500 hover:underline disabled:opacity-50"
                  >
                    {cargandoAyudantes ? 'Buscando...' : 'Actualizar lista'}
                  </button>
                </div>
                <select
                  id="ayudante-asignado"
                  required
                  value={form.ayudante_usuario_id}
                  onChange={(e) => setForm({ ...form, ayudante_usuario_id: e.target.value })}
                  disabled={cargandoAyudantes}
                  className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                >
                  <option value="">
                    {cargandoAyudantes ? 'Cargando ayudantes...' : 'Selecciona un ayudante'}
                  </option>
                  {ayudantes.map((ayudante) => (
                    <option key={ayudante.usuario_id} value={ayudante.usuario_id}>{ayudante.nombre_completo}</option>
                  ))}
                </select>
                {errorAyudantes && (
                  <span className={`mt-1 block normal-case ${ayudantes.length ? muted : 'text-amber-500'}`}>
                    {errorAyudantes}
                  </span>
                )}
              </div>

              <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                Título *
                <input
                  required
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  placeholder="Ej: Multa por faltantes recurrentes"
                />
              </label>

              <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                Descripción *
                <textarea
                  required
                  rows={4}
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  placeholder="Detalle de la revisión o multa..."
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {form.tipo === 'MULTA' && (
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                    Monto de la multa (Bs) *
                    <input
                      required
                      min="0.01"
                      step="0.01"
                      type="number"
                      value={form.monto_multa}
                      onChange={(e) => setForm({ ...form, monto_multa: e.target.value })}
                      className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                      placeholder="0.00"
                    />
                  </label>
                )}
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Sucursal (opcional)
                  <select
                    value={form.sucursal_id}
                    onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  >
                    <option value="">Todas / General</option>
                    {sucursalesDelDueno.map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}{s.sector ? ` · ${s.sector}` : ''}</option>
                    ))}
                  </select>
                </label>
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  URL del documento (opcional)
                  <input
                    value={form.documento_url}
                    onChange={(e) => setForm({ ...form, documento_url: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                    placeholder="https://..."
                  />
                </label>
                <div className={`rounded-xl border p-4 ${darkMode ? 'border-slate-700 bg-slate-950/50' : 'border-gray-200 bg-gray-50'}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider ${muted} mb-3`}>Áreas afectadas</p>
                  <div className="flex flex-wrap gap-4">
                    <label className={`flex items-center gap-2 text-xs ${normal}`}>
                      <input
                        type="checkbox"
                        checked={form.area_atencion_cliente}
                        onChange={(e) => setForm({ ...form, area_atencion_cliente: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Atención al cliente
                    </label>
                    <label className={`flex items-center gap-2 text-xs ${normal}`}>
                      <input
                        type="checkbox"
                        checked={form.area_personal}
                        onChange={(e) => setForm({ ...form, area_personal: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Personal
                    </label>
                    <label className={`flex items-center gap-2 text-xs ${normal}`}>
                      <input
                        type="checkbox"
                        checked={form.area_comida}
                        onChange={(e) => setForm({ ...form, area_comida: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Comida
                    </label>
                    <label className={`flex items-center gap-2 text-xs ${normal}`}>
                      <input
                        type="checkbox"
                        checked={form.area_limpieza}
                        onChange={(e) => setForm({ ...form, area_limpieza: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Limpieza
                    </label>
                    <label className={`flex items-center gap-2 text-xs ${normal}`}>
                      <input
                        type="checkbox"
                        checked={form.area_infraestructura}
                        onChange={(e) => setForm({ ...form, area_infraestructura: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Infraestructura
                    </label>
                  </div>
                </div>

              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => setMostrarForm(false)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50 ${input}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-purple-700 disabled:opacity-60"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Crear y notificar
                </button>
              </div>
            </form>
          </div>
          </div>
        )}

        <div className={`${card} mb-4 grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-4`}>
          <label className={`relative text-xs font-semibold ${muted}`}>
            Buscar título o descripción
            <Search size={15} className="pointer-events-none absolute left-3 top-9" />
            <input
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              className={`mt-1 w-full rounded-xl border py-2 pl-9 pr-3 text-sm font-normal ${input}`}
              placeholder="Escribe para buscar..."
            />
          </label>
          <label className={`text-xs font-semibold ${muted}`}>
            Tipo
            <select
              value={tipoFiltro}
              onChange={(evento) => { setTipoFiltro(evento.target.value); setPagina(0); }}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
            >
              <option value="todos">Todos los tipos</option>
              {TIPOS.map((tipo) => <option key={tipo.valor} value={tipo.valor}>{tipo.label}</option>)}
            </select>
          </label>
          <label className={`text-xs font-semibold ${muted}`}>
            Estado
            <select
              value={lecturaFiltro}
              onChange={(evento) => { setLecturaFiltro(evento.target.value); setPagina(0); }}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
            >
              <option value="todas">Leídas y pendientes</option>
              <option value="pendientes">Pendientes</option>
              <option value="leidas">Leídas</option>
            </select>
          </label>
          <label className={`text-xs font-semibold ${muted}`}>
            Dueño
            <select
              value={duenoFiltro}
              onChange={(evento) => { setDuenoFiltro(evento.target.value); setPagina(0); }}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
            >
              <option value="todos">Todos los dueños</option>
              {duenos.map((dueno) => <option key={dueno.id} value={dueno.id}>{dueno.nombre}</option>)}
            </select>
          </label>
          <label className={`text-xs font-semibold ${muted}`}>
            Sucursal
            <select
              value={sucursalFiltro}
              onChange={(evento) => { setSucursalFiltro(evento.target.value); setPagina(0); }}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
            >
              <option value="todas">Todas las sucursales</option>
              {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
            </select>
          </label>
          <label className={`text-xs font-semibold ${muted}`}>
            Desde
            <input
              type="date"
              value={periodo.desde}
              max={periodo.hasta}
              onChange={(evento) => { setPeriodo((actual) => ({ ...actual, desde: evento.target.value })); setPagina(0); }}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
            />
          </label>
          <label className={`text-xs font-semibold ${muted}`}>
            Hasta
            <input
              type="date"
              value={periodo.hasta}
              min={periodo.desde}
              onChange={(evento) => { setPeriodo((actual) => ({ ...actual, hasta: evento.target.value })); setPagina(0); }}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${input}`}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setPeriodo(rangoUltimos30Dias());
              setBusqueda('');
              setBusquedaAplicada('');
              setTipoFiltro('todos');
              setLecturaFiltro('todas');
              setDuenoFiltro('todos');
              setSucursalFiltro('todas');
              setPagina(0);
            }}
            className={`self-end rounded-xl border px-3 py-2 text-sm font-semibold ${input}`}
          >
            Limpiar filtros
          </button>
        </div>

        <div className={`mb-3 text-xs ${muted}`}>
          Mostrando {revisiones.length} de {totalRevisiones} registros de los últimos 30 días o del período elegido.
        </div>

        {/* Lista de revisiones */}
        {cargando ? (
          <div className="flex items-center justify-center gap-3 py-20">
            <Loader2 size={24} className="animate-spin text-amber-500" />
            <span className={muted}>Cargando...</span>
          </div>
        ) : totalRevisiones === 0 ? (
          <div className={`${card} border rounded-2xl p-10 text-center`}>
            <FileText size={40} className={`mx-auto mb-4 ${muted}`} />
            <p className={`font-bold mb-2 ${strong}`}>No hay resultados</p>
            <p className={`text-sm ${muted}`}>Prueba cambiando el período o los filtros. Los registros antiguos se conservan.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {revisiones.map((r) => (
              <div key={r.id} className={`${card} border rounded-2xl p-4`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${severidadColor(r.severidad)}`}>
                    {tipoIcono(r.tipo)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${strong}`}>{r.titulo}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>
                        {r.tipo}
                      </span>
                      {r.leido ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-500">
                          <CheckCircle size={10} /> Leído
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-amber-500">
                          <Clock size={10} /> Pendiente
                        </span>
                      )}
                      {r.estado_flujo && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          r.estado_flujo === 'ENVIADA_DUENO'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-amber-500/10 text-amber-500'
                        }`}>
                          {r.estado_flujo === 'ENVIADA_DUENO' ? 'Enviada al dueño' : 'Pendiente de evidencia'}
                        </span>
                      )}
                    </div>
                    <p className={`mt-1 text-xs ${muted}`}>
                      Dueño #{r.dueno_id} · {r.creado_por_nombre || 'Sistema'} · {new Date(r.creado_en).toLocaleString('es-BO')}
                    </p>

                    {r.documento_url && (
                      <a
                        href={r.documento_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 hover:underline"
                      >
                        <Eye size={12} /> Ver documento
                      </a>
                    )}
                    {r.sucursal_id && (
                      <p className={`text-[10px] ${muted} mt-0.5`}>
                        Sucursal #{r.sucursal_id}
                      </p>
                    )}
                    {(r.area_atencion_cliente || r.area_personal || r.area_comida || r.area_limpieza || r.area_infraestructura) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.area_atencion_cliente && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-500">Atención al cliente</span>}
                        {r.area_personal && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/10 text-purple-500">Personal</span>}
                        {r.area_comida && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-500">Comida</span>}
                        {r.area_limpieza && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500">Limpieza</span>}
                        {r.area_infraestructura && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500/10 text-gray-500">Infraestructura</span>}
                      </div>
                    )}
                    {!cargando && totalRevisiones > POR_PAGINA && (
                      <div className={`mt-4 flex items-center justify-between ${muted}`}>
                        <span className="text-xs">Página {pagina + 1} de {Math.ceil(totalRevisiones / POR_PAGINA)}</span>
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
                            disabled={(pagina + 1) * POR_PAGINA >= totalRevisiones}
                            onClick={() => setPagina((actual) => actual + 1)}
                            className={`rounded-lg border p-2 disabled:opacity-40 ${input}`}
                            aria-label="Página siguiente"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                    {r.videos?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.videos.map((url, index) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-blue-500 hover:underline"
                          >
                            Ver evidencia {index + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
