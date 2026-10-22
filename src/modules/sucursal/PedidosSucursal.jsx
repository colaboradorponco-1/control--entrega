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
  Camera, User, FileCheck2, Images, RefreshCw, Bell
} from 'lucide-react';
import FirmaCanvas from '../../components/FirmaCanvas';
import SelectorFoto from '../../components/SelectorFoto';
import FotosObservaciones from '../../components/FotosObservaciones';
import MapaUbicacion from '../../components/MapaUbicacion';
import SeguimientoRepartidor from '../../components/SeguimientoRepartidor';

const ESTADOS = {
  PENDIENTE: { label: 'Pendiente', badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: ShoppingCart },
  APROBADO: { label: 'Aprobado', badge: 'bg-violet-500/10 text-violet-500 border-violet-500/20', icon: CheckCircle },
  EN_PREPARACION: { label: 'En preparación', badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: PackageCheck },
  LISTO: { label: 'Listo', badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: PackageCheck },
  RECOGIDO: { label: 'En camino', badge: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20', icon: Truck },
  ENTREGADO: { label: 'Entregado', badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: CheckCircle },
  CANCELADO: { label: 'Cancelado', badge: 'bg-red-500/10 text-red-500 border-red-500/20', icon: Ban },
};

const partesEnBolivia = (fecha) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).formatToParts(new Date(fecha)).reduce((partes, parte) => {
  partes[parte.type] = parte.value;
  return partes;
}, {});

const fechaBolivia = (fecha) => {
  const partes = partesEnBolivia(fecha);
  return `${partes.year}-${partes.month}-${partes.day}`;
};

const puedeEnviarObservacionesEntrega = (recibidoEn, ahora) => {
  const fechaEntrega = fechaBolivia(recibidoEn);
  const actual = partesEnBolivia(ahora);
  const fechaActual = `${actual.year}-${actual.month}-${actual.day}`;
  return fechaActual === fechaEntrega && `${actual.hour}:${actual.minute}` <= '18:00';
};

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
  const [actualizando, setActualizando] = useState(false);
  const [actualizacionEnVivo, setActualizacionEnVivo] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [observacionesEntrega, setObservacionesEntrega] = useState({});
  const [enviandoObservacionPedido, setEnviandoObservacionPedido] = useState(null);
  const [aprobandoPedido, setAprobandoPedido] = useState(null);

  const [recibiendo, setRecibiendo] = useState(null);
  const [formRecepcion, setFormRecepcion] = useState({
    unidades_recibidas: '',
    recibido_por: '',
    observaciones: '',
  });
  const [foto, setFoto] = useState(null);
  const [fotosExtra, setFotosExtra] = useState([]);
  const [firma, setFirma] = useState(null);
  const [ubicacion, setUbicacion] = useState(null);
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
  const esSucursal = perfil?.roles?.nombre === 'sucursal';
  const esVistaAdmin = ['administrador', 'superadmin'].includes(perfil?.roles?.nombre);
  const esAdmin = ['administrador', 'superadmin'].includes(perfil?.roles?.nombre);

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

  const activos = useMemo(() => pedidos.filter((p) => !['ENTREGADO', 'CANCELADO'].includes(p.estado)), [pedidos]);
  const historicos = useMemo(() => pedidos.filter((p) => ['ENTREGADO', 'CANCELADO'].includes(p.estado)), [pedidos]);

  const handleCancelar = async (p) => {
    if (!window.confirm(`¿Cancelar el pedido de ${p.unidades} unidades?`)) return;
    try {
      await pedidosRepository.cancelar(p.id);
      setMensaje({ tipo: 'exito', texto: 'Pedido cancelado' });
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo cancelar' });
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
    setUbicacion(null);
  };

  const handleRecepcion = async (e) => {
    e.preventDefault();

    const unidades = Number(formRecepcion.unidades_recibidas);
    if (Number.isNaN(unidades) || unidades < 0) {
      setMensaje({ tipo: 'error', texto: 'Ingresa las unidades recibidas' });
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

    try {
      setEnviando(true);
      await pedidosRepository.confirmarRecepcion(recibiendo.id, {
        unidades_recibidas: unidades,
        recibido_por: formRecepcion.recibido_por,
        observaciones: formRecepcion.observaciones,
        fotosExtra,
        foto,
        firma: evidenciasRepository.dataUrlABlob(firma),
        ubicacion,
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
    if (!texto) {
      setMensaje({ tipo: 'error', texto: 'Escribe una observación antes de enviarla.' });
      return;
    }
    try {
      setEnviandoObservacionPedido(pedido.id);
      await pedidosRepository.enviarObservacionesEntrega(pedido.id, texto);
      setObservacionesEntrega((actuales) => ({ ...actuales, [pedido.id]: '' }));
      setMensaje({ tipo: 'exito', texto: `Observaciones del pedido #${pedido.id} enviadas.` });
      await cargar({ silencioso: true });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudieron enviar las observaciones.' });
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

            {p.estado === 'CANCELADO' ? (
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
                {p.estado === 'RECOGIDO' && (
                  <SeguimientoRepartidor pedido={p} darkMode={darkMode} />
                )}
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
              <button
                onClick={() => abrirRecepcion(p)}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition shadow-lg shadow-emerald-500/20"
              >
                <PackageCheck size={16} /> Recibir pedido
              </button>
            )}

            {p.estado === 'ENTREGADO'
              && recepcion
              && (esSucursal || esVistaAdmin)
              && (
              <div className={`mt-3 rounded-xl border p-3 ${darkMode ? 'border-purple-900/60 bg-purple-950/20' : 'border-purple-200 bg-purple-50'}`}>
                <p className={`text-xs font-bold ${strong}`}>Observaciones del pedido entregado (opcional)</p>
                {recepcion.observaciones_entrega ? (
                  <>
                    <p className={`mt-2 whitespace-pre-wrap text-sm ${normal}`}>{recepcion.observaciones_entrega}</p>
                    <p className={`mt-1 text-[10px] ${muted}`}>
                      Enviado {recepcion.observaciones_entrega_en
                        ? `el ${new Date(recepcion.observaciones_entrega_en).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`
                        : ''}
                    </p>
                  </>
                ) : esSucursal && puedeEnviarObservacionesEntrega(recepcion.recibido_en, ahora) ? (
                  <>
                    <p className={`mt-1 text-[11px] ${muted}`}>
                      Puedes enviarlas hasta las 18:00 de hoy, hora de Cochabamba. Si no tienes observaciones, no necesitas llenar nada.
                    </p>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={observacionesEntrega[p.id] || ''}
                      onChange={(e) => setObservacionesEntrega((actuales) => ({
                        ...actuales,
                        [p.id]: e.target.value,
                      }))}
                      placeholder="Escribe aquí una observación sobre el pedido recibido"
                      className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm ${input}`}
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
                        {enviandoObservacionPedido === p.id ? 'Enviando...' : 'Enviar observaciones'}
                      </button>
                    </div>
                  </>
                ) : esSucursal ? (
                  <p className={`mt-1 text-[11px] ${muted}`}>
                    El plazo para enviar observaciones venció a las 18:00 de Cochabamba del día de entrega.
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
                onClick={() => handleCancelar(p)}
                className={`mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition ${darkMode ? 'border-slate-800 text-slate-400 hover:bg-slate-800' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
              >
                <Ban size={14} /> Cancelar pedido
              </button>
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
                  {esVistaAdmin ? 'Seguimiento de pedidos' : 'Mis Pedidos'}
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
            <button
              onClick={toggleTheme}
              className={`p-2.5 rounded-xl border transition ${darkMode ? 'bg-slate-900 border-slate-800 text-amber-400' : 'bg-gray-50 border-gray-300 text-amber-500'}`}
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
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
            <button
              onClick={() => authRepository.logout()}
              className="p-2.5 rounded-xl bg-red-950/50 border border-red-800/50 text-red-300 transition"
              aria-label="Salir"
            >
              <LogOut size={18} />
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

            {historicos.length > 0 && (
              <section>
                <h2 className={`text-xs font-bold uppercase tracking-wider mb-2.5 ${muted}`}>
                  Historial ({historicos.length})
                </h2>
                <div className="space-y-2.5 opacity-80">{historicos.map(renderPedido)}</div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Modal recepción con evidencia */}
      {recibiendo && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className={`${card} border rounded-2xl w-full max-w-md p-5 md:p-6 shadow-2xl my-4`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className={`text-lg font-black ${strong}`}>Recibir Pedido #{recibiendo.id}</h2>
              <button onClick={() => setRecibiendo(null)} className={`p-2 rounded-xl ${muted} hover:bg-slate-500/10`} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <p className={`text-xs mb-5 ${muted}`}>
              Pediste <span className={`font-bold ${normal}`}>{recibiendo.unidades} unidades</span>. Contá lo que llegó y firmá el comprobante.
            </p>

            <form onSubmit={handleRecepcion} className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Unidades recibidas *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={formRecepcion.unidades_recibidas}
                  onChange={(e) => setFormRecepcion({ ...formRecepcion, unidades_recibidas: e.target.value })}
                  autoFocus
                  className={`w-full px-4 py-3 border rounded-xl text-lg font-bold outline-none focus:ring-2 transition ${input}`}
                />
                {Number(formRecepcion.unidades_recibidas) < recibiendo.unidades && (
                  <p className="mt-1.5 text-[11px] font-bold text-amber-500">
                    Faltan {recibiendo.unidades - Number(formRecepcion.unidades_recibidas)} unidades. Quedará registrado.
                  </p>
                )}
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Quién recibió *
                </label>
                <div className="relative">
                  <User size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${muted} pointer-events-none`} />
                  <input
                    type="text"
                    required
                    value={formRecepcion.recibido_por}
                    onChange={(e) => setFormRecepcion({ ...formRecepcion, recibido_por: e.target.value })}
                    placeholder="Nombre de quien recibió"
                    className={`w-full pl-10 pr-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
                  />
                </div>
                <p className={`mt-1.5 text-[11px] ${muted}`}>Si no sos vos, poné el nombre de quien recibió de verdad.</p>
              </div>

              <SelectorFoto
                etiqueta="Foto de la entrega"
                ayuda="Puedes tomarla con la camara o buscarla en la galeria"
                theme={{ borde: bordeInput, texto: label, tenue: muted, hoja: card }}
                onSeleccionar={setFoto}
                onError={(texto) => setMensaje({ tipo: 'error', texto })}
              />

              <FirmaCanvas
                titulo="Firma de quien recibe"
                theme={{
                  card: 'bg-white',
                  borde: 'border-slate-300',
                  texto: label,
                  tenue: muted,
                }}
                onCambio={(dataUrl) => setFirma(dataUrl)}
              />

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Observaciones al recibir (opcional)
                </label>
                <textarea
                  rows={2}
                  value={formRecepcion.observaciones}
                  onChange={(e) => setFormRecepcion({ ...formRecepcion, observaciones: e.target.value })}
                  placeholder="Ej: todo bien / faltaban 5 unidades / llegó frío"
                  className={`w-full px-4 py-3 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
                />
              </div>

              <FotosObservaciones
                fotos={fotosExtra}
                onCambio={setFotosExtra}
                onError={(texto) => setMensaje({ tipo: 'error', texto })}
                theme={{ borde: bordeInput, texto: label, tenue: muted, hoja: card }}
              />

              <MapaUbicacion
                valor={ubicacion}
                onCambio={setUbicacion}
                theme={{ borde: bordeInput, texto: label, tenue: muted, hoja: card, pin: '#10b981', oscuro: darkMode }}
              />

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setRecibiendo(null)} className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold border ${input}`}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white px-4 py-3 rounded-xl text-sm font-bold transition shadow-lg shadow-emerald-500/20"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <FileCheck2 size={16} />}
                  Firmar y confirmar
                </button>
              </div>
            </form>
          </div>
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
