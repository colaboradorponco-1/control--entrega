import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { pedidosRepository } from '../../repositories/pedidosRepository';
import { authRepository } from '../../repositories/AuthRepository';
import { evidenciasRepository } from '../../repositories/evidenciasRepository';
import { supabase } from '../../config/supabaseClient';
import {
  LogOut, Sun, Moon, X, ArrowLeft, CheckCircle, AlertCircle,
  ShoppingCart, PackageCheck, Truck, Loader2, CalendarDays, Ban,
  Camera, FileCheck2, Images, RefreshCw, Bell, Store, Inbox,
  History, XCircle
} from 'lucide-react';
import FotosObservaciones from '../../components/FotosObservaciones';
import FormularioRecepcion from '../../components/FormularioRecepcion';
import EntregasDirectas from './EntregasDirectas';

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

export default function PedidosSucursal() {
  const { perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

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
  const [aprobandoPedido, setAprobandoPedido] = useState(null);
  const [rechazando, setRechazando] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [enviandoRechazo, setEnviandoRechazo] = useState(false);

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
  const estadosPedidosPrevios = useRef(null);
  const avisoTimeout = useRef(null);
  const [avisoPedido, setAvisoPedido] = useState(null);

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
  const esVistaAdmin = ['administrador', 'superadmin'].includes(perfil?.roles?.nombre);
  const esAdmin = ['administrador', 'superadmin'].includes(perfil?.roles?.nombre);
  // El reporte de entrega es del administrador: el superadmin no lo ve.
  const esAdminReporte = perfil?.roles?.nombre === 'administrador';

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (cargaEnCurso.current) return;
    cargaEnCurso.current = true;
    try {
      if (!silencioso) setCargando(true);
      const pedidosActualizados = await pedidosRepository.listar();
      const estadosAnteriores = estadosPedidosPrevios.current;
      const cambios = estadosAnteriores
        ? pedidosActualizados.filter((pedido) => (
          estadosAnteriores.has(pedido.id) &&
          estadosAnteriores.get(pedido.id) !== pedido.estado
        ))
        : [];

      estadosPedidosPrevios.current = new Map(
        pedidosActualizados.map((pedido) => [pedido.id, pedido.estado])
      );
      setPedidos(pedidosActualizados);

      if (cambios.length) {
        const detalle = cambios.length === 1
          ? `Pedido #${cambios[0].id}: ${ESTADOS[cambios[0].estado]?.label || cambios[0].estado}.`
          : `${cambios.length} pedidos cambiaron de estado.`;
        setAvisoPedido(detalle);
        window.clearTimeout(avisoTimeout.current);
        avisoTimeout.current = window.setTimeout(() => setAvisoPedido(null), 8000);
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudieron cargar los pedidos' });
    } finally {
      if (!silencioso) setCargando(false);
      cargaEnCurso.current = false;
    }
  }, []);

  useEffect(() => {
    cargar();

    const actualizarPedidos = () => {
      if (document.visibilityState === 'visible') cargar({ silencioso: true });
    };
    const intervalo = window.setInterval(actualizarPedidos, 20000);
    document.addEventListener('visibilitychange', actualizarPedidos);

    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', actualizarPedidos);
      window.clearTimeout(avisoTimeout.current);
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

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(null), 5000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const activos = useMemo(() => pedidos.filter((p) => !ESTADOS_FINALIZADOS.includes(p.estado)), [pedidos]);
  const historicos = useMemo(() => pedidos.filter((p) => ESTADOS_FINALIZADOS.includes(p.estado)), [pedidos]);
  const resumen = useMemo(() => ({
    pendientes: pedidos.filter((p) => p.estado === 'PENDIENTE').length,
    enCamino: pedidos.filter((p) => p.estado === 'RECOGIDO').length,
    entregados: pedidos.filter((p) => p.estado === 'ENTREGADO').length,
    rechazados: pedidos.filter((p) => ['CANCELADO', 'RECHAZADO'].includes(p.estado)).length,
  }), [pedidos]);

  // El bloque de seguimiento solo tiene sentido para un pedido que
  // todavía esta en curso. Antes se caia al ultimo pedido de todos
  // y, si ya estaba entregado, mostraba "El pedido ya llego a la
  // sucursal" sin que nadie lo hubiera pedido.
  const pedidoSeguimiento = useMemo(() => {
    if (!pedidos.length) return null;
    const ordenar = (a, b) => (
      new Date(b.actualizado_en || b.creado_en || 0) - new Date(a.actualizado_en || a.creado_en || 0)
    );
    const enCamino = pedidos.filter((p) => p.estado === 'RECOGIDO');
    if (enCamino.length) return [...enCamino].sort(ordenar)[0];
    const activosPedidos = pedidos.filter((p) => !ESTADOS_FINALIZADOS.includes(p.estado));
    if (!activosPedidos.length) return null;
    return [...activosPedidos].sort(ordenar)[0] || null;
  }, [pedidos]);

  const unidadesRecibidas = Number(formRecepcion.unidades_recibidas) || 0;
  const hayFaltantesEnRecepcion = Boolean(recibiendo) && unidadesRecibidas < recibiendo.unidades;
  const excedeEnRecepcion = Boolean(recibiendo) && unidadesRecibidas > recibiendo.unidades;
  const faltaObservacionFaltante = hayFaltantesEnRecepcion && !formRecepcion.observaciones.trim();

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
      await pedidosRepository.rechazar(rechazando.id, motivo);
      setMensaje({ tipo: 'exito', texto: `Pedido #${rechazando.id} rechazado. El administrador fue avisado.` });
      setRechazando(null);
      setMotivoRechazo('');
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo rechazar el pedido' });
    } finally {
      setEnviandoRechazo(false);
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
      await cargar();
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
      return;
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
    } catch (err) {
      // El error se muestra tambien junto al boton: el banner de
      // arriba de la pagina queda fuera de la vista cuando el
      // formulario esta abajo en la lista.
      const detalle = err.message || 'No se pudo enviar el reporte.';
      setErrorReporte((actuales) => ({ ...actuales, [pedido.id]: detalle }));
      setMensaje({ tipo: 'error', texto: detalle });
    } finally {
      setEnviandoObservacionPedido(null);
    }
  };

  const aprobarPedido = async (pedido) => {
    if (!['administrador', 'superadmin'].includes(perfil?.roles?.nombre)) {
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

  const renderPedido = (p) => {
    const est = ESTADOS[p.estado] || ESTADOS.PENDIENTE;
    const Icono = est.icon;
    const recepcion = p.pedido_recepciones?.[0];
    // El reporte de entrega viene en su propia tabla (con RLS): el
    // superadmin no lo recibe.
    const reporte = p.reporte_entrega;
    const pasoActual = PASOS_SEGUIMIENTO.findIndex((paso) => paso.estado === p.estado);
    const progreso = pasoActual < 0 ? 0 : (pasoActual / (PASOS_SEGUIMIENTO.length - 1)) * 100;
    // Solo se cuenta lo que ya salio de la planta, que es lo unico
    // que la base acepta como entregado.
    const falta = p.estado === 'RECOGIDO';

    return (
      <div key={p.id} className={`${card} border rounded-2xl p-4`}>
        <div className="flex items-start gap-3">
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
                <div className="mt-4 overflow-x-auto pb-1" aria-label={`Seguimiento del pedido: ${est.label}`}>
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
                        <div key={paso.estado} className="relative z-10 flex w-20 flex-col items-center gap-1.5 text-center">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                            completado
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : actual
                                ? 'border-purple-500 bg-purple-500 text-white'
                                : darkMode
                                  ? 'border-slate-600 bg-slate-900 text-slate-500'
                                  : 'border-gray-300 bg-white text-gray-400'
                          }`}>
                            {completado
                              ? <CheckCircle size={14} />
                              : <span className="text-[10px] font-bold">{index + 1}</span>}
                          </span>
                          <span className={`text-[10px] leading-tight ${
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

            {p.estado === 'ENTREGADO'
              && recepcion
              && (esSucursal || esAdminReporte)
              && (
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
                      ¿En qué estado te entregaron el pollo? Marcá una opción, escribí si hace falta y adjuntá fotos.
                      Te quedan {horasRestantesReporte(recepcion.recibido_en, ahora)} h para enviarlo (7 días desde la recepción).
                      Si no tenés nada que reportar, no necesitás llenar nada.
                    </p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {ESTADOS_PRODUCTO.map((opcion) => {
                const activo = (estadoEntrega[p.id] || '') === opcion.valor;
                return (
                  <button
                            key={opcion.valor}
                            type="button"
                            onClick={() => setEstadoEntrega((actuales) => ({
                              ...actuales,
                              [p.id]: activo ? '' : opcion.valor,
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
                      rows={3}
                      maxLength={2000}
                      value={observacionesEntrega[p.id] || ''}
                      onChange={(e) => setObservacionesEntrega((actuales) => ({
                        ...actuales,
                        [p.id]: e.target.value,
                      }))}
                      placeholder="Escribe aquí la observación sobre el pedido recibido"
                      className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm ${input}`}
                    />
                    <FotosObservaciones
                      fotos={fotosEntrega[p.id] || []}
                      onCambio={(fotos) => setFotosEntrega((actuales) => ({ ...actuales, [p.id]: fotos }))}
                      onError={(texto) => setMensaje({ tipo: 'error', texto })}
                      theme={{ borde: bordeInput, texto: label, tenue: muted, hoja: card }}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className={`text-[10px] ${muted}`}>
                        {(observacionesEntrega[p.id] || '').length}/2000
                      </span>
                      <button
                        onClick={() => handleEnviarObservacionesEntrega(p)}
                        disabled={enviandoObservacionPedido === p.id}
                        className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-purple-700 disabled:opacity-60"
                      >
                        {enviandoObservacionPedido === p.id ? 'Enviando...' : 'Enviar reporte'}
                      </button>
                    </div>
                    {errorReporte[p.id] && (
                      <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-red-500">
                        <AlertCircle size={13} className="mt-px shrink-0" />
                        {errorReporte[p.id]}
                      </p>
                    )}
                  </>
                ) : esSucursal ? (
                  <p className={`mt-1 text-[11px] ${muted}`}>
                    El plazo para enviar el reporte venció: era 7 días después de recibir el pedido.
                  </p>
                ) : (
                  <p className={`mt-1 text-[11px] ${muted}`}>La sucursal aún no envió observaciones.</p>
                )}
              </div>
            )}

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
              <button
                onClick={() => abrirRechazo(p)}
                className={`mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition ${darkMode ? 'border-slate-800 text-slate-400 hover:border-slate-800' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
              >
                <XCircle size={14} /> Rechazar pedido
              </button>
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
  const renderHistorial = (item) => {
    const estadoInfo = ESTADOS[item.estado] || ESTADOS.PENDIENTE;
    const IconoHistorial = estadoInfo.icon;
    const recepcionHistorial = item.pedido_recepciones?.[0];
    const reporteHistorial = item.reporte_entrega;

    return (
      <div key={item.id} className={`${card} border rounded-2xl p-4`}>
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
            </div>
            <p className={`mt-1 text-xs ${muted}`}>
              {item.unidades} unidades · pedido el {new Date(item.creado_en).toLocaleDateString('es-BO')}
              {recepcionHistorial?.recibido_en
                ? ` · recibido el ${new Date(recepcionHistorial.recibido_en).toLocaleString('es-BO', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}`
                : ''}
            </p>
            {reporteHistorial?.estado_producto && (
              <p className={`mt-2 text-xs ${normal}`}>
                Estado del pollo:{' '}
                <span className="font-bold">
                  {ETIQUETA_ESTADO_PRODUCTO[reporteHistorial.estado_producto] || reporteHistorial.estado_producto}
                </span>
              </p>
            )}
            {reporteHistorial?.observaciones_entrega && (
              <p className={`mt-1 whitespace-pre-wrap text-sm ${normal}`}>“{reporteHistorial.observaciones_entrega}”</p>
            )}
            {item.estado === 'RECHAZADO' && item.motivo_rechazo && (
              <p className={`mt-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs ${normal}`}>
                <span className="font-bold text-rose-400">Motivo del rechazo: </span>
                {item.motivo_rechazo}
              </p>
            )}
          </div>
        </div>
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
                  {vista === 'entregas'
                    ? 'Entregas directas'
                    : vista === 'historial'
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
              onClick={() => setVista('entregas')}
              className={tabClase(vista === 'entregas')}
            >
              <Store size={15} /> Entregas directas
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
        {vista === 'entregas' ? (
          <EntregasDirectas />
        ) : vista === 'historial' ? (
          <section>
            <h2 className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${muted}`}>
              Historial de pedidos ({historicos.length})
            </h2>
            {historicos.length === 0 ? (
              <div className={`${card} border rounded-2xl py-12 text-center ${muted}`}>
                <History size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm font-semibold">Todavía no hay pedidos en el historial</p>
                <p className="text-xs mt-1">
                  Acá van a aparecer los pedidos entregados, cancelados y rechazados
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">{historicos.map(renderHistorial)}</div>
            )}
          </section>
        ) : (
          <>
        {mensaje && (
          <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
            mensaje.tipo === 'error'
              ? 'bg-red-950/40 border-red-800/50 text-red-300'
              : mensaje.tipo === 'aviso'
                ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
          }`}>
            {mensaje.tipo === 'error' ? <AlertCircle size={18} className="shrink-0 mt-0.5" /> : <CheckCircle size={18} className="shrink-0 mt-0.5" />}
            <p className="text-sm font-semibold">{mensaje.texto}</p>
          </div>
        )}

        {avisoPedido && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-cyan-700 dark:text-cyan-300"
          >
            <Bell size={18} className="shrink-0" />
            <p className="flex-1 text-sm font-semibold">{avisoPedido}</p>
            <button
              onClick={() => {
                window.clearTimeout(avisoTimeout.current);
                setAvisoPedido(null);
              }}
              aria-label="Cerrar aviso de pedido"
              className="rounded-lg p-1 hover:bg-cyan-500/10"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {cargando ? (
          <div className={`flex items-center justify-center gap-2 py-20 ${muted}`}>
            <Loader2 size={20} className="animate-spin" /> Cargando pedidos...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {[
                { label: 'Pendientes', valor: resumen.pendientes, Icono: ShoppingCart, clases: 'text-amber-500 border-amber-500/25 bg-amber-500/10' },
                { label: 'En camino', valor: resumen.enCamino, Icono: Truck, clases: 'text-cyan-500 border-cyan-500/25 bg-cyan-500/10' },
                { label: 'Entregados', valor: resumen.entregados, Icono: CheckCircle, clases: 'text-emerald-500 border-emerald-500/25 bg-emerald-500/10' },
                { label: 'Rechazados', valor: resumen.rechazados, Icono: XCircle, clases: 'text-rose-500 border-rose-500/25 bg-rose-500/10' },
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

            <section>
              <h2 className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${muted}`}>
                Pedidos activos ({activos.length})
              </h2>
              {activos.length === 0 ? (
                <div className={`${card} border rounded-2xl py-12 text-center ${muted}`}>
                  <ShoppingCart size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-semibold">No hay pedidos activos</p>
                  {esSucursal && <p className="text-xs mt-1">El dueño de la sucursal registra los pedidos</p>}
                </div>
              ) : (
                <div className="space-y-2.5">{activos.map(renderPedido)}</div>
              )}
            </section>
          </>
        )}
          </>
        )}
      </main>

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

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => { setRechazando(null); setMotivoRechazo(''); }}
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
