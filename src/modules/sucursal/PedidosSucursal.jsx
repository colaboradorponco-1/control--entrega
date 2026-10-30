import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { pedidosRepository } from '../../repositories/pedidosRepository';
import { authRepository } from '../../repositories/AuthRepository';
import { evidenciasRepository } from '../../repositories/evidenciasRepository';
import { supabase } from '../../config/supabaseClient';
import {
  LogOut, Sun, Moon, X, ArrowLeft, CheckCircle, AlertCircle,
  ShoppingCart, PackageCheck, Truck, Loader2, CalendarDays, Ban,
  Camera, FileCheck2, Images, RefreshCw, Inbox,
  History, XCircle, ChevronDown, Archive, ArchiveRestore, Trash2,
  Search, Download
} from 'lucide-react';
import FotosObservaciones from '../../components/FotosObservaciones';
import FormularioRecepcion from '../../components/FormularioRecepcion';
import PanelNotificaciones from '../../components/PanelNotificaciones';
import ModalConfirmar from '../../components/ModalConfirmar';
import Skeleton from '../../components/Skeleton';

const ESTADOS = {
  PENDIENTE: { label: 'Pendiente', badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: ShoppingCart },
  APROBADO: { label: 'Aprobado', badge: 'bg-violet-500/10 text-violet-500 border-violet-500/20', icon: CheckCircle },
  EN_PREPARACION: { label: 'En preparación', badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: PackageCheck },
  LISTO: { label: 'Listo', badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: PackageCheck },
  RECOGIDO: { label: 'En camino', badge: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20', icon: Truck },
  ENTREGADO: { label: 'Entregado', badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: CheckCircle },
  CANCELADO: { label: 'Cancelado', badge: 'bg-red-500/10 text-red-500 border-red-500/20', icon: Ban },
  RECHAZADO: { label: 'Rechazado', badge: 'bg-rose-500/10 text-rose-500 border-rose-500/20', icon: XCircle },
};

// Un pedido deja de estar "en curso" cuando ya llego, se cancelo o
// la sucursal lo rechazo.
const ESTADOS_FINALIZADOS = ['ENTREGADO', 'CANCELADO', 'RECHAZADO'];

// El reporte de entrega queda disponible 7 dias desde la recepcion:
// el reporte documenta como llego el pollo, asi que la sucursal
// necesita margen para revisarlo. Coincide con el limite de la base.
const DIAS_REPORTE = 7;
const VENTANA_REPORTE = DIAS_REPORTE * 24 * 60 * 60 * 1000;

const puedeEnviarObservacionesEntrega = (recibidoEn, ahora) => {
  if (!recibidoEn) return false;
  const recibido = new Date(recibidoEn).getTime();
  if (!Number.isFinite(recibido)) return false;
  return ahora - recibido <= VENTANA_REPORTE;
};

// Cuantas horas quedan para mandar el reporte. Se muestra en el
// formulario para que se vea cuando se esta por vencer.
const horasRestantesReporte = (recibidoEn, ahora) => {
  if (!recibidoEn) return 0;
  const recibido = new Date(recibidoEn).getTime();
  if (!Number.isFinite(recibido)) return 0;
  const limite = recibido + VENTANA_REPORTE;
  return Math.max(0, Math.ceil((limite - ahora) / (60 * 60 * 1000)));
};

const fechaBoliviaISO = (fecha = new Date()) => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha);
  const valor = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
};

const rangoSemanaBolivia = (fecha = new Date()) => {
  const hoy = fechaBoliviaISO(fecha);
  const [anio, mes, dia] = hoy.split('-').map(Number);
  const cursor = new Date(Date.UTC(anio, mes - 1, dia));
  const desplazamiento = (cursor.getUTCDay() + 6) % 7;
  const lunes = new Date(cursor);
  lunes.setUTCDate(cursor.getUTCDate() - desplazamiento);
  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);
  return {
    desde: lunes.toISOString().slice(0, 10),
    hasta: domingo.toISOString().slice(0, 10),
  };
};

const formatearFechaCorta = (iso) => (
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })
);

const ESTADOS_PRODUCTO = [
  { valor: 'FRESCO', label: 'Fresco y refrigerado' },
  { valor: 'TIBIO', label: 'Fresco, pero tibio' },
  { valor: 'EMBALAJE', label: 'Embalaje dañado o húmedo' },
  { valor: 'DETERIORO', label: 'Presenta deterioro' },
  { valor: 'OTRO', label: 'Otro' },
];

const ETIQUETA_ESTADO_PRODUCTO = Object.fromEntries(
  ESTADOS_PRODUCTO.map((opcion) => [opcion.valor, opcion.label])
);

const PASOS_SEGUIMIENTO = [
  { estado: 'PENDIENTE', label: 'Solicitado' },
  { estado: 'APROBADO', label: 'Aprobado' },
  { estado: 'EN_PREPARACION', label: 'Preparando' },
  { estado: 'LISTO', label: 'Listo' },
  { estado: 'RECOGIDO', label: 'En camino' },
  { estado: 'ENTREGADO', label: 'Recibido' },
];

const FILTROS_ACTIVOS = [
  { id: 'todos', label: 'Todos', estados: null },
  { id: 'pendientes', label: 'Pendientes', estados: ['PENDIENTE'] },
  { id: 'en_camino', label: 'En camino', estados: ['RECOGIDO'] },
  { id: 'por_recibir', label: 'Por recibir', estados: ['APROBADO', 'EN_PREPARACION', 'LISTO'] },
];

export default function PedidosSucursal() {
  const { perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState('pedidos');
  const [actualizando, setActualizando] = useState(false);
  const [actualizacionEnVivo, setActualizacionEnVivo] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [observacionesEntrega, setObservacionesEntrega] = useState({});
  const [estadoEntrega, setEstadoEntrega] = useState({});
  const [fotosEntrega, setFotosEntrega] = useState({});
  const [enviandoObservacionPedido, setEnviandoObservacionPedido] = useState(null);
  const [errorReporte, setErrorReporte] = useState({});
  const [reporteAbierto, setReporteAbierto] = useState(null);
  const [aprobandoPedido, setAprobandoPedido] = useState(null);
  const [pedidoAConfirmar, setPedidoAConfirmar] = useState(null);
  const [inventarioSucursal, setInventarioSucursal] = useState(null);

  useEffect(() => {
    if (!perfil?.sucursal_id) return;
    const cargar = async () => {
      try {
        const hoy = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from('inventario_sucursal')
          .select('*')
          .eq('sucursal_id', perfil.sucursal_id)
          .eq('fecha', hoy)
          .maybeSingle();
        setInventarioSucursal(data);
      } catch (e) {
        console.error('Error cargando inventario:', e);
      }
    };
    cargar();
  }, [perfil?.sucursal_id]);
  const [mostrarEmergencia, setMostrarEmergencia] = useState(false);
  const [enviandoEmergencia, setEnviandoEmergencia] = useState(false);
  const [formEmergencia, setFormEmergencia] = useState({ unidades: '', observaciones: '' });
  const [rechazando, setRechazando] = useState(null);
  const [fotosRechazo, setFotosRechazo] = useState([]);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [enviandoRechazo, setEnviandoRechazo] = useState(false);
  const [expandidoHistorial, setExpandidoHistorial] = useState(null);
  const [filtroActivos, setFiltroActivos] = useState('todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [busquedaHistorial, setBusquedaHistorial] = useState('');
  const [verArchivados, setVerArchivados] = useState(false);
  const [procesandoArchivo, setProcesandoArchivo] = useState(null);
  const [porEliminar, setPorEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [seleccionados, setSeleccionados] = useState([]);
  const [procesandoMasivo, setProcesandoMasivo] = useState(false);
  const [confirmarEliminarMasivo, setConfirmarEliminarMasivo] = useState(false);

  const [recibiendo, setRecibiendo] = useState(null);
  const [formRecepcion, setFormRecepcion] = useState({
    unidades_recibidas: '',
    recibido_por: '',
    observaciones: '',
  });
  const [foto, setFoto] = useState(null);
  const [fotosExtra, setFotosExtra] = useState([]);
  const [firma, setFirma] = useState(null);
  const [viendoEvidencia, setViendoEvidencia] = useState(null);
  const cargaEnCurso = useRef(false);

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500 focus:ring-amber-500/20'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-amber-500/20';
  const label = darkMode ? 'text-slate-300' : 'text-gray-600';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';
  const bordeInput = darkMode ? 'border-slate-700 hover:border-slate-600' : 'border-gray-300 hover:border-gray-400';
  const tabClase = (activa) =>
    `flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold border transition ${
      activa
        ? 'bg-purple-500/15 border-purple-500/40 text-purple-500'
        : darkMode
          ? 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
          : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'
    }`;
  const esSucursal = perfil?.roles?.nombre === 'sucursal';
  const esVistaAdmin = ['administrador', 'superadministrador'].includes(perfil?.roles?.nombre);
  const esAdmin = ['administrador', 'superadministrador'].includes(perfil?.roles?.nombre);
  // El reporte de entrega es del administrador: el superadministrador no lo ve.
  const esAdminReporte = perfil?.roles?.nombre === 'administrador';

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (cargaEnCurso.current) return;
    cargaEnCurso.current = true;
    try {
      if (!silencioso) setCargando(true);
      const pedidosActualizados = await pedidosRepository.listar();
      setPedidos(pedidosActualizados);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudieron cargar los pedidos' });
    } finally {
      if (!silencioso) setCargando(false);
      cargaEnCurso.current = false;
    }
  }, []);

  useEffect(() => {
    cargar();

    // Realtime: escucha INSERT/UPDATE/DELETE en pedidos y tablas relacionadas.
    // Cuando la pestaña vuelve a ser visible también recarga, por si el canal
    // estuvo desconectado mientras la pestaña estaba oculta.
    const actualizarSiVisible = () => {
      if (document.visibilityState === 'visible') cargar({ silencioso: true });
    };
    document.addEventListener('visibilitychange', actualizarSiVisible);

    const canal = supabase
      .channel('sucursal-pedidos-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        () => cargar({ silencioso: true }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedido_estado_historial' },
        () => cargar({ silencioso: true }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedido_reportes_entrega' },
        () => cargar({ silencioso: true }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
      document.removeEventListener('visibilitychange', actualizarSiVisible);
    };
  }, [cargar]);

  useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(Date.now()), 30000);
    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    const filtro = perfil?.sucursal_id
      ? { filter: `sucursal_id=eq.${perfil.sucursal_id}` }
      : {};
    const canal = supabase
      .channel('pedidos-sucursal-seguimiento')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos', ...filtro },
        () => cargar({ silencioso: true })
      )
      .subscribe((status) => {
        setActualizacionEnVivo(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(canal);
    };
  }, [cargar, perfil?.sucursal_id]);

  // Si el realtime no conecta, refrescamos igual cada 20 segundos.
  useEffect(() => {
    if (actualizacionEnVivo) return undefined;
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') cargar({ silencioso: true });
    }, 20000);
    return () => window.clearInterval(intervalo);
  }, [actualizacionEnVivo, cargar]);

  // Los errores quedan visibles hasta que el usuario los cierre.
  useEffect(() => {
    if (!mensaje || mensaje.tipo === 'error') return undefined;
    const t = setTimeout(() => setMensaje(null), 6000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const activos = useMemo(
    () => pedidos.filter((p) => !p.archivado && !ESTADOS_FINALIZADOS.includes(p.estado)),
    [pedidos]
  );
  const activosFiltrados = useMemo(() => {
    const filtro = FILTROS_ACTIVOS.find((item) => item.id === filtroActivos);
    return filtro?.estados
      ? activos.filter((pedido) => filtro.estados.includes(pedido.estado))
      : activos;
  }, [activos, filtroActivos]);
  const conteosActivos = useMemo(
    () => Object.fromEntries(
      FILTROS_ACTIVOS.map((filtro) => [
        filtro.id,
        filtro.estados
          ? activos.filter((pedido) => filtro.estados.includes(pedido.estado)).length
          : activos.length,
      ])
    ),
    [activos]
  );
  const etiquetaFiltroActivo = FILTROS_ACTIVOS.find((item) => item.id === filtroActivos)?.label || 'Todos';
  const historicos = useMemo(
    () => pedidos.filter((p) => ESTADOS_FINALIZADOS.includes(p.estado) && !p.archivado),
    [pedidos]
  );
  const archivados = useMemo(() => pedidos.filter((p) => Boolean(p.archivado)), [pedidos]);

  const filtrarPorFecha = useCallback((lista) => {
    if (!fechaDesde && !fechaHasta) return lista;
    return lista.filter((pedido) => {
      const fecha = new Date(pedido.creado_en);
      if (Number.isNaN(fecha.getTime())) return true;
      if (fechaDesde) {
        const desde = new Date(`${fechaDesde}T00:00:00`);
        if (fecha < desde) return false;
      }
      if (fechaHasta) {
        const hasta = new Date(`${fechaHasta}T23:59:59.999`);
        if (fecha > hasta) return false;
      }
      return true;
    });
  }, [fechaDesde, fechaHasta]);

  // Busca por numero de pedido, sucursal, fecha o estado. El texto se
  // compara en minusculas para no depender de mayusculas ni acentos.
  const filtrarPorBusqueda = useCallback((lista) => {
    const texto = busquedaHistorial.trim().toLowerCase();
    if (!texto) return lista;
    const sinAlfiler = texto.replace(/^#/, '');
    return lista.filter((pedido) => {
      const campos = [
        String(pedido.id),
        pedido.sucursales?.nombre,
        pedido.estado,
        new Date(pedido.creado_en).toLocaleDateString('es-BO'),
      ];
      return campos.some((valor) =>
        String(valor || '').toLowerCase().includes(sinAlfiler)
      );
    });
  }, [busquedaHistorial]);

  const historicosFiltrados = useMemo(
    () => filtrarPorBusqueda(filtrarPorFecha(historicos)),
    [filtrarPorBusqueda, filtrarPorFecha, historicos]
  );
  const archivadosFiltrados = useMemo(
    () => filtrarPorBusqueda(filtrarPorFecha(archivados)),
    [filtrarPorBusqueda, filtrarPorFecha, archivados]
  );
  const listaHistorial = verArchivados ? archivadosFiltrados : historicosFiltrados;
  const esReportePendiente = useCallback((pedido) => {
    const recepcion = pedido.pedido_recepciones?.[0];
    return pedido.estado === 'ENTREGADO'
      && Boolean(recepcion?.recibido_en)
      && !pedido.reporte_entrega
      && puedeEnviarObservacionesEntrega(recepcion.recibido_en, ahora);
  }, [ahora]);

  const resumen = useMemo(() => ({
    pendientes: pedidos.filter((p) => p.estado === 'PENDIENTE').length,
    porRecibir: pedidos.filter((p) => ['APROBADO', 'EN_PREPARACION', 'LISTO'].includes(p.estado)).length,
    enCamino: pedidos.filter((p) => p.estado === 'RECOGIDO').length,
    entregados: pedidos.filter((p) => p.estado === 'ENTREGADO').length,
    rechazados: pedidos.filter((p) => ['CANCELADO', 'RECHAZADO'].includes(p.estado)).length,
    reportesPendientes: pedidos.filter(esReportePendiente).length,
  }), [pedidos, esReportePendiente]);

  const resumenSemana = useMemo(() => {
    const { desde, hasta } = rangoSemanaBolivia(new Date(ahora));
    const deLaSemana = pedidos.filter((p) => p.fecha >= desde && p.fecha <= hasta);
    const pedidas = deLaSemana.reduce((total, p) => total + (Number(p.unidades) || 0), 0);
    const recibidas = deLaSemana.reduce(
      (total, p) => total + (Number(p.pedido_recepciones?.[0]?.unidades_recibidas) || 0),
      0
    );
    const faltantes = deLaSemana.reduce((total, p) => {
      const recepcion = p.pedido_recepciones?.[0];
      if (!recepcion) return total;
      return total + Math.max(0, (Number(p.unidades) || 0) - (Number(recepcion.unidades_recibidas) || 0));
    }, 0);
    const conFaltantes = deLaSemana.filter((p) => {
      const recepcion = p.pedido_recepciones?.[0];
      return recepcion && Number(recepcion.unidades_recibidas) < Number(p.unidades);
    }).length;
    const porcentajeRecibido = pedidas > 0 ? Math.min(100, Math.round((recibidas / pedidas) * 100)) : 0;

    return {
      desde,
      hasta,
      rango: `${formatearFechaCorta(desde)} – ${formatearFechaCorta(hasta)}`,
      total: deLaSemana.length,
      pedidas,
      recibidas,
      faltantes,
      conFaltantes,
      porcentajeRecibido,
    };
  }, [pedidos, ahora]);

  const abrirReportesPendientes = () => {
    const pendiente = pedidos.find(esReportePendiente);
    if (!pendiente) return;
    setVista('historial');
    setVerArchivados(Boolean(pendiente.archivado));
    setFechaDesde('');
    setFechaHasta('');
    setExpandidoHistorial(pendiente.id);
  };

  // Cuando llegas desde un aviso (?pedido=12), abrimos el pedido
  // exacto: la pestana que corresponde, lo expandimos si esta en el
  // historial y hacemos scroll hasta el. Despues limpiamos el parametro
  // para que al recargar no vuelva a saltar.
  const pedidoObjetivo = searchParams.get('pedido');
  useEffect(() => {
    if (!pedidoObjetivo || !pedidos.length) return;

    const objetivo = pedidos.find((p) => String(p.id) === String(pedidoObjetivo));
    if (!objetivo) return;

    const enHistorial = ESTADOS_FINALIZADOS.includes(objetivo.estado);
    if (enHistorial) {
      setVista('historial');
      setVerArchivados(Boolean(objetivo.archivado));
      setFechaDesde('');
      setFechaHasta('');
      setExpandidoHistorial(objetivo.id);
    } else {
      setVista('pedidos');
      setFiltroActivos('todos');
    }

    const t = setTimeout(() => {
      const nodo = document.querySelector(`[data-pedido-id="${objetivo.id}"]`);
      nodo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);

    setSearchParams({}, { replace: true });
    return () => clearTimeout(t);
  }, [pedidoObjetivo, pedidos, setSearchParams]);

  // El bloque de seguimiento solo tiene sentido para un pedido que
  // todavía esta en curso. Antes se caia al ultimo pedido de todos
  // y, si ya estaba entregado, mostraba "El pedido ya llego a la
  // sucursal" sin que nadie lo hubiera pedido.
  const pedidoSeguimiento = useMemo(() => {
    if (!pedidos.length) return null;
    const ordenar = (a, b) => (
      new Date(b.actualizado_en || b.creado_en || 0) - new Date(a.actualizado_en || a.creado_en || 0)
    );
    const enCamino = pedidos.filter((p) => !p.archivado && p.estado === 'RECOGIDO');
    if (enCamino.length) return [...enCamino].sort(ordenar)[0];
    const activosPedidos = pedidos.filter(
      (p) => !p.archivado && !ESTADOS_FINALIZADOS.includes(p.estado)
    );
    if (!activosPedidos.length) return null;
    return [...activosPedidos].sort(ordenar)[0] || null;
  }, [pedidos]);

  const unidadesRecibidas = Number(formRecepcion.unidades_recibidas) || 0;
  const hayFaltantesEnRecepcion = Boolean(recibiendo) && unidadesRecibidas < recibiendo.unidades;
  const excedeEnRecepcion = Boolean(recibiendo) && unidadesRecibidas > recibiendo.unidades;
  const faltaObservacionFaltante = hayFaltantesEnRecepcion && !formRecepcion.observaciones.trim();

  const [seleccionadosParaAprobar, setSeleccionadosParaAprobar] = useState([]);
  const [aprobandoMasivo, setAprobandoMasivo] = useState(false);

  const alternarSeleccionAprobar = (id) => {
    setSeleccionadosParaAprobar((actuales) =>
      actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id]
    );
  };

  const seleccionarTodosPendientes = () => {
    const pendientes = activosFiltrados
      .filter((p) => p.estado === 'PENDIENTE')
      .map((p) => p.id);
    const todos = pendientes.length > 0 && pendientes.every((id) => seleccionadosParaAprobar.includes(id));
    setSeleccionadosParaAprobar(todos ? [] : pendientes);
  };

  const aprobarMasivo = async () => {
    if (!seleccionadosParaAprobar.length) return;
    setAprobandoMasivo(true);
    try {
      await Promise.all(
        seleccionadosParaAprobar.map((id) => pedidosRepository.actualizarEstado(id, 'APROBADO'))
      );
      setMensaje({ tipo: 'exito', texto: `${seleccionadosParaAprobar.length} pedido(s) aprobado(s).` });
      setSeleccionadosParaAprobar([]);
      await cargar({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudieron aprobar los pedidos' });
      await cargar({ silencioso: true });
    } finally {
      setAprobandoMasivo(false);
    }
  };

  const handleCancelar = async (pedidoId, motivo) => {
    const motivoLimpio = String(motivo || '').trim();
    if (motivoLimpio.length < 5) {
      setMensaje({ tipo: 'error', texto: 'Escribe el motivo de la cancelación (mínimo 5 caracteres).' });
      return;
    }
    try {
      setEnviandoRechazo(true);
      const { error } = await supabase.rpc('cancelar_pedido', {
        p_pedido_id: pedidoId,
        p_motivo: motivoLimpio,
      });
      if (error) throw error;
      setMensaje({ tipo: 'exito', texto: `Pedido #${pedidoId} cancelado.` });
      setPedidoAConfirmar(null);
      setMotivoRechazo('');
      await cargar({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo cancelar' });
    } finally {
      setEnviandoRechazo(false);
    }
  };

  const handlePedidoEmergencia = async (e) => {
    e.preventDefault();
    if (!perfil?.sucursal_id) {
      setMensaje({ tipo: 'error', texto: 'No se pudo identificar tu sucursal.' });
      return;
    }
    const unidades = Number(formEmergencia.unidades);
    if (!Number.isInteger(unidades) || unidades <= 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresa una cantidad válida de unidades.' });
      return;
    }
    try {
      setEnviandoEmergencia(true);
      const { data, error } = await supabase.rpc('crear_pedido_emergencia', {
        p_sucursal_id: perfil.sucursal_id,
        p_unidades: unidades,
        p_observaciones: formEmergencia.observaciones.trim() || 'PEDIDO DE EMERGENCIA',
      });
      if (error) throw error;
      setMensaje({ tipo: 'exito', texto: `Pedido de emergencia #${data} creado. El dueño y el admin fueron notificados.` });
      setMostrarEmergencia(false);
      setFormEmergencia({ unidades: '', observaciones: '' });
      await cargar({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo crear el pedido de emergencia' });
    } finally {
      setEnviandoEmergencia(false);
    }
  };

  // Rechazar un pedido: se pide el motivo, porque la sucursal puede
  // rechazar por motivos que el administrador necesita ver.
  const abrirRechazo = (p) => {
    setRechazando(p);
    setMotivoRechazo('');
  };

  const handleRechazar = async (e) => {
    e.preventDefault();
    if (!rechazando) return;

    const motivo = motivoRechazo.trim();
    if (motivo.length < 5) {
      setMensaje({ tipo: 'error', texto: 'Escribe el motivo del rechazo (mínimo 5 caracteres).' });
      return;
    }

    setEnviandoRechazo(true);
    try {
      // Subir fotos si hay
      let rutasFotos = [];
      if (fotosRechazo.length > 0) {
        rutasFotos = await evidenciasRepository.subirFotosExtra(fotosRechazo, `pedido-${rechazando.id}/rechazo`);
      }
      await pedidosRepository.rechazar(rechazando.id, motivo);
      // Si hay fotos, guardarlas en el motivo o en una tabla aparte
      // Por ahora, el motivo incluye la referencia a las fotos
      if (rutasFotos.length > 0) {
        // Actualizar el pedido con las fotos de rechazo
        await supabase
          .from('pedidos')
          .update({ motivo_rechazo: motivo + `\n[Fotos: ${rutasFotos.join(', ')}]` })
          .eq('id', rechazando.id);
      }
      setMensaje({ tipo: 'exito', texto: `Pedido #${rechazando.id} rechazado. El administrador fue avisado.` });
      setRechazando(null);
      setMotivoRechazo('');
      setFotosRechazo([]);
      await cargar({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo rechazar el pedido' });
    } finally {
      setEnviandoRechazo(false);
    }
  };

  // Archivar no borra: el pedido sale del historial y queda en la
  // pestana de archivados, donde recien se puede eliminar.
  const handleArchivar = async (pedido, archivado) => {
    try {
      setProcesandoArchivo(pedido.id);
      await pedidosRepository.archivar(pedido.id, archivado);
      setMensaje({
        tipo: 'exito',
        texto: archivado
          ? `Pedido #${pedido.id} archivado.`
          : `Pedido #${pedido.id} restaurado al historial.`,
      });
      if (archivado && expandidoHistorial === pedido.id) setExpandidoHistorial(null);
      await cargar({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo archivar el pedido' });
    } finally {
      setProcesandoArchivo(null);
    }
  };

  const handleEliminarArchivado = async () => {
    if (!porEliminar) return;
    try {
      setEliminando(true);
      await pedidosRepository.eliminarArchivado(porEliminar.id);
      setMensaje({ tipo: 'exito', texto: `Pedido #${porEliminar.id} eliminado definitivamente.` });
      setPorEliminar(null);
      await cargar({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo eliminar el pedido' });
    } finally {
      setEliminando(false);
    }
  };

  // Descarga el historial (o los archivados) como CSV, respetando los
  // filtros activos. Se arma a mano para no depender de librerias.
  const exportarHistorialCSV = () => {
    if (!listaHistorial.length) {
      setMensaje({ tipo: 'aviso', texto: 'No hay pedidos para exportar con los filtros actuales.' });
      return;
    }

    const escapar = (valor) => `"${String(valor ?? '').replace(/"/g, '""')}"`;
    const fecha = (valor) => (valor ? new Date(valor).toLocaleString('es-BO') : '');

    const encabezados = [
      'Pedido', 'Estado', 'Unidades pedidas', 'Unidades recibidas', 'Faltantes',
      'Recibido por', 'Fecha recibo', 'Sucursal', 'Archivado', 'Creado', 'Observaciones de recepción',
    ];

    const filas = listaHistorial.map((p) => {
      const recepcion = p.pedido_recepciones?.[0];
      const pedidas = Number(p.unidades) || 0;
      const recibidas = recepcion ? Number(recepcion.unidades_recibidas) || 0 : '';
      const faltantes = recepcion ? Math.max(0, pedidas - (Number(recepcion.unidades_recibidas) || 0)) : '';
      return [
        `#${p.id}`,
        ESTADOS[p.estado]?.label || p.estado,
        pedidas,
        recibidas,
        faltantes,
        recepcion?.recibido_por_nombre || '',
        fecha(recepcion?.recibido_en),
        p.sucursales?.nombre || '',
        p.archivado ? 'Sí' : 'No',
        fecha(p.creado_en),
        recepcion?.observaciones || '',
      ];
    });

    const csv = [encabezados, ...filas]
      .map((fila) => fila.map(escapar).join(';'))
      .join('\r\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    const hoy = new Date().toISOString().slice(0, 10);
    enlace.href = url;
    enlace.download = `pedidos-${verArchivados ? 'archivados' : 'historial'}-${hoy}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
  };

  // Seleccion multiple en el historial y en archivados. Solo aplica a
  // archivar, restaurar y eliminar; cancelar o rechazar siguen de a uno.
  const alternarSeleccion = (id) => {
    setSeleccionados((actuales) =>
      actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id]
    );
  };

  const seleccionarTodos = () => {
    const visibles = listaHistorial.map((p) => p.id);
    const todos = visibles.length > 0 && visibles.every((id) => seleccionados.includes(id));
    setSeleccionados(todos ? [] : visibles);
  };

  const limpiarSeleccion = () => setSeleccionados([]);

  const handleArchivarMasivo = async (archivar) => {
    if (!seleccionados.length) return;
    setProcesandoMasivo(true);
    try {
      await Promise.all(seleccionados.map((id) => pedidosRepository.archivar(id, archivar)));
      setMensaje({
        tipo: 'exito',
        texto: archivar
          ? `${seleccionados.length} pedido(s) archivado(s).`
          : `${seleccionados.length} pedido(s) restaurado(s).`,
      });
      setSeleccionados([]);
      if (expandidoHistorial && seleccionados.includes(expandidoHistorial)) {
        setExpandidoHistorial(null);
      }
      await cargar({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo completar la acción masiva' });
      // Si una operacion del Promise.all fallo, las anteriores ya
      // quedaron aplicadas. Se recarga para reflejar el estado real.
      await cargar({ silencioso: true });
    } finally {
      setProcesandoMasivo(false);
    }
  };

  const handleEliminarMasivo = async () => {
    if (!seleccionados.length) return;
    setProcesandoMasivo(true);
    try {
      await Promise.all(seleccionados.map((id) => pedidosRepository.eliminarArchivado(id)));
      setMensaje({ tipo: 'exito', texto: `${seleccionados.length} pedido(s) eliminado(s).` });
      setSeleccionados([]);
      if (expandidoHistorial && seleccionados.includes(expandidoHistorial)) {
        setExpandidoHistorial(null);
      }
      await cargar({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudieron eliminar los pedidos' });
      await cargar({ silencioso: true });
    } finally {
      setProcesandoMasivo(false);
      setConfirmarEliminarMasivo(false);
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
    setFotosExtra([]);
  };

  const handleRecepcion = async (e) => {
    e.preventDefault();

    if (!recibiendo || recibiendo.estado !== 'RECOGIDO') {
      setMensaje({ tipo: 'error', texto: 'Solo puedes recibir un pedido que está en camino.' });
      return;
    }

    const unidades = Number(formRecepcion.unidades_recibidas);
    if (!Number.isInteger(unidades) || unidades < 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresa un número entero de unidades recibidas.' });
      return;
    }
    if (unidades > recibiendo.unidades) {
      setMensaje({
        tipo: 'error',
        texto: `No puedes recibir más de ${recibiendo.unidades} unidades. Corregí el número.`,
      });
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
    if (faltantes && !formRecepcion.observaciones.trim()) {
      setMensaje({ tipo: 'error', texto: 'Hay faltantes: escribe en observaciones qué faltó.' });
      return;
    }

    try {
      setEnviando(true);
      await pedidosRepository.confirmarRecepcion(recibiendo.id, {
        unidades_recibidas: unidades,
        recibido_por: formRecepcion.recibido_por,
        observaciones: formRecepcion.observaciones,
        fotosExtra,
        foto,
        firma: evidenciasRepository.dataUrlABlob(firma),
      });

      setMensaje({
        tipo: faltantes ? 'aviso' : 'exito',
        texto: faltantes
          ? `Recepción registrada con faltantes: pediste ${recibiendo.unidades} y recibiste ${unidades}`
          : 'Recepción registrada con foto y firma. El pedido quedó entregado.',
      });
      setRecibiendo(null);
      await cargar({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo registrar la recepción' });
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviarObservacionesEntrega = async (pedido) => {
    const texto = observacionesEntrega[pedido.id]?.trim() || '';
    const estado = estadoEntrega[pedido.id] || '';
    const fotos = fotosEntrega[pedido.id] || [];

    if (!estado && !texto && fotos.length === 0) {
      setErrorReporte((actuales) => ({
        ...actuales,
        [pedido.id]: 'Marca el estado del pollo, escribe una observación o adjunta una foto.',
      }));
      setMensaje({
        tipo: 'error',
        texto: 'Marca el estado del pollo, escribe una observación o adjunta una foto.',
      });
      return false;
    }

    try {
      setEnviandoObservacionPedido(pedido.id);
      setErrorReporte((actuales) => ({ ...actuales, [pedido.id]: '' }));
      await pedidosRepository.enviarObservacionesEntrega(pedido.id, {
        observaciones: texto,
        estadoProducto: estado || null,
        fotos,
      });
      setObservacionesEntrega((actuales) => ({ ...actuales, [pedido.id]: '' }));
      setEstadoEntrega((actuales) => ({ ...actuales, [pedido.id]: '' }));
      setFotosEntrega((actuales) => ({ ...actuales, [pedido.id]: [] }));
      setMensaje({ tipo: 'exito', texto: `Reporte de entrega del pedido #${pedido.id} enviado.` });
      await cargar({ silencioso: true });
      return true;
    } catch (err) {
      // El error se muestra tambien junto al boton: el banner de
      // arriba de la pagina queda fuera de la vista cuando el
      // formulario esta abajo en la lista.
      const detalle = err.message || 'No se pudo enviar el reporte.';
      setErrorReporte((actuales) => ({ ...actuales, [pedido.id]: detalle }));
      setMensaje({ tipo: 'error', texto: detalle });
      return false;
    } finally {
      setEnviandoObservacionPedido(null);
    }
  };

  const aprobarPedido = async (pedido) => {
    if (!['administrador', 'superadministrador'].includes(perfil?.roles?.nombre)) {
      setMensaje({ tipo: 'error', texto: 'Solo un administrador puede aprobar pedidos.' });
      return;
    }

    try {
      setAprobandoPedido(pedido.id);
      await pedidosRepository.actualizarEstado(pedido.id, 'APROBADO');
      setMensaje({ tipo: 'exito', texto: `Pedido #${pedido.id} aprobado para preparación.` });
      await cargar({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo aprobar el pedido.' });
    } finally {
      setAprobandoPedido(null);
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

  const renderReporteEntrega = (pedido, recepcion, reporte) => {
    if (pedido.estado !== 'ENTREGADO' || !recepcion || !(esSucursal || esAdminReporte)) {
      return null;
    }

    return (
      <div className={`mt-3 rounded-xl border p-3 ${darkMode ? 'border-purple-900/60 bg-purple-950/20' : 'border-purple-200 bg-purple-50'}`}>
        <p className={`text-xs font-bold ${strong}`}>Reporte de entrega (opcional)</p>
        {reporte?.observaciones_entrega || reporte?.estado_producto ? (
          <>
            {reporte.estado_producto && (
              <p className={`mt-2 text-sm ${normal}`}>
                Estado del pollo:{' '}
                <span className="font-bold">
                  {ETIQUETA_ESTADO_PRODUCTO[reporte.estado_producto] || reporte.estado_producto}
                </span>
              </p>
            )}
            {reporte.observaciones_entrega && (
              <p className={`mt-1 whitespace-pre-wrap text-sm ${normal}`}>{reporte.observaciones_entrega}</p>
            )}
            {reporte.fotos_observaciones?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reporte.fotos_observaciones.map((ruta) => (
                  <button
                    key={ruta}
                    onClick={() => verEvidencia('Foto del reporte de entrega', ruta)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition ${input}`}
                  >
                    <Images size={12} /> Ver foto
                  </button>
                ))}
              </div>
            )}
            <p className={`mt-1 text-[10px] ${muted}`}>
              Enviado {reporte.observaciones_entrega_en
                ? `el ${new Date(reporte.observaciones_entrega_en).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`
                : ''}
            </p>
          </>
        ) : esSucursal && puedeEnviarObservacionesEntrega(recepcion.recibido_en, ahora) ? (
          <>
            <p className={`mt-1 text-[11px] ${muted}`}>
              ¿En qué estado te entregaron el pollo? Podés marcarlo, escribir una observación y adjuntar fotos.
              Te quedan {horasRestantesReporte(recepcion.recibido_en, ahora)} h para enviarlo (7 días desde la recepción).
            </p>
            <button
              type="button"
              onClick={() => setReporteAbierto(pedido)}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-purple-700"
            >
              <FileCheck2 size={14} /> Reportar entrega
            </button>
          </>
        ) : esSucursal ? (
          <p className={`mt-1 text-[11px] ${muted}`}>
            El plazo para enviar el reporte venció: era 7 días después de recibir el pedido.
          </p>
        ) : (
          <p className={`mt-1 text-[11px] ${muted}`}>La sucursal aún no envió observaciones.</p>
        )}
      </div>
    );
  };

  const renderPedido = (p) => {
    const est = ESTADOS[p.estado] || ESTADOS.PENDIENTE;
    const Icono = est.icon;
    const recepcion = p.pedido_recepciones?.[0];
    // El reporte de entrega viene en su propia tabla (con RLS): el
    // superadministrador no lo recibe.
    const reporte = p.reporte_entrega;
    const pasoActual = PASOS_SEGUIMIENTO.findIndex((paso) => paso.estado === p.estado);
    const progreso = pasoActual < 0 ? 0 : (pasoActual / (PASOS_SEGUIMIENTO.length - 1)) * 100;
    // Solo se cuenta lo que ya salio de la planta, que es lo unico
    // que la base acepta como entregado.
    const falta = p.estado === 'RECOGIDO';

    return (
      <div key={p.id} data-pedido-id={p.id} className={`${card} border rounded-2xl p-2.5`}>
        <div className="flex items-start gap-3">
          {esAdmin && p.estado === 'PENDIENTE' && (
            <label className="flex items-center pt-1" title="Seleccionar para aprobar">
              <input
                type="checkbox"
                checked={seleccionadosParaAprobar.includes(p.id)}
                onChange={() => alternarSeleccionAprobar(p.id)}
                className="h-4 w-4 cursor-pointer accent-violet-500"
                aria-label={`Seleccionar pedido #${p.id}`}
              />
            </label>
          )}
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

            {p.estado === 'CANCELADO' || p.estado === 'RECHAZADO' ? (
              <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-semibold text-red-400">
                Este pedido fue cancelado.
              </p>
            ) : (
              <>
                <div className="mt-2 overflow-x-auto pb-1" aria-label={`Seguimiento del pedido: ${est.label}`}>
                  <div className="relative flex min-w-[440px] justify-between">
                    <div className={`absolute left-5 right-5 top-[11px] h-0.5 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${progreso}%` }}
                      />
                    </div>
                    {PASOS_SEGUIMIENTO.map((paso, index) => {
                      const completado = index < pasoActual || p.estado === 'ENTREGADO';
                      const actual = index === pasoActual;
                      return (
                        <div key={paso.estado} className="relative z-10 flex w-16 flex-col items-center gap-1 text-center">
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                            completado
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : actual
                                ? 'border-purple-500 bg-purple-500 text-white'
                                : darkMode
                                  ? 'border-slate-600 bg-slate-900 text-slate-500'
                                  : 'border-gray-300 bg-white text-gray-400'
                          }`}>
                            {completado
                              ? <CheckCircle size={12} />
                              : <span className="text-[9px] font-bold">{index + 1}</span>}
                          </span>
                          <span className={`text-[9px] leading-tight ${
                            actual ? 'font-bold text-purple-500' : completado ? 'font-semibold text-emerald-500' : muted
                          }`}>
                            {paso.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className={`mt-1 text-[10px] ${muted}`}>
                  Última actualización:{' '}
                  {new Date(p.actualizado_en || p.creado_en).toLocaleString('es-BO', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' · se actualiza automáticamente'}
                </p>
              </>
            )}

            {p.historial_estado?.length > 0 && (
              <details className={`mt-3 rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-gray-200 bg-gray-50'}`}>
                <summary className={`cursor-pointer px-3 py-2 text-xs font-bold ${normal}`}>
                  Historial de actualizaciones ({p.historial_estado.length})
                </summary>
                <ol className="space-y-3 px-3 pb-3 pt-1">
                  {[...p.historial_estado].reverse().map((evento) => (
                    <li key={evento.id} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-purple-500" />
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold ${strong}`}>
                          {ESTADOS[evento.estado]?.label || evento.estado}
                        </p>
                        <p className={`text-[11px] ${muted}`}>
                          {new Date(evento.cambiado_en).toLocaleString('es-BO', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' · '}
                          {evento.cambiado_por_nombre || 'Historial previo al registro de usuarios'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            )}

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

            {falta && esSucursal && (
              <>
                <button
                  onClick={() => abrirRecepcion(p)}
                  className="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition shadow-lg shadow-emerald-500/20"
                >
                  <PackageCheck size={16} /> Recibir pedido
                </button>

                {recibiendo?.id === p.id && (
                  <FormularioRecepcion
                    pedido={p}
                    form={formRecepcion}
                    onForm={setFormRecepcion}
                    onFoto={setFoto}
                    onFirma={setFirma}
                    fotosExtra={fotosExtra}
                    onFotosExtra={setFotosExtra}
                    onSubmit={handleRecepcion}
                    onCancel={() => setRecibiendo(null)}
                    onError={(texto) => setMensaje({ tipo: 'error', texto })}
                    enviando={enviando}
                    hayFaltantes={hayFaltantesEnRecepcion}
                    excede={excedeEnRecepcion}
                    faltaObservacion={faltaObservacionFaltante}
                    theme={{ input, label, muted, strong, bordeInput, hoja: card }}
                  />
                )}
              </>
            )}

            {renderReporteEntrega(p, recepcion, reporte)}

            {p.estado === 'PENDIENTE' && esAdmin && (
              <button
                onClick={() => aprobarPedido(p)}
                disabled={aprobandoPedido === p.id}
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
              >
                {aprobandoPedido === p.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                Aprobar pedido
              </button>
            )}

            {p.estado === 'PENDIENTE' && esSucursal && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => { setMotivoRechazo(''); setPedidoAConfirmar(p); }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 px-3 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Ban size={13} />
                  Cancelar pedido
                </button>
                <button
                  onClick={() => abrirRechazo(p)}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition ${darkMode ? 'border-slate-800 text-slate-400 hover:border-slate-700' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                >
                  <XCircle size={13} /> Rechazar pedido
                </button>
              </div>
            )}

            {p.estado === 'RECHAZADO' && (
              <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
                <p className="text-xs font-bold text-rose-400">Pedido rechazado</p>
                {p.motivo_rechazo && (
                  <p className={`mt-1 whitespace-pre-wrap text-xs ${normal}`}>“{p.motivo_rechazo}”</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // El historial se muestra en su propia pestana: los pedidos que ya
  // terminaron, con la fecha de entrega y el reporte que mando la
  // sucursal.
  const renderHistorial = (item, archivado = false) => {
    const estadoInfo = ESTADOS[item.estado] || ESTADOS.PENDIENTE;
    const IconoHistorial = estadoInfo.icon;
    const recepcionHistorial = item.pedido_recepciones?.[0];
    const reporteHistorial = item.reporte_entrega;
    const abierto = expandidoHistorial === item.id;
    const enProceso = procesandoArchivo === item.id;

    return (
      <div key={item.id} data-pedido-id={item.id} className={`${card} border rounded-2xl overflow-hidden`}>
        <div className="flex items-start">
          <label className="flex items-center pl-4 pt-4" title="Seleccionar para acciones en lote">
            <input
              type="checkbox"
              checked={seleccionados.includes(item.id)}
              onChange={() => alternarSeleccion(item.id)}
              className="h-4 w-4 cursor-pointer accent-amber-500"
              aria-label={`Seleccionar pedido #${item.id}`}
            />
          </label>
          <button
            type="button"
            onClick={() => setExpandidoHistorial(abierto ? null : item.id)}
            aria-expanded={abierto}
            className="flex-1 p-4 text-left"
          >
          <div className="flex items-start gap-3">
            <span className={`p-2.5 rounded-xl border shrink-0 ${estadoInfo.badge}`}>
              <IconoHistorial size={17} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-black ${strong}`}>Pedido #{item.id}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${estadoInfo.badge}`}>
                  {estadoInfo.label}
                </span>
                {archivado && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${darkMode ? 'border-slate-700 text-slate-400' : 'border-gray-300 text-gray-500'}`}>
                    Archivado
                  </span>
                )}
              </div>
              <p className={`mt-1 text-xs ${muted}`}>
                {item.unidades} unidades · pedido el {new Date(item.creado_en).toLocaleDateString('es-BO')}
                {recepcionHistorial?.recibido_en
                  ? ` · recibido el ${new Date(recepcionHistorial.recibido_en).toLocaleString('es-BO', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}`
                  : ''}
              </p>
            </div>
            <span className={`p-1.5 rounded-lg border shrink-0 ${darkMode ? 'border-slate-800 text-slate-400' : 'border-gray-200 text-gray-500'}`}>
              <ChevronDown size={16} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
            </span>
          </div>
          </button>
        </div>

        {abierto && (
          <div className={`space-y-3 border-t px-4 pb-4 pt-3 ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
            {item.observaciones && (
              <p className={`text-xs italic ${muted}`}>“{item.observaciones}”</p>
            )}

            {reporteHistorial?.observaciones_entrega || reporteHistorial?.estado_producto ? (
              <div className={`rounded-xl border p-3 ${darkMode ? 'border-purple-900/60 bg-purple-950/20' : 'border-purple-200 bg-purple-50'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Reporte de entrega</p>
                {reporteHistorial.estado_producto && (
                  <p className={`mt-1 text-xs ${normal}`}>
                    Estado del pollo:{' '}
                    <span className="font-bold">
                      {ETIQUETA_ESTADO_PRODUCTO[reporteHistorial.estado_producto] || reporteHistorial.estado_producto}
                    </span>
                  </p>
                )}
                {reporteHistorial.observaciones_entrega && (
                  <p className={`mt-1 whitespace-pre-wrap text-sm ${normal}`}>{reporteHistorial.observaciones_entrega}</p>
                )}
                {reporteHistorial.fotos_observaciones?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reporteHistorial.fotos_observaciones.map((ruta) => (
                      <button
                        key={ruta}
                        type="button"
                        onClick={() => verEvidencia('Foto del reporte de entrega', ruta)}
                        className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${input}`}
                      >
                        <Images size={12} /> Ver foto
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : esSucursal ? null : (
              <p className={`text-[11px] ${muted}`}>La sucursal no envió reporte de entrega.</p>
            )}

            {recepcionHistorial && (
              <div className={`rounded-xl border p-3 ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-gray-200 bg-gray-50'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Recepción</p>
                <p className={`mt-1 text-xs ${normal}`}>
                  {recepcionHistorial.unidades_recibidas} unidades recibidas
                  {recepcionHistorial.recibido_por_nombre
                    ? ` · recibió ${recepcionHistorial.recibido_por_nombre}`
                    : ''}
                </p>
                {recepcionHistorial.faltantes && (
                  <p className="mt-1 text-xs font-bold text-amber-500">
                    Con faltantes: se pidieron {item.unidades} y llegaron {recepcionHistorial.unidades_recibidas}
                  </p>
                )}
                {recepcionHistorial.observaciones && (
                  <p className={`mt-1 text-xs italic ${muted}`}>“{recepcionHistorial.observaciones}”</p>
                )}
                {(recepcionHistorial.foto_url || recepcionHistorial.firma_url || recepcionHistorial.fotos_extra?.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {recepcionHistorial.foto_url && (
                      <button
                        type="button"
                        onClick={() => verEvidencia('Foto de la entrega', recepcionHistorial.foto_url)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${input}`}
                      >
                        <Camera size={12} /> Ver foto
                      </button>
                    )}
                    {recepcionHistorial.firma_url && (
                      <button
                        type="button"
                        onClick={() => verEvidencia('Firma de recepción', recepcionHistorial.firma_url)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${input}`}
                      >
                        <FileCheck2 size={12} /> Ver firma
                      </button>
                    )}
                    {recepcionHistorial.fotos_extra?.length > 0 && (
                      <button
                        type="button"
                        onClick={() => verEvidencia(`Fotos de apoyo (${recepcionHistorial.fotos_extra.length})`, recepcionHistorial.fotos_extra[0])}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${input}`}
                      >
                        <Images size={12} /> +{recepcionHistorial.fotos_extra.length} fotos
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {esSucursal && !reporteHistorial && renderReporteEntrega(item, recepcionHistorial, reporteHistorial)}

            {item.estado === 'RECHAZADO' && item.motivo_rechazo && (
              <p className={`rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs ${normal}`}>
                <span className="font-bold text-rose-400">Motivo del rechazo: </span>
                {item.motivo_rechazo}
              </p>
            )}

            {item.historial_estado?.length > 0 && (
              <details className={`rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-gray-200 bg-gray-50'}`}>
                <summary className={`cursor-pointer px-3 py-2 text-xs font-bold ${normal}`}>
                  Historial de actualizaciones ({item.historial_estado.length})
                </summary>
                <ol className="space-y-2 px-3 pb-3 pt-1">
                  {[...item.historial_estado].reverse().map((evento) => (
                    <li key={evento.id} className={`text-[11px] ${muted}`}>
                      <span className={`font-semibold ${strong}`}>
                        {ESTADOS[evento.estado]?.label || evento.estado}
                      </span>
                      {' · '}
                      {new Date(evento.cambiado_en).toLocaleString('es-BO', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                      {evento.cambiado_por_nombre ? ` · ${evento.cambiado_por_nombre}` : ''}
                    </li>
                  ))}
                </ol>
              </details>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {archivado ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleArchivar(item, false)}
                    disabled={enProceso}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-60 ${input}`}
                  >
                    <ArchiveRestore size={14} /> Restaurar
                  </button>
                  <button
                    type="button"
                    onClick={() => setPorEliminar(item)}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-500 transition hover:bg-rose-500/20"
                  >
                    <Trash2 size={14} /> Eliminar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => handleArchivar(item, true)}
                  disabled={enProceso}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-60 ${input}`}
                >
                  <Archive size={14} /> {enProceso ? 'Archivando...' : 'Archivar'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <header className={`sticky top-0 z-20 border-b backdrop-blur-xl ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-gray-200'}`}>
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/panel')}
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
                <h1 className={`text-base md:text-xl font-black tracking-tight truncate ${strong}`}>
                  {vista === 'historial'
                    ? 'Historial de pedidos'
                    : esVistaAdmin
                      ? 'Seguimiento de pedidos'
                      : 'Mis Pedidos'}
                </h1>
                <p className={`text-[10px] md:text-xs font-medium ${muted}`}>
                  {perfil?.sucursales?.nombre || (esVistaAdmin ? 'Vista administrativa' : 'Mi sucursal')}
                  {' · '}
                  <span className={actualizacionEnVivo ? 'text-emerald-500' : 'text-amber-500'}>
                    {actualizacionEnVivo ? 'Seguimiento en vivo' : 'Sincronización cada 20 s'}
                  </span>
                </p>
              </div>
            </div>
            {esAdminReporte && (
              <button
                onClick={() => navigate('/avisos')}
                className={`p-2.5 rounded-xl border transition ${darkMode ? 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800' : 'bg-gray-50 border-gray-300 text-amber-600 hover:bg-gray-100'}`}
                aria-label="Bandeja de avisos"
                title="Bandeja de avisos"
              >
                <Inbox size={18} />
              </button>
            )}
            {esSucursal && (
              <PanelNotificaciones
                titulo="Mis avisos"
                textoVacio="Todavia no tenes avisos de tus pedidos."
                rutaBandeja="/sucursal/avisos"
                rutaPedido="/sucursal"
                mostrarSucursal={false}
                alAbrirAviso={(aviso) =>
                  navigate(aviso.pedido_id ? `/sucursal?pedido=${aviso.pedido_id}` : '/sucursal')
                }
              />
            )}
            <button
              onClick={toggleTheme}
              className={`p-2.5 rounded-xl border transition ${darkMode ? 'bg-slate-900 border-slate-800 text-amber-400' : 'bg-gray-50 border-gray-300 text-amber-500'}`}
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {vista === 'pedidos' && (
              <button
                onClick={async () => {
                  setActualizando(true);
                  await cargar({ silencioso: true });
                  setActualizando(false);
                }}
                disabled={actualizando || cargando}
                className={`p-2.5 rounded-xl border transition disabled:opacity-50 ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                aria-label="Actualizar pedidos"
                title="Actualizar pedidos"
              >
                <RefreshCw size={18} className={actualizando ? 'animate-spin' : ''} />
              </button>
            )}
            <button
              onClick={() => authRepository.logout()}
              className="p-2.5 rounded-xl bg-red-950/50 border border-red-800/50 text-red-300 transition"
              aria-label="Salir"
            >
              <LogOut size={18} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setVista('pedidos')}
              className={tabClase(vista === 'pedidos')}
            >
              <ShoppingCart size={15} /> Pedidos
            </button>
            <button
              type="button"
              onClick={() => setVista('historial')}
              className={tabClase(vista === 'historial')}
            >
              <History size={15} /> Historial de pedidos
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
            <p className="flex-1 text-sm font-semibold">{mensaje.texto}</p>
            <button
              type="button"
              onClick={() => setMensaje(null)}
              className="shrink-0 rounded-lg p-0.5 opacity-70 transition hover:opacity-100"
              aria-label="Cerrar mensaje"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {vista === 'historial' ? (
          <section>
            <div className={`${card} mb-3 rounded-2xl border p-3`}>
              <div className="flex flex-wrap items-end gap-2">
                <label className={`flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                  Desde
                  <input
                    type="date"
                    value={fechaDesde}
                    max={fechaHasta || undefined}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${input}`}
                  />
                </label>
                <label className={`flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                  Hasta
                  <input
                    type="date"
                    value={fechaHasta}
                    min={fechaDesde || undefined}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${input}`}
                  />
                </label>
                {(fechaDesde || fechaHasta) && (
                  <button
                    type="button"
                    onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${input}`}
                  >
                    <X size={13} /> Limpiar
                  </button>
                )}
                <label className={`flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider ${muted}`}>
                  Buscar
                  <div className="relative">
                    <Search size={13} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${muted} pointer-events-none`} />
                    <input
                      type="search"
                      value={busquedaHistorial}
                      onChange={(e) => setBusquedaHistorial(e.target.value)}
                      placeholder="#pedido, sucursal o estado"
                      className={`w-52 rounded-lg border pl-7 pr-2.5 py-1.5 text-xs font-semibold ${input}`}
                    />
                  </div>
                </label>
                <button
                  type="button"
                  onClick={exportarHistorialCSV}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${input}`}
                  title="Descargar los pedidos filtrados en CSV"
                >
                  <Download size={13} /> CSV
                </button>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setVerArchivados(false); setSeleccionados([]); }}
                    className={tabClase(!verArchivados)}
                  >
                    <History size={14} /> Historial ({historicosFiltrados.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setVerArchivados(true); setSeleccionados([]); }}
                    className={tabClase(verArchivados)}
                  >
                    <Archive size={14} /> Archivados ({archivadosFiltrados.length})
                  </button>
                </div>
              </div>
            </div>

            <h2 className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${muted}`}>
              {verArchivados ? 'Pedidos archivados' : 'Historial de pedidos'} ({listaHistorial.length})
            </h2>

            {listaHistorial.length > 0 && (
              <div className={`${card} mb-3 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2`}>
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={seleccionados.length > 0 && seleccionados.length === listaHistorial.length}
                    onChange={seleccionarTodos}
                    className="h-4 w-4 cursor-pointer accent-amber-500"
                  />
                  <span className={normal}>Seleccionar todo</span>
                </label>
                {seleccionados.length > 0 && (
                  <>
                    <span className={`text-xs font-bold ${muted}`}>{seleccionados.length} seleccionado(s)</span>
                    <div className="ml-auto flex flex-wrap gap-1.5">
                      {verArchivados ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleArchivarMasivo(false)}
                            disabled={procesandoMasivo}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-60 ${input}`}
                          >
                            <ArchiveRestore size={13} /> Restaurar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmarEliminarMasivo(true)}
                            disabled={procesandoMasivo}
                            className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-bold text-rose-500 transition hover:bg-rose-500/20 disabled:opacity-60"
                          >
                            {procesandoMasivo ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Eliminar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleArchivarMasivo(true)}
                          disabled={procesandoMasivo}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-60 ${input}`}
                        >
                          {procesandoMasivo ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />} Archivar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={limpiarSeleccion}
                        disabled={procesandoMasivo}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-60 ${muted}`}
                      >
                        Quitar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {listaHistorial.length === 0 ? (
              <div className={`${card} border rounded-2xl py-12 text-center ${muted}`}>
                {verArchivados ? (
                  <>
                    <Archive size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-semibold">No hay pedidos archivados</p>
                    <p className="text-xs mt-1">
                      Archiva un pedido del historial para sacarlo de la lista principal
                    </p>
                  </>
                ) : (
                  <>
                    <History size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-semibold">
                      {fechaDesde || fechaHasta
                        ? 'No hay pedidos en esas fechas'
                        : 'Todavía no hay pedidos en el historial'}
                    </p>
                    <p className="text-xs mt-1">
                      {fechaDesde || fechaHasta
                        ? 'Prueba con otro rango de fechas'
                        : 'Acá van a aparecer los pedidos entregados, cancelados y rechazados'}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {listaHistorial.map((item) => renderHistorial(item, verArchivados))}
              </div>
            )}
          </section>
        ) : (
          <>
        {cargando ? (
          <div className="space-y-4 py-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`flex gap-4 p-4 border rounded-2xl ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="w-1/3 h-4" />
                  <Skeleton className="w-full h-3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {[
                { label: 'Pendientes', valor: resumen.pendientes, Icono: ShoppingCart, clases: 'text-amber-500 border-amber-500/25 bg-amber-500/10' },
                { label: 'Por recibir', valor: resumen.porRecibir, Icono: PackageCheck, clases: 'text-violet-500 border-violet-500/25 bg-violet-500/10' },
                { label: 'En camino', valor: resumen.enCamino, Icono: Truck, clases: 'text-cyan-500 border-cyan-500/25 bg-cyan-500/10' },
                { label: 'Reportes por vencer', valor: resumen.reportesPendientes, Icono: AlertCircle, clases: 'text-rose-500 border-rose-500/25 bg-rose-500/10' },
              ].map(({ label: etiqueta, valor, Icono, clases }) => (
                <div key={etiqueta} className={`${card} border rounded-2xl p-3 md:p-4`}>
                  <span className={`inline-flex p-2 rounded-xl border ${clases}`}>
                    <Icono size={16} />
                  </span>
                  <p className={`mt-2 text-2xl md:text-3xl font-black tabular-nums ${strong}`}>{valor}</p>
                  <p className={`text-[10px] md:text-[11px] font-bold uppercase tracking-wider ${muted}`}>{etiqueta}</p>
                </div>
              ))}
            </div>

            <div className={`${card} mt-2.5 rounded-2xl border p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Esta semana</p>
                  <p className={`mt-0.5 text-sm font-black ${strong}`}>{resumenSemana.rango}</p>
                  <p className={`text-[11px] ${muted}`}>
                    {resumenSemana.total === 1 ? '1 pedido' : `${resumenSemana.total} pedidos`} con fecha de entrega en la semana
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${darkMode ? 'border-slate-700 text-slate-400' : 'border-gray-300 text-gray-500'}`}>
                    Entregados: {resumen.entregados}
                  </span>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${darkMode ? 'border-slate-700 text-slate-400' : 'border-gray-300 text-gray-500'}`}>
                    Rechazados: {resumen.rechazados}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: 'Pedidas', valor: resumenSemana.pedidas, clases: 'text-violet-500 bg-violet-500/10 border-violet-500/20' },
                  { label: 'Recibidas', valor: resumenSemana.recibidas, clases: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
                  { label: 'Faltantes', valor: resumenSemana.faltantes, clases: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
                ].map(({ label: etiqueta, valor, clases }) => (
                  <div key={etiqueta} className={`rounded-xl border p-2.5 ${clases}`}>
                    <p className="text-lg font-black tabular-nums">{valor}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{etiqueta}</p>
                  </div>
                ))}
              </div>

              <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${darkMode ? 'bg-slate-800' : 'bg-gray-200'}`}>
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${resumenSemana.porcentajeRecibido}%` }}
                />
              </div>
              <p className={`mt-1 text-[10px] ${muted}`}>
                {resumenSemana.porcentajeRecibido}% de las unidades pedidas ya se recibió
                {resumenSemana.conFaltantes > 0
                  ? ` · ${resumenSemana.conFaltantes} ${resumenSemana.conFaltantes === 1 ? 'pedido' : 'pedidos'} con faltantes`
                  : ''}
              </p>
            </div>

            {resumen.reportesPendientes > 0 && (
              <button
                type="button"
                onClick={abrirReportesPendientes}
                className="mt-2.5 flex w-full items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-amber-600 transition hover:bg-amber-500/15 dark:text-amber-400"
              >
                <AlertCircle size={16} className="shrink-0" />
                <span className="flex-1 text-xs font-bold">
                  Hay {resumen.reportesPendientes} {resumen.reportesPendientes === 1 ? 'reporte de entrega pendiente' : 'reportes de entrega pendientes'} antes de que venza el plazo de 7 días.
                </span>
                <span className="text-[11px] font-bold underline">Ver historial</span>
              </button>
            )}

            {pedidoSeguimiento && (
              <div className={`${card} mt-3 rounded-2xl border p-4`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {pedidoSeguimiento.estado === 'ENTREGADO'
                      ? <CheckCircle size={18} className="text-emerald-500" />
                      : pedidoSeguimiento.estado === 'RECOGIDO'
                        ? <Truck size={18} className="text-cyan-600" />
                        : <PackageCheck size={18} className="text-violet-500" />}
                    <h2 className={`text-sm font-black ${strong}`}>
                      Pedido en curso #{pedidoSeguimiento.id}
                    </h2>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${(ESTADOS[pedidoSeguimiento.estado] || ESTADOS.PENDIENTE).badge}`}>
                    {(ESTADOS[pedidoSeguimiento.estado] || ESTADOS.PENDIENTE).label}
                  </span>
                </div>

                {pedidoSeguimiento.estado === 'RECOGIDO' ? (
                  <>
                    <p className={`flex items-center gap-2 text-sm ${normal}`}>
                      <Truck size={16} className="text-cyan-600" />
                      El pedido está en camino a la sucursal.
                    </p>
                    {/* Módulo futuro: al habilitar el rastreo en el rol sucursal,
                        aquí se montará el mapa de seguimiento del repartidor
                        (componente SeguimientoRepartidor) con la ubicación en vivo. */}
                  </>
                ) : pedidoSeguimiento.estado === 'ENTREGADO' ? (
                  <p className={`flex items-center gap-2 text-sm ${normal}`}>
                    <CheckCircle size={16} className="text-emerald-500" />
                    Este pedido ya fue entregado
                    {pedidoSeguimiento.pedido_recepciones?.[0]?.recibido_en
                      ? ` el ${new Date(pedidoSeguimiento.pedido_recepciones[0].recibido_en).toLocaleString('es-BO', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                      : ''}
                    .
                  </p>
                ) : (
                  <p className={`text-sm ${muted}`}>
                    {pedidoSeguimiento.estado === 'CANCELADO'
                      ? 'Este pedido fue cancelado.'
                      : 'El pedido todavía no está en camino.'}
                  </p>
                )}
              </div>
            )}

            {inventarioSucursal && (
              <div className={`mb-4 rounded-xl border p-3 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${muted} mb-2`}>Mi inventario (hoy)</p>
                <div className="flex gap-4">
                  <div className={`flex-1 rounded-lg p-2 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                    <p className={`text-[9px] ${muted}`}>Crudos</p>
                    <p className={`text-sm font-bold ${strong}`}>{inventarioSucursal.pollos_crudos}</p>
                  </div>
                  <div className={`flex-1 rounded-lg p-2 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                    <p className={`text-[9px] ${muted}`}>Rostizados</p>
                    <p className={`text-sm font-bold ${strong}`}>{inventarioSucursal.pollos_rostizados}</p>
                  </div>
                </div>
              </div>
            )}

            <section>
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <h2 className={`text-xs font-bold uppercase tracking-wider ${muted}`}>
                  Pedidos activos ({activos.length})
                </h2>
                {activos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {FILTROS_ACTIVOS.map((filtro) => {
                      const activa = filtroActivos === filtro.id;
                      return (
                        <button
                          key={filtro.id}
                          type="button"
                          onClick={() => setFiltroActivos(filtro.id)}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
                            activa
                              ? 'bg-purple-500/15 border-purple-500/40 text-purple-500'
                              : darkMode
                                ? 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                                : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          {filtro.label}
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${
                            activa
                              ? 'bg-purple-500/15'
                              : darkMode ? 'bg-slate-800' : 'bg-gray-200'
                          }`}>
                            {conteosActivos[filtro.id]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {activos.length === 0 ? (
                <div className={`${card} border rounded-2xl py-12 text-center ${muted}`}>
                  <ShoppingCart size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-semibold">No hay pedidos activos</p>
                  {esSucursal && <p className="text-xs mt-1">El dueño de la sucursal registra los pedidos</p>}
                </div>
              ) : activosFiltrados.length === 0 ? (
                <div className={`${card} border rounded-2xl py-10 text-center ${muted}`}>
                  <ShoppingCart size={26} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-semibold">No hay pedidos en “{etiquetaFiltroActivo}”</p>
                  <button
                    type="button"
                    onClick={() => setFiltroActivos('todos')}
                    className={`mt-3 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${input}`}
                  >
                    Ver todos ({activos.length})
                  </button>
                </div>
              ) : (
                <>
                {esAdmin && seleccionadosParaAprobar.length > 0 && (
                  <div className={`mb-3 flex items-center justify-between rounded-xl border p-3 ${darkMode ? 'bg-violet-950/30 border-violet-500/30' : 'bg-violet-50 border-violet-200'}`}>
                    <span className={`text-sm font-bold ${darkMode ? 'text-violet-300' : 'text-violet-900'}`}>
                      {seleccionadosParaAprobar.length} pedido(s) seleccionado(s)
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSeleccionadosParaAprobar([])}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${input}`}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={aprobarMasivo}
                        disabled={aprobandoMasivo}
                        className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
                      >
                        {aprobandoMasivo ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        Aprobar seleccionados
                      </button>
                    </div>
                  </div>
                )}
                {esAdmin && activosFiltrados.some((p) => p.estado === 'PENDIENTE') && (
                  <div className="mb-2 flex items-center gap-2">
                    <button
                      onClick={seleccionarTodosPendientes}
                      className={`text-xs font-bold ${darkMode ? 'text-violet-400' : 'text-violet-600'} hover:underline`}
                    >
                      {seleccionadosParaAprobar.length === activosFiltrados.filter((p) => p.estado === 'PENDIENTE').length
                        ? 'Deseleccionar todos'
                        : 'Seleccionar todos los pendientes'}
                    </button>
                  </div>
                )}
                {esSucursal && (
                  <div className="mb-3">
                    <button
                      onClick={() => setMostrarEmergencia(true)}
                      className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
                    >
                      🚨 Pedido de emergencia
                    </button>
                  </div>
                )}
                <div className="space-y-2.5">{activosFiltrados.map(renderPedido)}</div>
                </>
              )}
            </section>
          </>
        )}
          </>
        )}
      </main>

      {/* Modal de pedido de emergencia */}
      {mostrarEmergencia && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <form
            onSubmit={handlePedidoEmergencia}
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${card}`}
          >
            <div className="flex items-start gap-3">
              <span className="p-2.5 rounded-xl border bg-red-500/10 text-red-500 border-red-500/20 shrink-0">
                🚨
              </span>
              <div className="min-w-0">
                <h3 className={`text-base font-black ${strong}`}>
                  Pedido de emergencia
                </h3>
                <p className={`mt-1 text-xs ${muted}`}>
                  Crea un pedido urgente para tu sucursal. El dueño y el admin serán notificados.
                </p>
              </div>
            </div>

            <label className={`mt-4 block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
              Unidades *
            </label>
            <input
              type="number"
              min="1"
              step="1"
              required
              value={formEmergencia.unidades}
              onChange={(e) => setFormEmergencia({ ...formEmergencia, unidades: e.target.value })}
              className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
              placeholder="Cantidad de unidades"
            />

            <label className={`mt-3 block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
              Motivo de emergencia
            </label>
            <textarea
              value={formEmergencia.observaciones}
              onChange={(e) => setFormEmergencia({ ...formEmergencia, observaciones: e.target.value })}
              rows={3}
              placeholder="Describe la emergencia..."
              className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
            />

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => { setMostrarEmergencia(false); setFormEmergencia({ unidades: '', observaciones: '' }); }}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border transition ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviandoEmergencia}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50"
              >
                {enviandoEmergencia ? 'Enviando...' : 'Crear emergencia'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* La recepción ya no usa modal: el formulario va dentro de
          la tarjeta del pedido, en PedidosSucursal (renderPedido). */}

      {/* Rechazo del pedido: el motivo es obligatorio */}
      {rechazando && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <form
            onSubmit={handleRechazar}
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${card}`}
          >
            <div className="flex items-start gap-3">
              <span className="p-2.5 rounded-xl border bg-rose-500/10 text-rose-500 border-rose-500/20 shrink-0">
                <XCircle size={17} />
              </span>
              <div className="min-w-0">
                <h3 className={`text-base font-black ${strong}`}>
                  Rechazar pedido #{rechazando.id}
                </h3>
                <p className={`mt-1 text-xs ${muted}`}>
                  Escribe por qué no lo quieres. El motivo queda guardado y el administrador lo recibe en sus avisos.
                </p>
              </div>
            </div>

            <label className={`mt-4 block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
              Motivo del rechazo *
            </label>
            <textarea
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              rows={4}
              maxLength={500}
              autoFocus
              placeholder="Por ejemplo: pedimos de más, la sucursal ya tiene suficiente pollo"
              className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
            />
            <p className={`mt-1.5 text-[11px] ${motivoRechazo.trim().length < 5 ? 'text-amber-500' : muted}`}>
              {motivoRechazo.trim().length < 5
                ? 'Escribe al menos 5 caracteres.'
                : `${motivoRechazo.trim().length} de 500 caracteres`}
            </p>

            <label className={`mt-3 block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
              Fotos de evidencia (opcional)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFotosRechazo(Array.from(e.target.files || []))}
              className={`w-full px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
            />
            {fotosRechazo.length > 0 && (
              <p className={`mt-1 text-[11px] ${muted}`}>
                {fotosRechazo.length} foto(s) seleccionada(s)
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => { setRechazando(null); setMotivoRechazo(''); setFotosRechazo([]); }}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border transition ${
                  darkMode
                    ? 'border-slate-800 text-slate-400 hover:bg-slate-800'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={enviandoRechazo || motivoRechazo.trim().length < 5}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {enviandoRechazo
                  ? <Loader2 size={16} className="animate-spin" />
                  : <XCircle size={16} />}
                Rechazar pedido
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Borrar definitivamente un pedido archivado */}
      {porEliminar && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${card}`}>
            <div className="flex items-start gap-3">
              <span className="p-2.5 rounded-xl border bg-rose-500/10 text-rose-500 border-rose-500/20 shrink-0">
                <Trash2 size={17} />
              </span>
              <div className="min-w-0">
                <h3 className={`text-base font-black ${strong}`}>
                  Eliminar pedido #{porEliminar.id}
                </h3>
                <p className={`mt-1 text-xs ${muted}`}>
                  Se borra el pedido, su recepción y su reporte para siempre. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setPorEliminar(null)}
                disabled={eliminando}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-bold transition disabled:opacity-60 ${
                  darkMode
                    ? 'border-slate-800 text-slate-400 hover:bg-slate-800'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEliminarArchivado}
                disabled={eliminando}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {eliminando
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Trash2 size={16} />}
                {eliminando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: reporte de entrega */}
      {reporteAbierto && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${card}`}>
            <div className="flex items-start gap-3">
              <span className="p-2.5 rounded-xl border bg-purple-500/10 text-purple-500 border-purple-500/20 shrink-0">
                <FileCheck2 size={17} />
              </span>
              <div className="min-w-0">
                <h3 className={`text-base font-black ${strong}`}>
                  Reporte de entrega · Pedido #{reporteAbierto.id}
                </h3>
                <p className={`mt-1 text-xs ${muted}`}>
                  Marcá el estado del pollo, escribí una observación o adjuntá fotos. El reporte le llega al administrador.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {ESTADOS_PRODUCTO.map((opcion) => {
                const activo = (estadoEntrega[reporteAbierto.id] || '') === opcion.valor;
                return (
                  <button
                    key={opcion.valor}
                    type="button"
                    onClick={() => setEstadoEntrega((actuales) => ({
                      ...actuales,
                      [reporteAbierto.id]: activo ? '' : opcion.valor,
                    }))}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-bold border transition ${
                      activo
                        ? 'bg-purple-500/15 border-purple-500/40 text-purple-500'
                        : darkMode
                          ? 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {activo
                      ? <CheckCircle size={13} className="shrink-0" />
                      : <span className="h-3 w-3 shrink-0 rounded-full border border-current" />}
                    {opcion.label}
                  </button>
                );
              })}
            </div>

            <textarea
              rows={4}
              maxLength={2000}
              value={observacionesEntrega[reporteAbierto.id] || ''}
              onChange={(e) => setObservacionesEntrega((actuales) => ({
                ...actuales,
                [reporteAbierto.id]: e.target.value,
              }))}
              placeholder="Escribe aquí la observación sobre el pedido recibido"
              className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm ${input}`}
            />
            <FotosObservaciones
              fotos={fotosEntrega[reporteAbierto.id] || []}
              onCambio={(fotos) => setFotosEntrega((actuales) => ({ ...actuales, [reporteAbierto.id]: fotos }))}
              onError={(texto) => setMensaje({ tipo: 'error', texto })}
              theme={{ borde: bordeInput, texto: label, tenue: muted, hoja: card }}
            />

            {errorReporte[reporteAbierto.id] && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-red-500">
                <AlertCircle size={13} className="mt-px shrink-0" />
                {errorReporte[reporteAbierto.id]}
              </p>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className={`text-[10px] ${muted}`}>
                {(observacionesEntrega[reporteAbierto.id] || '').length}/2000
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReporteAbierto(null)}
                  disabled={enviandoObservacionPedido === reporteAbierto.id}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition disabled:opacity-60 ${
                    darkMode
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await handleEnviarObservacionesEntrega(reporteAbierto);
                    if (ok) setReporteAbierto(null);
                  }}
                  disabled={enviandoObservacionPedido === reporteAbierto.id}
                  className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-purple-700 disabled:opacity-60"
                >
                  {enviandoObservacionPedido === reporteAbierto.id
                    ? <Loader2 size={16} className="animate-spin" />
                    : <FileCheck2 size={16} />}
                  {enviandoObservacionPedido === reporteAbierto.id ? 'Enviando...' : 'Enviar reporte'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: eliminar seleccionados (masivo) */}
      {confirmarEliminarMasivo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${card}`}>
            <div className="flex items-start gap-3">
              <span className="p-2.5 rounded-xl border bg-rose-500/10 text-rose-500 border-rose-500/20 shrink-0">
                <Trash2 size={17} />
              </span>
              <div className="min-w-0">
                <h3 className={`text-base font-black ${strong}`}>
                  Eliminar {seleccionados.length} pedido(s)
                </h3>
                <p className={`mt-1 text-xs ${muted}`}>
                  Se borran los pedidos seleccionados, su recepción y su reporte para siempre. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmarEliminarMasivo(false)}
                disabled={procesandoMasivo}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-bold transition disabled:opacity-60 ${
                  darkMode
                    ? 'border-slate-800 text-slate-400 hover:bg-slate-800'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEliminarMasivo}
                disabled={procesandoMasivo}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {procesandoMasivo
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Trash2 size={16} />}
                {procesandoMasivo ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalConfirmar
        config={pedidoAConfirmar ? {
          titulo: `Cancelar pedido #${pedidoAConfirmar.id}`,
          mensaje: 'El pedido se va a cancelar y no se puede recuperar. Por favor, escribí el motivo:',
          labelConfirmar: 'Cancelar pedido',
          variante: 'danger',
          onConfirmar: () => handleCancelar(pedidoAConfirmar.id, motivoRechazo),
          inputMotivo: {
            value: motivoRechazo,
            onChange: (e) => setMotivoRechazo(e.target.value),
            placeholder: 'Motivo de la cancelación...',
            minLength: 5,
            maxLength: 500,
          }
        } : null}
        onCerrar={() => {
          if (!enviandoRechazo) setPedidoAConfirmar(null);
        }}
        cargando={enviandoRechazo}
      />

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
            onClick={(evento) => evento.stopPropagation()}
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
