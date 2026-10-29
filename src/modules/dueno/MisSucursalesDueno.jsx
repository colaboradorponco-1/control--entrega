import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { authRepository } from '../../repositories/AuthRepository';
import { pedidosRepository } from '../../repositories/pedidosRepository';
import { evidenciasRepository } from '../../repositories/evidenciasRepository';
import { supabase } from '../../config/supabaseClient';
import SeguimientoRepartidor from '../../components/SeguimientoRepartidor';
import { exportarAExcel } from '../../utils/exportUtils';
import PanelNotificaciones from '../../components/PanelNotificaciones';
import {
  ArrowLeft, LogOut, Sun, Moon, MapPin, Loader2, Crown,
  TrendingUp, Boxes, AlertCircle, Search, Plus, X, ShoppingCart,
  History, ChevronDown, ChevronUp, Camera, Archive, ArchiveRestore, Trash2,
  Download, Ban, Copy, Clock, ChevronRight, FilterX, Truck, CheckCheck, Calendar, AlertTriangle, Eye, FileText,
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
const ESTADOS_FINALES = ['ENTREGADO', 'CANCELADO', 'RECHAZADO'];
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
const ETIQUETA_ESTADO_PRODUCTO = {
  FRESCO: 'Fresco y refrigerado',
  TIBIO: 'Fresco, pero tibio',
  EMBALAJE: 'Embalaje dañado o húmedo',
  DETERIORO: 'Presenta deterioro',
  OTRO: 'Otro',
};

// Columnas disponibles para ordenar
const ORDEN_COLS = {
  id: (a, b) => b.id - a.id,
  fecha: (a, b) => (a.fecha || '').localeCompare(b.fecha || ''),
  unidades: (a, b) => (parseInt(b.unidades) || 0) - (parseInt(a.unidades) || 0),
  kilos: (a, b) => (parseFloat(b.kilos_despachados) || 0) - (parseFloat(a.kilos_despachados) || 0),
  estado: (a, b) => (a.estado || '').localeCompare(b.estado || ''),
};

const IconoOrden = ({ col, orden }) => {
  if (orden.col !== col) return <ChevronRight size={12} className="opacity-30 rotate-90" />;
  return orden.dir === 'desc'
    ? <ChevronDown size={12} className="text-amber-500" />
    : <ChevronUp size={12} className="text-amber-500" />;
};

export default function MisSucursalesDueno() {
  const { usuario, perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [error, setErrorRaw] = useState(null);
  const [mensaje, setMensajeRaw] = useState('');

  // Limpian el opuesto al setearse para que nunca convivan los dos.
  const setError = useCallback((msg) => { setErrorRaw(msg); if (msg) setMensajeRaw(''); }, []);
  const setMensaje = useCallback((msg) => { setMensajeRaw(msg); if (msg) setErrorRaw(null); }, []);

  // Auto-cierre del mensaje de éxito a los 5 segundos.
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensajeRaw(''), 5000);
    return () => clearTimeout(t);
  }, [mensaje]);

  // Título de la pestaña con contador de pendientes.
  // Se define aquí con placeholder; el valor real viene de metricas (calculado más abajo).

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
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroSucursal, setFiltroSucursal] = useState('TODAS');
  const [verArchivados, setVerArchivados] = useState(false);
  const [expandidoId, setExpandidoId] = useState(null);
  const [procesandoId, setProcesandoId] = useState(null);
  const [fotoUrl, setFotoUrl] = useState(null);
  const [cargandoFoto, setCargandoFoto] = useState(false);
  // Ordenamiento de tabla: { col: keyof ORDEN_COLS, dir: 'asc'|'desc' }
  const [orden, setOrden] = useState({ col: 'id', dir: 'desc' });
  // Conteo de archivados para el badge del botón
  const [totalArchivados, setTotalArchivados] = useState(0);

  // ─── Revisiones y Multas (notificaciones del admin/superadmin) ───────────────
  const [duenoId, setDuenoId] = useState(undefined);
  const [revisiones, setRevisiones] = useState([]);
  const [cargandoRevisiones, setCargandoRevisiones] = useState(false);
  const [revisionSeleccionada, setRevisionSeleccionada] = useState(null);

  const cargarRevisiones = useCallback(async () => {
    try {
      setCargandoRevisiones(true);
      if (!duenoId) { setRevisiones([]); return; }
      const { data, error: err } = await supabase
        .from('revisiones_dueno')
        .select('*')
        .eq('dueno_id', duenoId)
        .order('creado_en', { ascending: false })
        .limit(20);
      if (err) throw err;
      setRevisiones(data || []);
    } catch (e) {
      console.error('Error cargando revisiones:', e);
    } finally {
      setCargandoRevisiones(false);
    }
  }, [duenoId]);

  useEffect(() => {
    if (duenoId) cargarRevisiones();
  }, [duenoId, cargarRevisiones]);

  const marcarRevisionLeida = async (rev) => {
    if (rev.leido) return;
    try {
      await supabase.rpc('marcar_revision_leida', { p_revision_id: rev.id });
      setRevisiones((prev) => prev.map((r) => r.id === rev.id ? { ...r, leido: true, leido_en: new Date().toISOString() } : r));
    } catch (e) {
      console.error('Error marcando revisión:', e);
    }
  };

  const abrirRevision = (rev) => {
    setRevisionSeleccionada(rev);
    marcarRevisionLeida(rev);
  };

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
      const todos = await pedidosRepository.listar();
      setPedidos(todos);
      setTotalArchivados(todos.filter((p) => p.archivado).length);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los pedidos');
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [setError]);

  const cargarDisponibilidad = useCallback(async () => {
    try {
      setCargandoDisponibilidad(true);
      setDisponibilidad(await pedidosRepository.obtenerDisponibilidadPedidosPlanta());
    } catch {
      setDisponibilidad(null);
    } finally {
      setCargandoDisponibilidad(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    cargarDisponibilidad();

    const canal = supabase
      .channel('dueno-pedidos-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' },
        () => { cargar({ silencioso: true }); cargarDisponibilidad(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_estado_historial' },
        () => cargar({ silencioso: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_reportes_entrega' },
        () => cargar({ silencioso: true }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'control_inventario_diario' },
        () => cargarDisponibilidad())
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [cargar, cargarDisponibilidad]);


  useEffect(() => {
    const revisar = async () => {
      const { data, error: err } = await supabase
        .from('perfiles_usuario')
        .select('dueno_id')
        .eq('usuario_id', usuario?.id)
        .maybeSingle();
      if (err) { setDuenoId(null); return; }
      setDuenoId(data?.dueno_id ?? null);
    };
    if (usuario?.id) revisar();
  }, [usuario?.id]);

  const cargarSucursales = useCallback(async () => {
    try {
      const asignadas = await pedidosRepository.listarSucursalesParaPedidoDueno();
      setSucursales(asignadas);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar tus sucursales');
    }
  }, [setError]);

  useEffect(() => {
    if (!duenoId) return undefined;

    cargarSucursales();

    // Si el administrador cambia datos de una sucursal (por ejemplo el
    // stock mínimo), el panel del dueño se actualiza sin recargar.
    const canal = supabase
      .channel('dueno-sucursales-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sucursales' },
        () => cargarSucursales())
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [duenoId, cargarSucursales]);

  const esDueño = perfil?.roles?.nombre === 'dueno';
  const sinVinculo = esDueño && duenoId === null;
  const hoy = fechaHoyBolivia();

  // ─── Crear pedido ────────────────────────────────────────────────────────────
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
    if (formPedido.fecha < hoy) {
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
      setFormPedido({ sucursal_id: '', unidades: '', fecha: hoy, observaciones: '' });
      setMostrarPedido(false);
      setError(null);
      setMensaje('✓ Pedido enviado a la planta. Ya aparece en el seguimiento.');
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo enviar el pedido');
    } finally {
      setEnviandoPedido(false);
    }
  };

  // ─── Cancelar pedido (solo PENDIENTE) ────────────────────────────────────────
  const [cancelandoId, setCancelandoId] = useState(null);
  const cancelarPedido = async (pedido) => {
    if (!window.confirm(`¿Cancelar el pedido #${pedido.id} para ${pedido.sucursales?.nombre || 'la sucursal'}? Esta acción no se puede deshacer.`)) return;
    try {
      setCancelandoId(pedido.id);
      await pedidosRepository.cancelar(pedido.id);
      setMensaje(`Pedido #${pedido.id} cancelado.`);
      await cargar({ silencioso: true });
    } catch (err) {
      setError(err.message || 'No se pudo cancelar el pedido');
    } finally {
      setCancelandoId(null);
    }
  };

  // ─── Repetir pedido ──────────────────────────────────────────────────────────
  const repetirPedido = async (pedido) => {
    setFormPedido({
      sucursal_id: String(pedido.sucursal_id),
      unidades: String(pedido.unidades),
      fecha: hoy,
      observaciones: pedido.observaciones || '',
    });
    setBusquedaSucursal('');
    setError(null);
    setMensaje('');
    setMostrarPedido(true);
    cargarDisponibilidad();
  };

  // ─── Abrir nuevo pedido vacío ─────────────────────────────────────────────────
  const sucursalesFiltradas = useMemo(() => {
    const t = busquedaSucursal.trim().toLowerCase();
    const base = t
      ? sucursales.filter((s) =>
          (s.nombre || '').toLowerCase().includes(t) ||
          (s.sector || '').toLowerCase().includes(t))
      : sucursales;
    const seleccionada = sucursales.find((s) => String(s.id) === String(formPedido.sucursal_id));
    if (seleccionada && !base.some((s) => s.id === seleccionada.id)) return [seleccionada, ...base];
    return base;
  }, [sucursales, busquedaSucursal, formPedido.sucursal_id]);

  const unidadesPedidas = Number(formPedido.unidades) || 0;
  const unidadesDisponibles = disponibilidad?.unidades_disponibles;
  const excedeDisponible = typeof unidadesDisponibles === 'number' && unidadesPedidas > unidadesDisponibles;

  const abrirNuevoPedido = useCallback(async () => {
    setFormPedido({ sucursal_id: '', unidades: '', fecha: hoy, observaciones: '' });
    setBusquedaSucursal('');
    setError(null);
    setMensaje('');
    setMostrarPedido(true);
    cargarDisponibilidad();
  }, [hoy, setError, setMensaje, cargarDisponibilidad]);

  // ─── Archivar / restaurar ────────────────────────────────────────────────────
  const archivarPedido = async (pedido) => {
    const accion = verArchivados ? 'restaurar' : 'archivar';
    if (!window.confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} el pedido #${pedido.id}?`)) return;
    try {
      setProcesandoId(pedido.id);
      await pedidosRepository.archivar(pedido.id, !verArchivados);
      setMensaje(verArchivados
        ? `Pedido #${pedido.id} restaurado al historial.`
        : `Pedido #${pedido.id} archivado.`);
      setExpandidoId(null);
      await cargar({ silencioso: true });
    } catch (err) {
      setError(err.message || 'No se pudo archivar el pedido');
    } finally {
      setProcesandoId(null);
    }
  };

  const eliminarPedido = async (pedido) => {
    if (!window.confirm(`¿Borrar definitivamente el pedido #${pedido.id}? Esta acción no se puede deshacer.`)) return;
    try {
      setProcesandoId(pedido.id);
      await pedidosRepository.eliminarArchivado(pedido.id);
      setMensaje(`Pedido #${pedido.id} eliminado.`);
      await cargar({ silencioso: true });
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el pedido');
    } finally {
      setProcesandoId(null);
    }
  };

  const verFoto = async (ruta) => {
    try {
      setCargandoFoto(true);
      setFotoUrl(await evidenciasRepository.url(ruta));
    } catch (err) {
      setError(err.message || 'No se pudo abrir la foto');
    } finally {
      setCargandoFoto(false);
    }
  };

  // ─── Datos derivados ──────────────────────────────────────────────────────────
  const visibles = useMemo(
    () => pedidos.filter((p) => Boolean(p.archivado) === verArchivados),
    [pedidos, verArchivados]
  );

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const base = visibles.filter((p) => {
      if (filtroEstado !== 'TODOS' && p.estado !== filtroEstado) return false;
      if (filtroSucursal !== 'TODAS' && String(p.sucursal_id) !== filtroSucursal) return false;
      const fecha = p.fecha || (p.creado_en ? p.creado_en.slice(0, 10) : '');
      if (filtroDesde && fecha < filtroDesde) return false;
      if (filtroHasta && fecha > filtroHasta) return false;
      if (!t) return true;
      return (
        String(p.id).includes(t) ||
        (p.sucursales?.nombre || '').toLowerCase().includes(t) ||
        (p.estado || '').toLowerCase().includes(t)
      );
    });

    // Ordenamiento por columna
    const comparador = ORDEN_COLS[orden.col] || ORDEN_COLS.id;
    const ordenados = [...base].sort(comparador);
    return orden.dir === 'asc' ? ordenados.reverse() : ordenados;
  }, [visibles, busqueda, filtroEstado, filtroSucursal, filtroDesde, filtroHasta, orden]);

  const resumenSucursales = useMemo(() => {
    const mapa = new Map();
    for (const p of visibles) {
      const clave = p.sucursal_id;
      const item = mapa.get(clave) || {
        id: clave,
        nombre: p.sucursales?.nombre || `Sucursal ${clave}`,
        pedidos: 0, unidades: 0, kilos: 0, pendientes: 0, porRecibir: 0, sinReporte: 0,
      };
      item.pedidos += 1;
      item.unidades += parseInt(p.unidades, 10) || 0;
      item.kilos += parseFloat(p.kilos_despachados) || 0;
      if (!ESTADOS_FINALES.includes(p.estado)) item.pendientes += 1;
      // En camino y todavia sin recepcion: la sucursal debe confirmar.
      if (p.estado === 'RECOGIDO' && !p.pedido_recepciones?.length) item.porRecibir += 1;
      // Entregado pero sin reporte de entrega de la sucursal.
      if (p.estado === 'ENTREGADO' && p.pedido_recepciones?.length && !p.reporte_entrega) item.sinReporte += 1;
      mapa.set(clave, item);
    }
    return [...mapa.values()].sort((a, b) => b.pedidos - a.pedidos);
  }, [visibles]);

  const metricas = useMemo(() => {
    const num = (v) => parseFloat(v) || 0;
    return {
      pedidos: visibles.length,
      unidades: visibles.reduce((a, p) => a + (parseInt(p.unidades) || 0), 0),
      kilos: visibles.reduce((a, p) => a + num(p.kilos_despachados), 0),
      pendientes: visibles.filter((p) => !ESTADOS_FINALES.includes(p.estado)).length,
      porRecibir: visibles.filter((p) => p.estado === 'RECOGIDO' && !p.pedido_recepciones?.length).length,
      sinReporte: visibles.filter(
        (p) => p.estado === 'ENTREGADO' && p.pedido_recepciones?.length && !p.reporte_entrega
      ).length,
    };
  }, [visibles]);

  const pedidosPorRecibir = useMemo(
    () => visibles.filter((p) => p.estado === 'RECOGIDO' && !p.pedido_recepciones?.length),
    [visibles]
  );

  // Semáforo de stock: inventario de planta contra la suma de los
  // mínimos definidos por el administrador para las sucursales del dueño.
  const totalMinimo = useMemo(
    () => sucursales.reduce((acc, s) => acc + (parseInt(s.stock_minimo, 10) || 0), 0),
    [sucursales]
  );

  const semaforoStock = useMemo(() => {
    if (!disponibilidad || totalMinimo <= 0) return null;
    const stock = Number(disponibilidad.unidades_stock) || 0;
    const disponibles = Number(disponibilidad.unidades_disponibles) || 0;
    const pct = Math.round((stock / totalMinimo) * 100);
    const estado = pct < 50 ? 'critico' : pct < 100 ? 'alerta' : 'ok';
    return { stock, disponibles, pct, estado, faltan: Math.max(totalMinimo - stock, 0) };
  }, [disponibilidad, totalMinimo]);

  // Título de pestaña con pendientes
  useEffect(() => {
    const titulo = metricas.pendientes > 0
      ? `Mis Sucursales (${metricas.pendientes} pendiente${metricas.pendientes > 1 ? 's' : ''})`
      : 'Mis Sucursales';
    document.title = titulo;
    return () => { document.title = 'Control Pollo'; };
  }, [metricas.pendientes]);

  // ─── KPIs comparativos (mes actual vs. mes anterior) ──────────────────────
  const kpisComparativos = useMemo(() => {
    const ahora = new Date();
    const inicioMesActual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const inicioMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
    const finMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth(), 0);

    const filtrarPorRango = (lista, desde, hasta) =>
      lista.filter((p) => {
        const fecha = p.fecha || (p.creado_en ? p.creado_en.slice(0, 10) : '');
        if (!fecha) return false;
        return fecha >= desde.toISOString().slice(0, 10) && fecha <= hasta.toISOString().slice(0, 10);
      });

    const mesActual = filtrarPorRango(visibles, inicioMesActual, ahora);
    const mesAnterior = filtrarPorRango(visibles, inicioMesAnterior, finMesAnterior);

    const calc = (lista) => ({
      pedidos: lista.length,
      unidades: lista.reduce((a, p) => a + (parseInt(p.unidades) || 0), 0),
      kilos: lista.reduce((a, p) => a + (parseFloat(p.kilos_despachados) || 0), 0),
      pendientes: lista.filter((p) => !ESTADOS_FINALES.includes(p.estado)).length,
    });

    const actual = calc(mesActual);
    const anterior = calc(mesAnterior);

    const variacion = (valActual, valAnterior) => {
      if (valAnterior === 0) return valActual > 0 ? 100 : 0;
      return Math.round(((valActual - valAnterior) / valAnterior) * 100);
    };

    return {
      actual,
      anterior,
      variacionPedidos: variacion(actual.pedidos, anterior.pedidos),
      variacionUnidades: variacion(actual.unidades, anterior.unidades),
      variacionKilos: variacion(actual.kilos, anterior.kilos),
      variacionPendientes: variacion(actual.pendientes, anterior.pendientes),
    };
  }, [visibles]);
  // ─── Atajos de teclado ───────────────────────────────────────────────────────
  useEffect(() => {
    const manejarTecla = (e) => {
      // Ctrl+N: nuevo pedido
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        if (esDueño && !sinVinculo && sucursales.length > 0) {
          abrirNuevoPedido();
        }
      }
      // Ctrl+F: focus en búsqueda
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        const inputBusqueda = document.querySelector('input[placeholder="Buscar por número o sucursal"]');
        if (inputBusqueda) inputBusqueda.focus();
      }
      // Esc: cerrar modal de pedido
      if (e.key === 'Escape' && mostrarPedido) {
        setMostrarPedido(false);
      }
    };
    document.addEventListener('keydown', manejarTecla);
    return () => document.removeEventListener('keydown', manejarTecla);
  }, [esDueño, sinVinculo, sucursales.length, mostrarPedido, abrirNuevoPedido]);

  // ─── Scorecard de sucursales ────────────────────────────────────────────────
  const scorecardSucursales = useMemo(() => {
    const mapa = new Map();
    for (const p of visibles) {
      const clave = p.sucursal_id;
      const item = mapa.get(clave) || {
        id: clave,
        nombre: p.sucursales?.nombre || `Sucursal ${clave}`,
        total: 0,
        entregados: 0,
        aTiempo: 0,
        conFaltantes: 0,
        tiempoRecepcion: [],
        unidades: 0,
        kilos: 0,
      };
      item.total += 1;
      item.unidades += parseInt(p.unidades, 10) || 0;
      item.kilos += parseFloat(p.kilos_despachados) || 0;
      if (p.estado === 'ENTREGADO') {
        item.entregados += 1;
        if (p.fecha && p.creado_en) {
          const fechaReq = new Date(p.fecha);
          const fechaEntrega = new Date(p.actualizado_en || p.creado_en);
          if (fechaEntrega <= fechaReq) item.aTiempo += 1;
        }
        const recepcion = p.pedido_recepciones?.[0];
        if (recepcion?.faltantes > 0) item.conFaltantes += 1;
        if (recepcion?.recibido_en && p.creado_en) {
          const ms = new Date(recepcion.recibido_en) - new Date(p.creado_en);
          item.tiempoRecepcion.push(ms / (1000 * 60 * 60)); // horas
        }
      }
      mapa.set(clave, item);
    }
    return [...mapa.values()]
      .map((s) => ({
        ...s,
        pctEntregas: s.total > 0 ? Math.round((s.entregados / s.total) * 100) : 0,
        pctATiempo: s.entregados > 0 ? Math.round((s.aTiempo / s.entregados) * 100) : 0,
        pctFaltantes: s.entregados > 0 ? Math.round((s.conFaltantes / s.entregados) * 100) : 0,
        tiempoPromedio: s.tiempoRecepcion.length > 0
          ? (s.tiempoRecepcion.reduce((a, b) => a + b, 0) / s.tiempoRecepcion.length).toFixed(1)
          : '—',
        score: s.total > 0
          ? Math.round((s.entregados / s.total) * 40 + (s.aTiempo / Math.max(s.entregados, 1)) * 40 - (s.conFaltantes / Math.max(s.entregados, 1)) * 20)
          : 0,
      }))
      .sort((a, b) => b.score - a.score);
  }, [visibles]);

  // ─── Tendencia de consumo (por semana) ───────────────────────────────────────
  const tendenciaConsumo = useMemo(() => {
    const semanas = new Map();
    for (const p of visibles) {
      const fecha = p.fecha || (p.creado_en ? p.creado_en.slice(0, 10) : '');
      if (!fecha) continue;
      const d = new Date(fecha);
      const inicioSemana = new Date(d);
      inicioSemana.setDate(d.getDate() - d.getDay());
      const clave = inicioSemana.toISOString().slice(0, 10);
      const item = semanas.get(clave) || { semana: clave, unidades: 0, kilos: 0, pedidos: 0 };
      item.unidades += parseInt(p.unidades, 10) || 0;
      item.kilos += parseFloat(p.kilos_despachados) || 0;
      item.pedidos += 1;
      semanas.set(clave, item);
    }
    return [...semanas.values()].sort((a, b) => a.semana.localeCompare(b.semana)).slice(-8);
  }, [visibles]);

  // ─── Costo por unidad (kg/unidad) ────────────────────────────────────────────
  const costoPorUnidad = useMemo(() => {
    const entregados = visibles.filter((p) => p.estado === 'ENTREGADO' && p.kilos_despachados && p.unidades);
    if (entregados.length === 0) return null;
    const totalKilos = entregados.reduce((a, p) => a + (parseFloat(p.kilos_despachados) || 0), 0);
    const totalUnidades = entregados.reduce((a, p) => a + (parseInt(p.unidades) || 0), 0);
    return totalUnidades > 0 ? (totalKilos / totalUnidades).toFixed(2) : null;
  }, [visibles]);
  // ─── Alerta de stock predictivo ─────────────────────────────────────────────
  const stockPredictivo = useMemo(() => {
    if (!disponibilidad || totalMinimo <= 0) return null;
    const stock = Number(disponibilidad.unidades_stock) || 0;
    const reservadas = Number(disponibilidad.unidades_reservadas) || 0;
    const enPreparacion = visibles.filter(
      (p) => ['EN_PREPARACION', 'LISTO', 'APROBADO'].includes(p.estado)
    );
    const unidadesComprometidas = enPreparacion.reduce(
      (a, p) => a + (parseInt(p.unidades) || 0), 0
    );
    const stockProyectado = stock - unidadesComprometidas;
    const pct = Math.round((stockProyectado / totalMinimo) * 100);
    const estado = stockProyectado < 0 ? 'critico' : pct < 50 ? 'critico' : pct < 100 ? 'alerta' : 'ok';
    return {
      stock,
      reservadas,
      unidadesComprometidas,
      stockProyectado,
      pct,
      estado,
      faltan: Math.max(totalMinimo - stockProyectado, 0),
    };
  }, [disponibilidad, totalMinimo, visibles]);

  // ─── Alertas de SLA (pedidos estancados) ────────────────────────────────────
  const alertasSLA = useMemo(() => {
    const ahora = new Date();
    const limites = {
      PENDIENTE: 24,
      APROBADO: 12,
      EN_PREPARACION: 48,
      LISTO: 24,
      RECOGIDO: 12,
    };
    const alertas = [];
    for (const p of visibles) {
      if (ESTADOS_FINALES.includes(p.estado)) continue;
      const limite = limites[p.estado];
      if (!limite) continue;
      const fechaRef = p.actualizado_en || p.creado_en;
      if (!fechaRef) continue;
      const horas = (ahora - new Date(fechaRef)) / (1000 * 60 * 60);
      if (horas > limite) {
        alertas.push({
          pedido: p,
          estado: p.estado,
          horas: Math.round(horas),
          limite,
        });
      }
    }
    return alertas.sort((a, b) => b.horas - a.horas);
  }, [visibles]);

  // ─── Notificaciones del navegador ───────────────────────────────────────────
  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const criticas = alertasSLA.filter((a) => a.horas > a.limite * 2);
    if (criticas.length === 0) return;
    const clave = 'sla-notificado-' + new Date().toDateString();
    if (sessionStorage.getItem(clave)) return;
    sessionStorage.setItem(clave, '1');
    void new Notification('⚠️ Pedidos estancados', {
      body: `${criticas.length} pedido(s) llevan más del doble del tiempo límite en su estado actual.`,
      icon: '/logo-192.png',
    });
  }, [alertasSLA]);

  // ─── Notificaciones push al dueño ───────────────────────────────────────────
  const pedidosAnterioresRef = useRef(new Map());

  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!pedidos.length) return;

    const anteriores = pedidosAnterioresRef.current;
    const nuevos = new Map(pedidos.map((p) => [p.id, p]));

    for (const [id, pedido] of nuevos) {
      const anterior = anteriores.get(id);
      if (!anterior) continue;

      // Pedido recién entregado
      if (anterior.estado !== 'ENTREGADO' && pedido.estado === 'ENTREGADO') {
        const recepcion = pedido.pedido_recepciones?.[0];
        const faltantes = recepcion && recepcion.unidades_recibidas < pedido.unidades;
        void new Notification(faltantes ? '⚠️ Pedido entregado con faltantes' : '✅ Pedido entregado', {
          body: `Pedido #${id} para ${pedido.sucursales?.nombre || 'sucursal'} fue entregado${faltantes ? ` con faltantes (${recepcion.unidades_recibidas} de ${pedido.unidades} u)` : ''}.`,
          icon: '/logo-192.png',
        });
      }

      // Pedido recién recogido (en camino)
      if (anterior.estado !== 'RECOGIDO' && pedido.estado === 'RECOGIDO') {
        void new Notification('🚚 Pedido en camino', {
          body: `Pedido #${id} para ${pedido.sucursales?.nombre || 'sucursal'} está en camino.`,
          icon: '/logo-192.png',
        });
      }
    }

    pedidosAnterioresRef.current = nuevos;
  }, [pedidos]);
  const [vistaCalendario, setVistaCalendario] = useState(false);
  const calendarioMes = useMemo(() => {
    const ahora = new Date();
    const año = ahora.getFullYear();
    const mes = ahora.getMonth();
    const primerDia = new Date(año, mes, 1);
    const ultimoDia = new Date(año, mes + 1, 0);
    const dias = [];
    for (let i = 0; i < primerDia.getDay(); i++) {
      dias.push(null);
    }
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      const fechaStr = `${año}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const pedidosDelDia = visibles.filter((p) => p.fecha === fechaStr);
      dias.push({ dia: d, fecha: fechaStr, pedidos: pedidosDelDia });
    }
    return { año, mes, dias, nombreMes: primerDia.toLocaleString('es-BO', { month: 'long', year: 'numeric' }) };
  }, [visibles]);

  // ─── Dashboard personalizable (widgets) ─────────────────────────────────────
  // (pendiente de implementar UI de reordenamiento)

  // ─── Multi-idioma (español/inglés) ─────────────────────────────────────────
  const [idioma, setIdioma] = useState(() => localStorage.getItem('dueno-idioma') || 'es');
  useEffect(() => {
    localStorage.setItem('dueno-idioma', idioma);
  }, [idioma]);

  const t = useCallback((clave) => {
    const diccionario = {
      es: {
        titulo: 'Mis Sucursales',
        pedidos: 'Pedidos',
        unidades: 'Unidades',
        kilos: 'Kilos',
        pendientes: 'Pendientes',
        crearPedido: 'Crear pedido',
        buscar: 'Buscar por número o sucursal',
        sinPedidos: 'Sin pedidos para mostrar',
        exportar: 'Exportar Excel',
        archivados: 'Ver archivados',
        activos: 'Ver activos',
      },
      en: {
        titulo: 'My Branches',
        pedidos: 'Orders',
        unidades: 'Units',
        kilos: 'Kilos',
        pendientes: 'Pending',
        crearPedido: 'New order',
        buscar: 'Search by number or branch',
        sinPedidos: 'No orders to show',
        exportar: 'Export Excel',
        archivados: 'View archived',
        activos: 'View active',
      },
    };
    return diccionario[idioma]?.[clave] || clave;
  }, [idioma]);

  const hayFiltros = filtroEstado !== 'TODOS' || filtroSucursal !== 'TODAS' || filtroDesde || filtroHasta || busqueda;
  const limpiarFiltros = () => {
    setFiltroEstado('TODOS');
    setFiltroSucursal('TODAS');
    setFiltroDesde('');
    setFiltroHasta('');
    setBusqueda('');
  };

  // ─── Ordenamiento por cabecera ────────────────────────────────────────────────
  const toggleOrden = (col) => {
    setOrden((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { col, dir: 'desc' }
    );
  };
  // ─── Exportar a PDF ─────────────────────────────────────────────────────────
  const exportarPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Reporte de Pedidos - Mis Sucursales', 14, 20);
    doc.setFontSize(10);
    doc.text('Generado: ' + new Date().toLocaleString('es-BO'), 14, 28);
    doc.text('Total de pedidos: ' + metricas.pedidos, 14, 34);
    doc.text('Unidades: ' + metricas.unidades + ' | Kilos: ' + metricas.kilos.toFixed(1) + ' | Pendientes: ' + metricas.pendientes, 14, 40);

    const filas = filtrados.map((p) => [
      '#' + p.id,
      p.sucursales?.nombre || '—',
      p.fecha ? new Date(p.fecha).toLocaleDateString('es-BO') : '—',
      String(p.unidades),
      p.kilos_despachados ? parseFloat(p.kilos_despachados).toFixed(1) : '—',
      ETIQUETA_ESTADO[p.estado] || p.estado,
    ]);

    autoTable(doc, {
      head: [['#', 'Sucursal', 'Fecha', 'Unidades', 'Kilos', 'Estado']],
      body: filas,
      startY: 48,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [124, 58, 237] },
    });

    const yFinal = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text('Scorecard de Sucursales', 14, yFinal);
    const scoreFilas = scorecardSucursales.map((s) => [
      s.nombre,
      String(s.score),
      s.pctEntregas + '%',
      s.pctATiempo + '%',
      s.pctFaltantes + '%',
      s.tiempoPromedio + 'h',
    ]);
    autoTable(doc, {
      head: [['Sucursal', 'Score', 'Entregas', 'A tiempo', 'Faltantes', 'Tiempo prom.']],
      body: scoreFilas,
      startY: yFinal + 6,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [124, 58, 237] },
    });

    doc.save('reporte-pedidos-' + new Date().toISOString().slice(0, 10) + '.pdf');
  };

  const exportarPedidos = () => {
    const filas = filtrados.map((p) => ({
      'N°': p.id,
      Sucursal: p.sucursales?.nombre || '—',
      Fecha: p.fecha ? new Date(p.fecha).toLocaleDateString('es-BO') : '—',
      Unidades: p.unidades,
      'Kilos despachados': p.kilos_despachados ? parseFloat(p.kilos_despachados).toFixed(1) : '—',
      Estado: ETIQUETA_ESTADO[p.estado] || p.estado,
      'Estado del pollo': p.reporte_entrega?.estado_producto
        ? (ETIQUETA_ESTADO_PRODUCTO[p.reporte_entrega.estado_producto] || p.reporte_entrega.estado_producto)
        : '—',
      'Observaciones entrega': p.reporte_entrega?.observaciones_entrega || '—',
      'Motivo rechazo': p.motivo_rechazo || '—',
    }));
    const sufijo = verArchivados ? 'archivados' : 'activos';
    exportarAExcel(filas, `pedidos-${sufijo}-${new Date().toISOString().slice(0, 10)}`);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-800'}`}>
      <header className={`${card} border-b sticky top-0 z-30`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Crown size={20} className="text-amber-500" />
            <h1 className={`font-black tracking-tight ${strong}`}>{t('titulo')}</h1>
          </div>
          <button onClick={() => navigate('/panel')} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Volver al panel">
            <ArrowLeft size={18} />
          </button>
          <PanelNotificaciones rutaPedido="/mis-sucursales" rutaBandeja="/mis-sucursales/avisos" />
          <button
            onClick={() => setVistaCalendario((v) => !v)}
            className={`p-2.5 rounded-xl border transition ${input}`}
            aria-label="Vista calendario"
            title="Vista calendario"
          >
            <Calendar size={18} />
          </button>
          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl border transition ${input}`}
            aria-label="Cambiar modo"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <select
            value={idioma}
            onChange={(e) => setIdioma(e.target.value)}
            className={`p-2.5 rounded-xl border transition ${input} text-xs`}
            aria-label="Idioma"
          >
            <option value="es">🇪🇸 ES</option>
            <option value="en">🇺🇸 EN</option>
          </select>
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
          <div className={`mb-6 rounded-xl border p-4 text-sm font-medium ${darkMode ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {mensaje}
          </div>
        )}

        {/* ── Dashboard de Prioridades ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Alertas de Acción */}
          {(metricas.porRecibir > 0 || metricas.sinReporte > 0) && (
            <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-indigo-950/30 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200'}`}>
              <p className={`text-sm font-bold mb-3 ${darkMode ? 'text-indigo-300' : 'text-indigo-900'}`}>
                Acciones necesarias
              </p>
              <div className="flex flex-wrap gap-2">
                {metricas.porRecibir > 0 && (
                  <button
                    onClick={() => { setFiltroEstado('RECOGIDO'); window.scrollTo({ top: 800, behavior: 'smooth' }); }}
                    className="flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-cyan-700"
                  >
                    <Truck size={14} /> {metricas.porRecibir} pedidos por confirmar
                  </button>
                )}
                {metricas.sinReporte > 0 && (
                  <button
                    onClick={() => { setFiltroEstado('ENTREGADO'); window.scrollTo({ top: 800, behavior: 'smooth' }); }}
                    className="flex items-center gap-2 rounded-xl bg-purple-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-purple-700"
                  >
                    <CheckCheck size={14} /> {metricas.sinReporte} sin reporte final
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Alerta de Stock */}
          {semaforoStock && semaforoStock.estado !== 'ok' && (
            <div className={`rounded-2xl border p-4 ${semaforoStock.estado === 'critico' ? (darkMode ? 'bg-red-950/30 border-red-500/30' : 'bg-red-50 border-red-200') : (darkMode ? 'bg-amber-950/30 border-amber-500/30' : 'bg-amber-50 border-amber-200')}`}>
              <p className={`text-sm font-bold mb-1 ${semaforoStock.estado === 'critico' ? (darkMode ? 'text-red-300' : 'text-red-900') : (darkMode ? 'text-amber-300' : 'text-amber-900')}`}>
                Alerta de Inventario
              </p>
              <p className={`text-xs ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
                El stock de planta {semaforoStock.estado === 'critico' ? 'está en nivel crítico' : 'está por debajo del mínimo'}. 
                Faltan {semaforoStock.faltan} unidades para cubrir el mínimo.
              </p>
            </div>
          )}
        </div>

        {/* ── Alertas de SLA ── */}
        {alertasSLA.length > 0 && (
          <div className={`mb-6 rounded-2xl border p-4 ${darkMode ? 'bg-red-950/30 border-red-500/30' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={18} className="text-red-500" />
              <p className={`text-sm font-bold ${darkMode ? 'text-red-300' : 'text-red-900'}`}>
                {alertasSLA.length} pedido(s) estancado(s) — superaron el tiempo límite
              </p>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {alertasSLA.slice(0, 10).map((a) => (
                <div
                  key={a.pedido.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl ${darkMode ? 'bg-slate-900/50' : 'bg-white/70'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${strong}`}>#{a.pedido.id}</span>
                    <span className={`text-xs ${muted}`}>{a.pedido.sucursales?.nombre || 'Sucursal'}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      darkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {ETIQUETA_ESTADO[a.estado] || a.estado}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-red-500">
                    {a.horas}h / {a.limite}h
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Stock predictivo ── */}
        {stockPredictivo && stockPredictivo.estado !== 'ok' && (
          <div className={`mb-6 rounded-2xl border p-4 ${
            stockPredictivo.estado === 'critico'
              ? darkMode ? 'bg-red-950/30 border-red-500/30' : 'bg-red-50 border-red-200'
              : darkMode ? 'bg-amber-950/30 border-amber-500/30' : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Boxes size={18} className={stockPredictivo.estado === 'critico' ? 'text-red-500' : 'text-amber-500'} />
              <p className={`text-sm font-bold ${stockPredictivo.estado === 'critico' ? (darkMode ? 'text-red-300' : 'text-red-900') : (darkMode ? 'text-amber-300' : 'text-amber-900')}`}>
                Stock predictivo {stockPredictivo.estado === 'critico' ? 'crítico' : 'bajo'}
              </p>
            </div>
            <p className={`text-xs ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              Stock actual: {stockPredictivo.stock} u · Comprometido en preparación: {stockPredictivo.unidadesComprometidas} u ·
              Stock proyectado: <span className="font-bold">{stockPredictivo.stockProyectado} u</span>
              {stockPredictivo.faltan > 0 && ` · Faltan ${stockPredictivo.faltan} u para cubrir el mínimo.`}
            </p>
          </div>
        )}

        {/* ── Vista de calendario ── */}
        {vistaCalendario && (
          <div className={`mb-6 rounded-2xl border p-4 ${card}`}>
            <p className={`text-sm font-bold mb-4 ${strong}`}>
              Calendario — {calendarioMes.nombreMes}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => (
                <div key={d} className={`text-center text-[10px] font-bold uppercase ${muted} py-1`}>{d}</div>
              ))}
              {calendarioMes.dias.map((dia, idx) => (
                <div
                  key={dia?.fecha || idx}
                  className={`min-h-[60px] rounded-lg border p-1 ${
                    dia === null
                      ? 'border-transparent'
                      : dia.pedidos.length > 0
                        ? darkMode ? 'border-amber-500/30 bg-amber-950/20' : 'border-amber-200 bg-amber-50'
                        : darkMode ? 'border-slate-800' : 'border-gray-200'
                  }`}
                >
                  {dia && (
                    <>
                      <span className={`text-xs font-bold ${strong}`}>{dia.dia}</span>
                      {dia.pedidos.length > 0 && (
                        <div className="mt-0.5 space-y-0.5">
                          {dia.pedidos.slice(0, 2).map((p) => (
                            <div
                              key={p.id}
                              className={`text-[9px] truncate rounded px-1 ${
                                p.estado === 'ENTREGADO' ? 'bg-emerald-500/20 text-emerald-500'
                                : p.estado === 'CANCELADO' ? 'bg-red-500/20 text-red-500'
                                : 'bg-amber-500/20 text-amber-500'
                              }`}
                            >
                              #{p.id} {p.sucursales?.nombre?.slice(0, 8)}
                            </div>
                          ))}
                          {dia.pedidos.length > 2 && (
                            <span className={`text-[9px] ${muted}`}>+{dia.pedidos.length - 2} más</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Métricas ── */}
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
        </div>

        {/* ── KPIs comparativos (mes actual vs. anterior) ── */}
        <div className={`mb-6 rounded-2xl border p-4 ${card}`}>
          <p className={`text-sm font-bold mb-4 ${strong}`}>Comparativo mensual</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Pedidos', actual: kpisComparativos.actual.pedidos, variacion: kpisComparativos.variacionPedidos },
              { label: 'Unidades', actual: kpisComparativos.actual.unidades, variacion: kpisComparativos.variacionUnidades },
              { label: 'Kilos', actual: kpisComparativos.actual.kilos.toFixed(1), variacion: kpisComparativos.variacionKilos },
              { label: 'Pendientes', actual: kpisComparativos.actual.pendientes, variacion: kpisComparativos.variacionPendientes },
            ].map(({ label, actual, variacion }) => (
              <div key={label} className={`p-3 rounded-xl ${darkMode ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
                <p className={`text-xs ${muted} mb-1`}>{label}</p>
                <p className={`text-xl font-black ${strong}`}>{actual}</p>
                <p className={`text-[11px] font-bold flex items-center gap-1 mt-1 ${
                  variacion > 0 ? 'text-emerald-500' : variacion < 0 ? 'text-red-500' : muted
                }`}>
                  {variacion > 0 ? '↑' : variacion < 0 ? '↓' : '→'} {Math.abs(variacion)}%
                  <span className={`font-normal ${muted}`}>vs. mes anterior</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Scorecard de sucursales ── */}
        {scorecardSucursales.length > 0 && (
          <div className={`mb-6 rounded-2xl border p-4 ${card}`}>
            <p className={`text-sm font-bold mb-4 ${strong}`}>Scorecard de sucursales</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th className={`px-3 py-2 text-left ${muted}`}>Sucursal</th>
                    <th className={`px-3 py-2 text-center ${muted}`}>Score</th>
                    <th className={`px-3 py-2 text-center ${muted}`}>Entregas</th>
                    <th className={`px-3 py-2 text-center ${muted}`}>A tiempo</th>
                    <th className={`px-3 py-2 text-center ${muted}`}>Faltantes</th>
                    <th className={`px-3 py-2 text-center ${muted}`}>Tiempo prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecardSucursales.map((s, idx) => (
                    <tr key={s.id} className={`border-t border-inherit ${rowHover}`}>
                      <td className={`px-3 py-2 ${normal}`}>
                        <span className="flex items-center gap-2">
                          {idx === 0 && <span className="text-amber-500">🏆</span>}
                          {s.nombre}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          s.score >= 80 ? 'bg-emerald-500/10 text-emerald-500'
                          : s.score >= 50 ? 'bg-amber-500/10 text-amber-500'
                          : 'bg-red-500/10 text-red-500'
                        }`}>
                          {s.score}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-center ${normal}`}>{s.pctEntregas}%</td>
                      <td className={`px-3 py-2 text-center ${normal}`}>{s.pctATiempo}%</td>
                      <td className={`px-3 py-2 text-center ${s.pctFaltantes > 20 ? 'text-red-500' : normal}`}>
                        {s.pctFaltantes}%
                      </td>
                      <td className={`px-3 py-2 text-center ${normal}`}>{s.tiempoPromedio}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tendencia de consumo ── */}
        {tendenciaConsumo.length > 1 && (
          <div className={`mb-6 rounded-2xl border p-4 ${card}`}>
            <div className="flex items-center justify-between mb-4">
              <p className={`text-sm font-bold ${strong}`}>Tendencia de consumo (últimas semanas)</p>
              {costoPorUnidad && (
                <span className={`text-xs ${muted}`}>
                  Peso promedio: <span className={`font-bold ${strong}`}>{costoPorUnidad} kg/u</span>
                </span>
              )}
            </div>
            <div className="flex items-end gap-2 h-32">
              {tendenciaConsumo.map((s) => {
                const maxUnidades = Math.max(...tendenciaConsumo.map((item) => item.unidades), 1);
                const altura = Math.max((s.unidades / maxUnidades) * 100, 4);
                return (
                  <div key={s.semana} className="flex-1 flex flex-col items-center gap-1">
                    <span className={`text-[10px] font-bold ${strong}`}>{s.unidades}</span>
                    <div
                      className="w-full bg-amber-500 rounded-t-lg transition-all"
                      style={{ height: `${altura}%` }}
                    />
                    <span className={`text-[9px] ${muted}`}>
                      {new Date(s.semana).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Metas del mes ── */}
        {sucursales.length > 0 && (
          <div className={`mb-6 rounded-2xl border p-4 ${card}`}>
            <p className={`text-sm font-bold mb-4 ${strong}`}>Metas del mes actual</p>
            <div className="space-y-3">
              {sucursales.map((s) => {
                const meta = 0; // Se cargará desde metas_sucursal cuando el SQL esté ejecutado
                const actual = visibles
                  .filter((p) => String(p.sucursal_id) === String(s.id))
                  .reduce((a, p) => a + (parseInt(p.unidades) || 0), 0);
                const pct = meta > 0 ? Math.min(Math.round((actual / meta) * 100), 100) : 0;
                return (
                  <div key={s.id} className={`p-3 rounded-xl ${darkMode ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-bold ${strong}`}>{s.nombre}</span>
                      <span className={`text-xs ${muted}`}>
                        {actual} / {meta > 0 ? meta : '—'} u
                      </span>
                    </div>
                    <div className={`h-2 w-full rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {meta === 0 && (
                      <p className={`mt-1 text-[10px] ${muted}`}>
                        Define una meta en la gestión de sucursales para ver el progreso.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Semáforo de stock ── */}
        {semaforoStock && (
          <div className={`mb-6 rounded-2xl border p-4 ${
            semaforoStock.estado === 'critico'
              ? darkMode ? 'border-red-500/40 bg-red-950/30' : 'border-red-200 bg-red-50'
              : semaforoStock.estado === 'alerta'
                ? darkMode ? 'border-amber-500/40 bg-amber-950/30' : 'border-amber-200 bg-amber-50'
                : darkMode ? 'border-emerald-500/40 bg-emerald-950/30' : 'border-emerald-200 bg-emerald-50'
          }`}>
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${
                semaforoStock.estado === 'critico'
                  ? 'bg-red-500'
                  : semaforoStock.estado === 'alerta'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${strong}`}>
                  {semaforoStock.estado === 'critico'
                    ? 'Stock de planta en nivel crítico'
                    : semaforoStock.estado === 'alerta'
                      ? 'Stock de planta por debajo del mínimo'
                      : 'Stock de planta suficiente'}
                </p>
                <p className={`mt-0.5 text-xs ${normal}`}>
                  Hay <span className="font-bold">{semaforoStock.stock} u</span> en planta y tus
                  sucursales necesitan al menos <span className="font-bold">{totalMinimo} u</span>
                  {semaforoStock.faltan > 0
                    ? ` · faltan ${semaforoStock.faltan} u para cubrir el mínimo.`
                    : ' · el mínimo está cubierto.'}
                  {semaforoStock.disponibles !== semaforoStock.stock
                    ? ` Disponibles para pedidos nuevos: ${semaforoStock.disponibles} u.`
                    : ''}
                </p>
                <div className={`mt-2 h-2 w-full overflow-hidden rounded-full ${darkMode ? 'bg-slate-800' : 'bg-white/70'}`}>
                  <div
                    className={`h-full rounded-full transition-all ${
                      semaforoStock.estado === 'critico'
                        ? 'bg-red-500'
                        : semaforoStock.estado === 'alerta'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(semaforoStock.pct, 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sucursales
                    .filter((s) => (parseInt(s.stock_minimo, 10) || 0) > 0)
                    .map((s) => (
                      <span
                        key={s.id}
                        className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-300 text-gray-600'}`}
                      >
                        {s.nombre} · mín. {s.stock_minimo} u
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Inventario de mis sucursales ── */}
        {sucursales.length > 0 && (
          <div className={`mb-6 rounded-2xl border p-4 ${card}`}>
            <div className="flex items-center justify-between mb-4">
              <p className={`text-sm font-bold ${strong}`}>Inventario de mis sucursales</p>
              <Boxes size={18} className="text-amber-500" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th className={`px-4 py-2 text-left ${muted}`}>Sucursal</th>
                    <th className={`px-4 py-2 text-right ${muted}`}>Mínimo</th>
                    <th className={`px-4 py-2 text-right ${muted}`}>Stock Actual</th>
                    <th className={`px-4 py-2 text-center ${muted}`}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sucursales.map((s) => {
                    const minimo = parseInt(s.stock_minimo, 10) || 0;
                    // El stock actual es compartido por planta, pero mostramos el mínimo de la sucursal
                    const stockPlanta = semaforoStock?.stock || 0;
                    const pct = minimo > 0 ? Math.round((stockPlanta / minimo) * 100) : 100;
                    const estado = pct < 50 ? 'critico' : pct < 100 ? 'alerta' : 'ok';
                    return (
                      <tr key={s.id} className={`border-t border-inherit ${rowHover}`}>
                        <td className={`px-4 py-2 ${normal}`}>{s.nombre}</td>
                        <td className={`px-4 py-2 text-right ${normal}`}>{minimo} u</td>
                        <td className={`px-4 py-2 text-right ${normal}`}>{stockPlanta} u (planta)</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            estado === 'critico' ? 'bg-red-500/10 text-red-500'
                            : estado === 'alerta' ? 'bg-amber-500/10 text-amber-500'
                            : 'bg-emerald-500/10 text-emerald-500'
                          }`}>
                            {estado === 'critico' ? 'Crítico' : estado === 'alerta' ? 'Alerta' : 'OK'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={`mt-3 text-xs ${muted}`}>
              El stock de planta se comparte entre todas tus sucursales. El mínimo es el que definiste en la gestión.
            </p>
          </div>
        )}

        {/* ── Revisiones y Multas (notificaciones) ── */}
        <div className={`mb-6 rounded-2xl border p-4 ${card}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <p className={`text-sm font-bold ${strong}`}>Revisiones y Multas</p>
              {revisiones.filter((r) => !r.leido).length > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {revisiones.filter((r) => !r.leido).length}
                </span>
              )}
            </div>
          </div>
          {cargandoRevisiones ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 size={18} className="animate-spin text-amber-500" />
              <span className={muted}>Cargando revisiones...</span>
            </div>
          ) : revisiones.length === 0 ? (
            <p className={`text-sm text-center py-4 ${muted}`}>No hay revisiones ni multas.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {revisiones.map((r) => (
                <button
                  key={r.id}
                  onClick={() => abrirRevision(r)}
                  className={`w-full text-left p-3 rounded-xl border transition hover:bg-black/5 ${
                    r.leido ? 'opacity-70' : ''
                  } ${darkMode ? 'border-slate-800' : 'border-gray-200'} ${
                    !r.leido ? (darkMode ? 'bg-amber-950/20 border-amber-500/30' : 'bg-amber-50 border-amber-200') : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {!r.leido && <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />}
                      <span className={`text-xs font-bold ${strong}`}>{r.titulo}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                        r.severidad === 'GRAVE' ? 'bg-red-500/10 text-red-500'
                        : r.severidad === 'ADVERTENCIA' ? 'bg-amber-500/10 text-amber-500'
                        : 'bg-blue-500/10 text-blue-500'
                      }`}>
                        {r.tipo}
                      </span>
                    </div>
                    <span className={`text-[10px] ${muted}`}>
                      {new Date(r.creado_en).toLocaleDateString('es-BO')}
                    </span>
                  </div>
                  <p className={`text-[11px] mt-1 ${muted} line-clamp-1`}>
                    {r.descripcion}
                  </p>
                  {r.monto_multa && (
                    <p className="text-[11px] mt-1 font-bold text-red-500">
                      Monto: Bs. {Number(r.monto_multa).toFixed(2)}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Modal de revisión ── */}
        {revisionSeleccionada && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className={`${card} w-full max-w-lg rounded-2xl border p-5 shadow-2xl max-h-[80vh] overflow-y-auto`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-lg font-black ${strong}`}>{revisionSeleccionada.titulo}</h2>
                <button
                  onClick={() => setRevisionSeleccionada(null)}
                  className={`p-2 rounded-lg ${muted} hover:bg-slate-500/10`}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    revisionSeleccionada.severidad === 'GRAVE' ? 'bg-red-500/10 text-red-500'
                    : revisionSeleccionada.severidad === 'ADVERTENCIA' ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-blue-500/10 text-blue-500'
                  }`}>
                    {revisionSeleccionada.severidad}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>
                    {revisionSeleccionada.tipo}
                  </span>
                </div>
                <p className={`text-sm ${normal} whitespace-pre-wrap`}>{revisionSeleccionada.descripcion}</p>
                {revisionSeleccionada.monto_multa && (
                  <div className={`p-3 rounded-xl ${darkMode ? 'bg-red-950/30 border border-red-500/30' : 'bg-red-50 border border-red-200'}`}>
                    <p className="text-sm font-bold text-red-500">
                      Monto de multa: Bs. {Number(revisionSeleccionada.monto_multa).toFixed(2)}
                    </p>
                  </div>
                )}
                {revisionSeleccionada.documento_url && (
                  <a
                    href={revisionSeleccionada.documento_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2.5 text-sm font-bold text-amber-600 transition hover:bg-amber-500/25"
                  >
                    <Eye size={16} /> Ver documento adjunto
                  </a>
                )}
                <p className={`text-[10px] ${muted}`}>
                  Creado por: {revisionSeleccionada.creado_por_nombre || 'Sistema'} · {new Date(revisionSeleccionada.creado_en).toLocaleString('es-BO')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Pedidos en camino sin recepción ── */}        {/* ── Pedidos en camino sin recepción ── */}
        {!verArchivados && pedidosPorRecibir.length > 0 && (
          <div className={`mb-6 rounded-2xl border p-4 ${darkMode ? 'border-cyan-500/30 bg-cyan-950/30' : 'border-cyan-200 bg-cyan-50'}`}>
            <div className="flex items-start gap-3">
              <Truck size={18} className="mt-0.5 shrink-0 text-cyan-500" />
              <div className="flex-1">
                <p className={`text-sm font-bold ${strong}`}>
                  {pedidosPorRecibir.length === 1
                    ? '1 pedido está en camino y todavía sin recepción'
                    : `${pedidosPorRecibir.length} pedidos están en camino y todavía sin recepción`}
                </p>
                <p className={`mt-0.5 text-xs ${muted}`}>
                  La sucursal debe confirmar la recepción con foto y firma al recibirlo.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {pedidosPorRecibir.slice(0, 8).map((p) => (
                    <span
                      key={p.id}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-300 text-gray-600'}`}
                    >
                      #{p.id} · {p.sucursales?.nombre || 'Sucursal'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal nuevo/repetir pedido ── */}
        {mostrarPedido && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className={`${card} w-full max-w-lg rounded-2xl border p-5 shadow-2xl`}>
              <div className="mb-5 flex items-center justify-between">
                <h2 className={`text-lg font-black ${strong}`}>
                  {formPedido.sucursal_id ? 'Repetir pedido' : 'Nuevo pedido'}
                </h2>
                <button
                  onClick={() => setMostrarPedido(false)}
                  className={`rounded-xl p-2 ${muted} hover:bg-slate-500/10`}
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={crearPedido} className="space-y-4">
                {/* Disponibilidad planta */}
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                  darkMode ? 'border-slate-800 bg-slate-950/50' : 'border-gray-200 bg-gray-50'
                } ${muted}`}>
                  {cargandoDisponibilidad ? (
                    <><Loader2 size={14} className="animate-spin" /> Consultando disponibilidad de planta...</>
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

                {/* Sucursal */}
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>Sucursal *</label>
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
                    {sucursalesFiltradas.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}{s.sector ? ` · ${s.sector}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Unidades */}
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Unidades *
                  <input
                    type="number" min="1" step="1" required
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

                {/* Fecha */}
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Fecha requerida *
                  <input
                    type="date" min={hoy} required
                    value={formPedido.fecha}
                    onChange={(e) => setFormPedido({ ...formPedido, fecha: e.target.value })}
                    className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm normal-case ${input}`}
                  />
                </label>

                {/* Observaciones */}
                <label className={`block text-xs font-semibold uppercase tracking-wider ${muted}`}>
                  Nota para planta (opcional)
                  <textarea
                    rows={2} maxLength={1000}
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

        {/* ── Resumen por sucursal ── */}
        {resumenSucursales.length > 0 && (
          <div className="mb-6">
            <p className={`mb-2 text-xs font-bold uppercase tracking-wider ${muted}`}>
              {verArchivados ? 'Archivados por sucursal' : 'Resumen por sucursal'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {resumenSucursales.map((s) => (
                <div key={s.id} className={`${card} rounded-2xl border p-4`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-sm font-bold ${strong}`}>{s.nombre}</p>
                    <MapPin size={15} className="shrink-0 text-amber-500" />
                  </div>
                  <div className="mt-3 grid grid-cols-5 gap-2 text-center">
                    {[
                      { v: s.pedidos, l: 'Pedidos' },
                      { v: s.unidades, l: 'Unid.' },
                      { v: s.kilos.toFixed(1), l: 'Kg' },
                      { v: s.pendientes, l: 'Pend.', color: s.pendientes ? 'text-amber-500' : 'text-emerald-500' },
                      { v: s.porRecibir, l: 'x recibir', color: s.porRecibir ? 'text-cyan-500' : 'text-emerald-500' },
                    ].map(({ v, l, color }) => (
                      <div key={l}>
                        <p className={`text-lg font-black ${color || strong}`}>{v}</p>
                        <p className={`text-[10px] uppercase tracking-wider ${muted}`}>{l}</p>
                      </div>
                    ))}
                  </div>
                  {/* Gráfico de volumen relativo */}
                  <div className="mt-4">
                    <div className="flex justify-between text-[10px] uppercase font-bold mb-1">
                      <span className={muted}>Volumen</span>
                      <span className={strong}>{metricas.unidades > 0 ? ((s.unidades / metricas.unidades) * 100).toFixed(0) : 0}%</span>
                    </div>
                    <div className={`h-1.5 w-full rounded-full overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-gray-200'}`}>
                      <div 
                        className="h-full bg-amber-500 rounded-full transition-all" 
                        style={{ width: `${metricas.unidades > 0 ? Math.min((s.unidades / metricas.unidades) * 100, 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Barra de búsqueda + acciones ── */}
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
              <p className={`mt-1 text-[10px] ${muted}`}>Atajos: Ctrl+N nuevo pedido · Ctrl+F buscar · Esc cerrar</p>
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

          {/* ── Filtros ── */}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className={`text-[11px] font-semibold uppercase tracking-wider ${muted}`}>
              Estado
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className={`mt-1 block rounded-xl border px-3 py-2 text-xs font-semibold normal-case ${input}`}
              >
                <option value="TODOS">Todos</option>
                {Object.entries(ETIQUETA_ESTADO).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label className={`text-[11px] font-semibold uppercase tracking-wider ${muted}`}>
              Desde
              <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)}
                className={`mt-1 block rounded-xl border px-3 py-2 text-xs normal-case ${input}`} />
            </label>
            <label className={`text-[11px] font-semibold uppercase tracking-wider ${muted}`}>
              Hasta
              <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)}
                className={`mt-1 block rounded-xl border px-3 py-2 text-xs normal-case ${input}`} />
            </label>

            {resumenSucursales.length > 1 && (
              <label className={`text-[11px] font-semibold uppercase tracking-wider ${muted}`}>
                Sucursal
                <select
                  value={filtroSucursal}
                  onChange={(e) => setFiltroSucursal(e.target.value)}
                  className={`mt-1 block rounded-xl border px-3 py-2 text-xs font-semibold normal-case ${input}`}
                >
                  <option value="TODAS">Todas</option>
                  {resumenSucursales.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.nombre}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Limpiar filtros */}
            {hayFiltros && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition text-amber-500 border-amber-500/30 hover:bg-amber-500/10`}
                title="Limpiar todos los filtros"
              >
                <FilterX size={14} /> Limpiar filtros
              </button>
            )}

            {esDueño && !sinVinculo && (
              <button
                type="button"
                onClick={() => { setVerArchivados((v) => !v); setExpandidoId(null); }}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${input}`}
              >
                {verArchivados ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                {verArchivados ? 'Ver activos' : (
                  <>Ver archivados{totalArchivados > 0 && (
                    <span className="ml-1 rounded-full bg-slate-500/20 px-1.5 py-0.5 text-[10px]">
                      {totalArchivados}
                    </span>
                  )}</>
                )}
              </button>
            )}

            {filtrados.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={exportarPedidos}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${input}`}
                  title="Exportar a Excel los pedidos visibles"
                >
                  <Download size={14} /> Exportar Excel
                </button>
                <button
                  type="button"
                  onClick={exportarPDF}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${input}`}
                  title="Exportar reporte a PDF"
                >
                  <FileText size={14} /> Exportar PDF
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Tabla ── */}
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
              {hayFiltros
                ? 'No hay resultados con esos filtros.'
                : verArchivados
                  ? 'No hay pedidos archivados.'
                  : 'Todavía no hay pedidos en tus sucursales.'}
            </p>
            {hayFiltros && (
              <button onClick={limpiarFiltros} className="mt-4 text-xs font-bold text-amber-500 underline">
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className={`${card} border rounded-2xl overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  {[
                    { col: 'id', label: '#', align: 'left' },
                    { col: null, label: 'Sucursal', align: 'left' },
                    { col: 'fecha', label: 'Fecha', align: 'left' },
                    { col: 'unidades', label: 'Unidades', align: 'right' },
                    { col: 'kilos', label: 'Kilos', align: 'right' },
                    { col: 'estado', label: 'Estado', align: 'left' },
                    { col: null, label: 'Reporte de entrega', align: 'left' },
                    { col: null, label: 'Acciones', align: 'left' },
                  ].map(({ col, label, align }) => (
                    <th
                      key={label}
                      onClick={col ? () => toggleOrden(col) : undefined}
                      className={`px-4 py-3 font-black text-xs uppercase tracking-wider ${muted} text-${align} ${col ? 'cursor-pointer select-none hover:text-amber-500' : ''}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {col && <IconoOrden col={col} orden={orden} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const atrasado = p.fecha && p.fecha < hoy && !ESTADOS_FINALES.includes(p.estado);
                  return (
                    <Fragment key={p.id}>
                      <tr className={`border-t border-inherit ${rowHover} ${atrasado ? (darkMode ? 'bg-red-950/10' : 'bg-red-50/50') : ''}`}>
                        <td className={`px-4 py-3 font-bold ${normal}`}>{p.id}</td>
                        <td className={`px-4 py-3 ${normal}`}>{p.sucursales?.nombre || '—'}</td>
                        <td className={`px-4 py-3 ${atrasado ? 'text-red-500 font-semibold' : muted}`}>
                          <span className="inline-flex items-center gap-1">
                            {p.fecha ? new Date(p.fecha).toLocaleDateString('es-BO') : '—'}
                            {atrasado && <Clock size={12} title="Fecha requerida vencida" />}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${normal}`}>{p.unidades}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${normal}`}>
                          {p.kilos_despachados ? parseFloat(p.kilos_despachados).toFixed(1) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                p.estado === 'ENTREGADO' ? 'bg-emerald-500/10 text-emerald-500'
                                : p.estado === 'CANCELADO' ? 'bg-red-500/10 text-red-500'
                                : p.estado === 'RECHAZADO' ? 'bg-rose-500/10 text-rose-500'
                                : 'bg-amber-500/10 text-amber-500'
                              }`}>
                                {ETIQUETA_ESTADO[p.estado] || p.estado}
                              </span>
                              {atrasado && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-red-500/15 text-red-500 flex items-center gap-0.5">
                                  <Clock size={10} /> Atrasado
                                </span>
                              )}
                            </div>
                            {p.estado !== 'CANCELADO' && p.estado !== 'RECHAZADO' && (
                              <div className="flex max-w-32 gap-1" aria-label={`Avance: ${p.estado}`}>
                                {ESTADOS_PROGRESO.map((estado, i) => (
                                  <span key={estado} className={`h-1.5 flex-1 rounded-full ${
                                    i <= ESTADOS_PROGRESO.indexOf(p.estado) ? 'bg-emerald-500'
                                    : darkMode ? 'bg-slate-700' : 'bg-gray-200'
                                  }`} />
                                ))}
                              </div>
                            )}
                            {(p.estado === 'RECHAZADO' || p.estado === 'CANCELADO') && p.motivo_rechazo && (
                              <p className="text-[11px] text-rose-400 max-w-[160px] leading-tight">
                                {p.motivo_rechazo}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-xs ${muted}`}>
                          <div className="space-y-1">
                            {p.reporte_entrega?.estado_producto && (
                              <span className="block font-bold text-emerald-500">
                                {ETIQUETA_ESTADO_PRODUCTO[p.reporte_entrega.estado_producto] || p.reporte_entrega.estado_producto}
                              </span>
                            )}
                            <span className="block max-w-56">{p.reporte_entrega?.observaciones_entrega || '—'}</span>
                            <button
                              type="button"
                              onClick={() => setExpandidoId(expandidoId === p.id ? null : p.id)}
                              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${input}`}
                            >
                              {expandidoId === p.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              {expandidoId === p.id ? 'Ocultar' : 'Ver detalle'}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {esDueño && !sinVinculo && (
                            <div className="flex flex-wrap gap-1.5">
                              {/* Cancelar: solo si está PENDIENTE */}
                              {p.estado === 'PENDIENTE' && (
                                <button
                                  type="button"
                                  onClick={() => cancelarPedido(p)}
                                  disabled={cancelandoId === p.id}
                                  title="Cancelar este pedido"
                                  className="flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-[11px] font-bold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                                >
                                  {cancelandoId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                                  Cancelar
                                </button>
                              )}
                              {/* Repetir pedido */}
                              {!verArchivados && (
                                <button
                                  type="button"
                                  onClick={() => repetirPedido(p)}
                                  title="Crear un pedido igual para hoy"
                                  className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${input}`}
                                >
                                  <Copy size={12} /> Repetir
                                </button>
                              )}
                              {/* Archivar / restaurar: solo estados finales */}
                              {ESTADOS_FINALES.includes(p.estado) && (
                                <button
                                  type="button"
                                  onClick={() => archivarPedido(p)}
                                  disabled={procesandoId === p.id}
                                  className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition disabled:opacity-50 ${input}`}
                                >
                                  {procesandoId === p.id
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : verArchivados ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                                  {verArchivados ? 'Restaurar' : 'Archivar'}
                                </button>
                              )}
                              {/* Borrar definitivo: solo en vista archivados */}
                              {verArchivados && (
                                <button
                                  type="button"
                                  onClick={() => eliminarPedido(p)}
                                  disabled={procesandoId === p.id}
                                  className="flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-[11px] font-bold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                                >
                                  <Trash2 size={12} /> Borrar
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* ── Fila expandida: historial + reporte ── */}
                      {expandidoId === p.id && (
                        <tr>
                          <td colSpan={8} className={`px-4 pb-4 pt-1 ${darkMode ? 'bg-slate-950/40' : 'bg-gray-50/60'}`}>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <p className={`mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider ${muted}`}>
                                  <History size={12} /> Historial de estados
                                </p>
                                {p.historial_estado?.length ? (
                                  <ol className="space-y-1.5">
                                    {p.historial_estado.map((ev) => (
                                      <li key={ev.id} className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                        <span className={`font-semibold ${strong}`}>{ETIQUETA_ESTADO[ev.estado] || ev.estado}</span>
                                        <span className={muted}>
                                          {ev.cambiado_en
                                            ? new Date(ev.cambiado_en).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                            : ''}
                                        </span>
                                        {ev.cambiado_por_nombre && <span className={muted}>· {ev.cambiado_por_nombre}</span>}
                                      </li>
                                    ))}
                                  </ol>
                                ) : (
                                  <p className={`text-xs ${muted}`}>Sin historial registrado.</p>
                                )}
                              </div>
                              <div>
                                <p className={`mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider ${muted}`}>
                                  <Camera size={12} /> Reporte de entrega
                                </p>
                                {p.reporte_entrega ? (
                                  <div className={`space-y-1.5 text-xs ${normal}`}>
                                    {p.reporte_entrega.estado_producto && (
                                      <p>Estado del pollo: <span className={`font-bold ${strong}`}>
                                        {ETIQUETA_ESTADO_PRODUCTO[p.reporte_entrega.estado_producto] || p.reporte_entrega.estado_producto}
                                      </span></p>
                                    )}
                                    {p.reporte_entrega.observaciones_entrega && (
                                      <p className="whitespace-pre-wrap">"{p.reporte_entrega.observaciones_entrega}"</p>
                                    )}
                                    {p.reporte_entrega.fotos_observaciones?.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 pt-1">
                                        {p.reporte_entrega.fotos_observaciones.map((ruta) => (
                                          <button
                                            key={ruta}
                                            type="button"
                                            onClick={() => verFoto(ruta)}
                                            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${input}`}
                                          >
                                            <Camera size={12} /> Ver foto
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {p.reporte_entrega.observaciones_entrega_en && (
                                      <p className={`text-[10px] ${muted}`}>
                                        Enviado el{' '}
                                        {new Date(p.reporte_entrega.observaciones_entrega_en).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <p className={`text-xs ${muted}`}>La sucursal todavía no envió un reporte.</p>
                                )}
                                {p.motivo_rechazo && (
                                  <p className="mt-2 text-xs font-semibold text-rose-400">
                                    Motivo del rechazo: {p.motivo_rechazo}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* ── Seguimiento GPS en camino ── */}
                      {p.estado === 'RECOGIDO' && (
                        <tr>
                          <td colSpan={8} className="px-4 pb-4">
                            <SeguimientoRepartidor pedido={p} darkMode={darkMode} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Lightbox foto ── */}
      {fotoUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setFotoUrl(null)}
          role="presentation"
        >
          <img src={fotoUrl} alt="Evidencia del reporte de entrega" className="max-h-[85vh] max-w-full rounded-xl shadow-2xl" />
        </div>
      )}
      {cargandoFoto && (
        <div className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-xl border border-amber-500/40 bg-slate-900/90 px-3 py-2 text-xs font-bold text-amber-300">
          <Loader2 size={14} className="animate-spin" /> Abriendo foto...
        </div>
      )}
    </div>
  );
}
