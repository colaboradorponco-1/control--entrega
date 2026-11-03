import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { planillaRepository } from '../../repositories/planillaRepository';
import ModalConfirmar from '../../components/ModalConfirmar';
import { exportarAExcel, exportarAPDF } from '../../utils/exportUtils';
import SeccionCompras from './SeccionCompras';
import SeccionVentas from './SeccionVentas';
import SeccionInventario from './SeccionInventario';
import BotonesExportar from './BotonesExportar';
import {
  aISO,
  construirReporteCompras,
  diasDeSemana,
  formatoBs,
  formatoNumero,
  inicioSemana,
  rangoSemana,
  sumarDias,
} from './planillaUtils';

export default function PlanillaSemanal() {
  const navigate = useNavigate();
  const location = useLocation();
  const fechaInicial = location.state?.fechaCaptura;
  const { perfil } = useAuth();
  const { darkMode } = useTheme();

  const [inicio, setInicio] = useState(() => (
    inicioSemana(fechaInicial ? new Date(`${fechaInicial}T00:00:00`) : new Date())
  ));
  const [sucursales, setSucursales] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [compras, setCompras] = useState([]);
  const [planillasComprasArchivadas, setPlanillasComprasArchivadas] = useState([]);
  const [planillasVentasGuardadas, setPlanillasVentasGuardadas] = useState([]);
  const [cierresVentas, setCierresVentas] = useState([]);
  const [planillasVentasArchivadas, setPlanillasVentasArchivadas] = useState([]);
  const [ventas, setVentas] = useState(() => new Map());
  const [ventasPendientes, setVentasPendientes] = useState(() => new Set());
  const [ventasCerradas, setVentasCerradas] = useState(() => new Set());
  const [ventasEditando, setVentasEditando] = useState(false);
  const [entregas, setEntregas] = useState(() => new Map());
  const [inventario, setInventario] = useState(() => new Map());
  const [inventarioPlanta, setInventarioPlanta] = useState([]);
  const [ajustesInventario, setAjustesInventario] = useState([]);
  const [campo, setCampo] = useState('unidades');
  const [seccionActiva, setSeccionActiva] = useState('compras');
  const [filtroProveedorCompras, setFiltroProveedorCompras] = useState('todos');
  const [filtroProveedorInventario, setFiltroProveedorInventario] = useState('todos');
  const [verComprasArchivadas, setVerComprasArchivadas] = useState(
    () => Boolean(location.state?.verComprasArchivadas),
  );
  const [vistaVentas, setVistaVentas] = useState('trabajo');
  const [diaIdx, setDiaIdx] = useState(() => {
    if (!fechaInicial) return 0;
    const semana = inicioSemana(new Date(`${fechaInicial}T00:00:00`));
    return diasDeSemana(semana).findIndex((dia) => aISO(dia) === fechaInicial);
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [inicioCaptura, setInicioCaptura] = useState(null);
  const [inicioVentasAbierto, setInicioVentasAbierto] = useState(false);
  const [fechaInicioVentas, setFechaInicioVentas] = useState('');
  const [confirmacionCompras, setConfirmacionCompras] = useState(null);
  const [confirmacionVentas, setConfirmacionVentas] = useState(null);
  const [procesandoCompras, setProcesandoCompras] = useState(false);
  const [procesandoVentas, setProcesandoVentas] = useState(false);
  const [ajusteInventarioAbierto, setAjusteInventarioAbierto] = useState(false);
  const [formAjusteInventario, setFormAjusteInventario] = useState({
    kilos: '',
    unidades: '',
    motivo: '',
  });
  const [guardandoAjusteInventario, setGuardandoAjusteInventario] = useState(false);
  const [errorAjusteInventario, setErrorAjusteInventario] = useState('');
  const ventasRef = useRef(new Map());
  const ventasPendientesRef = useRef(new Set());
  const vistaInicialVentasRef = useRef(false);

  useEffect(() => {
    if (!aviso || guardando || procesandoCompras || procesandoVentas) return undefined;
    const duracion = aviso.tipo === 'error' ? 8000 : 5000;
    const temporizador = window.setTimeout(() => setAviso(null), duracion);
    return () => window.clearTimeout(temporizador);
  }, [aviso, guardando, procesandoCompras, procesandoVentas]);

  const dias = useMemo(() => diasDeSemana(inicio), [inicio]);
  const rango = useMemo(() => rangoSemana(inicio), [inicio]);
  const stockActualDia = inventarioPlanta.find((fila) => fila.fecha === aISO(dias[diaIdx]));
  const kilosStockActual = Number(stockActualDia?.kilos_saldo) || 0;
  const unidadesStockActual = Number(stockActualDia?.unidades_saldo) || 0;
  const diferenciaKilosFisico = formAjusteInventario.kilos === ''
    ? 0
    : Number(formAjusteInventario.kilos) - kilosStockActual;
  const diferenciaUnidadesFisico = formAjusteInventario.unidades === ''
    ? 0
    : Number(formAjusteInventario.unidades) - unidadesStockActual;
  const ventasSemanaArchivada = planillasVentasArchivadas.some(
    (planilla) => planilla.semana_inicio === aISO(dias[0]),
  );
  const semanasArchivadas = new Set(
    planillasVentasArchivadas.map((planilla) => planilla.semana_inicio),
  );
  const semanasBandeja = planillasVentasGuardadas
    .filter((semana) => !semanasArchivadas.has(semana.semana_inicio))
    .map((semana) => {
      const sucursalesCerradas = new Set(
        cierresVentas
          .filter((cierre) => cierre.semana_inicio === semana.semana_inicio)
          .map((cierre) => Number(cierre.entidad_id)),
      );
      return {
        ...semana,
        cerrada: sucursales.length > 0
          && sucursales.every((sucursal) => sucursalesCerradas.has(Number(sucursal.id))),
      };
    });

  const card = darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-white';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const labelCaptura = darkMode ? 'text-slate-300' : 'text-gray-700';
  const inputCaptura = darkMode
    ? 'border-slate-700 bg-slate-950 text-white placeholder-slate-500'
    : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400';

  const cargar = useCallback(async (semana = inicio, limpiarAviso = true, silencioso = false) => {
    if (!silencioso) setCargando(true);
    if (limpiarAviso) setAviso(null);
    const desde = aISO(diasDeSemana(semana)[0]);
    const hasta = aISO(diasDeSemana(semana)[6]);
    try {
      const [
        listaSucursales,
        listaProveedores,
        filasVentas,
        filasEntregas,
        filasInventario,
        filasInventarioPlanta,
        filasAjustesInventario,
        filasCompras,
        comprasArchivadas,
        filasVentasCerradas,
        ventasGuardadas,
        todosLosCierresVentas,
        ventasArchivadas,
      ] = await Promise.all([
        planillaRepository.listarSucursales(),
        planillaRepository.listarProveedores(),
        planillaRepository.listarVentas({ desde, hasta }),
        planillaRepository.listarEntregas({ desde, hasta }),
        planillaRepository.listarInventario({ desde, hasta }),
        planillaRepository.listarInventarioPlanta({ desde, hasta }),
        planillaRepository.listarAjustesInventarioPlanta({ desde, hasta }),
        planillaRepository.comprasSemana({ desde, hasta }),
        planillaRepository.listarPlanillasComprasArchivadas({ semanaInicio: desde }),
        planillaRepository.listarVentasCerradas({ semanaInicio: desde }),
        planillaRepository.listarPlanillasVentasGuardadas(),
        planillaRepository.listarCierresVentas(),
        planillaRepository.listarPlanillasVentasArchivadas(),
      ]);
      const sucursalesCerradas = new Set(filasVentasCerradas.map((fila) => Number(fila.entidad_id)));

      const mapaVentas = new Map();
      for (const fila of filasVentas) {
        mapaVentas.set(`${fila.fecha}|${fila.sucursal_id}`, {
          unidades: fila.unidades,
          transacciones: fila.transacciones,
          importe_bs: fila.importe_bs,
        });
      }
      for (const clave of ventasPendientesRef.current) {
        const edicionLocal = ventasRef.current.get(clave);
        if (edicionLocal) mapaVentas.set(clave, edicionLocal);
      }
      const mapaEntregas = new Map();
      for (const fila of filasEntregas) {
        mapaEntregas.set(`${fila.fecha}|${fila.sucursal_id}`, Number(fila.unidades_entregadas) || 0);
      }
      const mapaInventario = new Map();
      for (const fila of filasInventario) {
        mapaInventario.set(`${fila.fecha}|${fila.proveedor_id}`, {
          kilos_ayer: fila.kilos_ayer,
          kilos_entrante: fila.kilos_entrante,
          kilos_saliente: fila.kilos_saliente,
        });
      }

      ventasRef.current = mapaVentas;
      setVentas(mapaVentas);
      setVentasCerradas(sucursalesCerradas);
      if (sucursalesCerradas.size) setVentasEditando(false);
      setEntregas(mapaEntregas);
      setInventario(mapaInventario);
      setInventarioPlanta(filasInventarioPlanta);
      setAjustesInventario(filasAjustesInventario);
      setSucursales(listaSucursales);
      setProveedores(listaProveedores);

      setCompras(filasCompras);
      setPlanillasComprasArchivadas(comprasArchivadas);
      setPlanillasVentasGuardadas(ventasGuardadas);
      setCierresVentas(todosLosCierresVentas);
      setPlanillasVentasArchivadas(ventasArchivadas);
      if (!vistaInicialVentasRef.current) {
        vistaInicialVentasRef.current = true;
        if (
          !fechaInicial
          && ventasGuardadas.some((semanaGuardada) => semanaGuardada.semana_inicio === desde)
        ) {
          setVistaVentas('bandeja');
        }
      }
      return true;
    } catch (err) {
      const detalle = err.message || 'revisa tu conexión';
      const faltaArchivado = detalle.includes('planillas_compras_archivadas');
      const faltaBandejaVentas = detalle.includes('planillas_ventas_semanales');
      const faltaArchivadoVentas = detalle.includes('planillas_ventas_archivadas');
      const faltaCierrePlanillas = detalle.includes('planillas_semanales_cerradas');
      const faltaPlanillasAutomaticas = [
        'listar_entregas_planilla',
        'listar_inventario_planta_planilla',
        'listar_ajustes_inventario_planta',
      ].some((funcion) => detalle.includes(funcion));
      setAviso({
        tipo: 'error',
        texto: faltaArchivado
          ? `No se pudo cargar la planilla: ${detalle}. Ejecuta supabase/PLANILLAS_COMPRAS_ARCHIVAR.sql en Supabase para habilitar el archivado.`
          : faltaBandejaVentas
            ? `No se pudo cargar la planilla: ${detalle}. Ejecuta supabase/PLANILLAS_VENTAS_ARCHIVAR.sql en Supabase para habilitar la bandeja semanal.`
          : faltaArchivadoVentas
            ? `No se pudo cargar la planilla: ${detalle}. Ejecuta supabase/PLANILLAS_VENTAS_ARCHIVAR.sql en Supabase para habilitar el archivado semanal de ventas.`
          : faltaCierrePlanillas
            ? `No se pudo cargar la planilla: ${detalle}. Ejecuta supabase/PLANILLAS_CIERRE.sql en Supabase para habilitar el cierre y la edición de ventas.`
          : faltaPlanillasAutomaticas
            ? `No se pudo cargar la planilla: ${detalle}. Ejecuta supabase/PLANILLAS_AUTOMATICAS_MANUALES.sql en Supabase despues de PLANILLA_VENTAS, PLANILLA_COMPRAS_MANUAL, PLANILLAS_CIERRE, PLANILLAS_COMPRAS_ARCHIVAR y arreglo_inventario.`
          : 'No se pudo cargar la planilla: ' + detalle,
      });
      return false;
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [fechaInicial, inicio]);

  useEffect(() => {
    cargar(inicio, false);
  }, [cargar, inicio]);

  useEffect(() => {
    const intervalo = window.setInterval(() => cargar(inicio, false, true), 30000);
    return () => window.clearInterval(intervalo);
  }, [cargar, inicio]);

  useEffect(() => {
    if (!fechaInicial) return;
    if (location.state.mensajeCaptura) {
      setAviso({ tipo: 'ok', texto: location.state.mensajeCaptura });
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [fechaInicial, location.pathname, location.state, navigate]);

  const abrirInicioCaptura = (tipo) => {
    setInicioCaptura({
      tipo,
      fecha: aISO(dias[0]),
      entidadId: '',
    });
  };

  const iniciarPlantilla = (evento) => {
    evento.preventDefault();
    if (!inicioCaptura?.entidadId) return;
    const opciones = inicioCaptura.tipo === 'ventas' ? sucursales : proveedores;
    const entidad = opciones.find((opcion) => String(opcion.id) === inicioCaptura.entidadId);
    if (!entidad) return;
    navigate('/planilla/captura', {
      state: {
        tipo: inicioCaptura.tipo,
        fecha: inicioCaptura.fecha,
        entidadId: inicioCaptura.entidadId,
        entidadNombre: entidad.nombre,
      },
    });
    setInicioCaptura(null);
  };

  const editarPlanillaCompras = (proveedor) => {
    navigate('/planilla/captura', {
      state: {
        tipo: 'compras',
        fecha: aISO(dias[0]),
        entidadId: String(proveedor.id),
        entidadNombre: proveedor.nombre,
      },
    });
  };

  const cambiarVistaCompras = (verArchivadas) => {
    setVerComprasArchivadas(verArchivadas);
    setFiltroProveedorCompras('todos');
  };

  const solicitarAccionCompra = (tipo, planilla) => {
    if (tipo === 'archivar') {
      ejecutarAccionCompra(tipo, planilla);
      return;
    }

    const nombre = proveedores.find(
      (proveedor) => String(proveedor.id) === String(planilla.proveedor_id),
    )?.nombre || 'proveedor';
    const descripcion = tipo === 'archivar'
      ? `Se archivará la planilla semanal de ${nombre}. Sus recibos se conservarán y dejarán de aparecer entre las planillas activas.`
      : tipo === 'restaurar'
        ? `La planilla semanal de ${nombre} volverá a las planillas activas. Si estaba cerrada, seguirá cerrada hasta que la reabras.`
        : `Se eliminarán permanentemente todos los recibos de ${nombre} de la semana ${rangoSemana(new Date(`${planilla.semana_inicio}T00:00:00`))}. Esta acción no se puede deshacer.`;
    setConfirmacionCompras({
      tipo,
      planilla,
      config: {
        titulo: tipo === 'archivar'
          ? 'Archivar planilla semanal'
          : tipo === 'restaurar'
            ? 'Restaurar planilla semanal'
            : 'Eliminar planilla archivada',
        mensaje: descripcion,
        labelConfirmar: tipo === 'archivar'
          ? 'Archivar'
          : tipo === 'restaurar' ? 'Restaurar' : 'Eliminar definitivamente',
        variante: tipo === 'restaurar' ? 'default' : tipo === 'archivar' ? 'warning' : 'danger',
        onConfirmar: () => ejecutarAccionCompra(tipo, planilla),
      },
    });
  };

  const ejecutarAccionCompra = async (tipo, planilla) => {
    if (!tipo || !planilla || procesandoCompras) return;
    setProcesandoCompras(true);
    setAviso({
      tipo: 'ok',
      texto: tipo === 'archivar'
        ? 'Archivando planilla...'
        : tipo === 'restaurar' ? 'Restaurando planilla...' : 'Eliminando planilla archivada...',
    });
    try {
      if (tipo === 'eliminar') {
        await planillaRepository.eliminarPlanillaComprasArchivada({
          proveedorId: planilla.proveedor_id,
          semanaInicio: planilla.semana_inicio,
        });
      } else {
        await planillaRepository.archivarPlanillaCompras({
          proveedorId: planilla.proveedor_id,
          semanaInicio: planilla.semana_inicio,
          archivar: tipo === 'archivar',
        });
      }

      const recargada = await cargar(inicio, false);
      if (!recargada) {
        setAviso({
          tipo: 'error',
          texto: 'La acción se completó, pero no se pudo actualizar la lista. Recárgala para ver el estado actual.',
        });
      } else {
        setAviso({
          tipo: 'ok',
          texto: tipo === 'archivar'
            ? 'Planilla archivada. Puedes verla desde “Archivadas”.'
            : tipo === 'restaurar'
              ? 'Planilla restaurada a las planillas activas.'
              : 'Planilla archivada y sus recibos eliminados definitivamente.',
        });
        if (tipo === 'archivar') setVerComprasArchivadas(true);
        if (tipo === 'restaurar' || tipo === 'eliminar') setVerComprasArchivadas(false);
      }
    } catch (err) {
      const detalle = err.message || 'No se pudo completar la acción.';
      const faltaFuncion = detalle.includes('archivar_planilla_compras')
        || detalle.includes('eliminar_planilla_compras_archivada')
        || err.code === 'PGRST202';
      const noEsSuperadmin = err.code === '42501'
        || detalle.toLowerCase().includes('solo el superadministrador');
      setAviso({
        tipo: 'error',
        texto: faltaFuncion
          ? `Supabase todavía no tiene activa la función de archivado. Ejecuta supabase/PLANILLAS_COMPRAS_ARCHIVAR.sql en el SQL Editor y vuelve a intentar. Detalle: ${detalle}`
          : noEsSuperadmin
            ? `La sesión actual no tiene permisos de superadministrador para esta acción. Detalle: ${detalle}`
            : `No se pudo ${tipo === 'archivar' ? 'archivar' : tipo === 'restaurar' ? 'restaurar' : 'eliminar'} la planilla. Detalle: ${detalle}`,
      });
    } finally {
      setProcesandoCompras(false);
      setConfirmacionCompras(null);
    }
  };

  const solicitarAccionVentas = (tipo, semanaInicio = aISO(dias[0])) => {
    const semana = rangoSemana(new Date(`${semanaInicio}T00:00:00`));
    const descripcion = tipo === 'archivar'
      ? `Se archivará la semana ${semana} completa. La plantilla quedará en solo lectura y podrás restaurarla después.`
      : tipo === 'restaurar'
        ? `La semana ${semana} volverá a las planillas activas. Seguirá cerrada hasta que pulses “Editar”.`
        : `Se eliminarán definitivamente los datos de ventas de todas las sucursales de la semana ${semana}. Esta acción no se puede deshacer.`;
    setConfirmacionVentas({
      titulo: tipo === 'archivar'
        ? 'Archivar semana de ventas'
        : tipo === 'restaurar'
          ? 'Restaurar semana de ventas'
          : 'Eliminar semana de ventas',
      mensaje: descripcion,
      labelConfirmar: tipo === 'archivar'
        ? 'Archivar semana'
        : tipo === 'restaurar' ? 'Restaurar semana' : 'Eliminar definitivamente',
      variante: tipo === 'restaurar' ? 'default' : tipo === 'archivar' ? 'warning' : 'danger',
      onConfirmar: () => ejecutarAccionVentas(tipo, semanaInicio),
    });
  };

  const ejecutarAccionVentas = async (tipo, semanaInicio) => {
    if (procesandoVentas) return;
    setProcesandoVentas(true);
    try {
      if (tipo === 'eliminar') {
        await planillaRepository.eliminarPlanillaVentas({ semanaInicio });
      } else {
        await planillaRepository.archivarPlanillaVentas({
          semanaInicio,
          archivar: tipo === 'archivar',
        });
      }

      if (tipo === 'restaurar') {
        setInicio(inicioSemana(new Date(`${semanaInicio}T00:00:00`)));
        setSeccionActiva('ventas');
        setVistaVentas('trabajo');
        setAviso({
          tipo: 'ok',
          texto: 'Semana restaurada a las planillas activas. Sigue cerrada hasta que la edites.',
        });
      } else {
        const recargada = await cargar(inicio, false);
        setVistaVentas('archivadas');
        setAviso(recargada
          ? {
            tipo: 'ok',
            texto: tipo === 'archivar'
              ? 'Semana archivada. Puedes verla o restaurarla desde “Archivadas”.'
              : 'Semana de ventas eliminada definitivamente.',
          }
          : {
            tipo: 'error',
            texto: 'La acción se completó, pero no se pudo actualizar la lista. Recárgala para ver el estado actual.',
          });
      }
    } catch (error) {
      const detalle = error.message || 'No se pudo completar la acción.';
      const faltaFuncion = detalle.includes('archivar_planilla_ventas')
        || detalle.includes('eliminar_planilla_ventas')
        || error.code === 'PGRST202';
      const noEsSuperadmin = error.code === '42501'
        || detalle.toLowerCase().includes('solo el superadministrador');
      setAviso({
        tipo: 'error',
        texto: faltaFuncion
          ? `Supabase todavía no tiene activa esta función. Ejecuta supabase/PLANILLAS_VENTAS_ARCHIVAR.sql en el SQL Editor. Detalle: ${detalle}`
          : noEsSuperadmin
            ? `La sesión actual no tiene permisos de superadministrador. Detalle: ${detalle}`
            : `No se pudo ${tipo === 'archivar' ? 'archivar' : tipo === 'restaurar' ? 'restaurar' : 'eliminar'} la semana. Detalle: ${detalle}`,
      });
    } finally {
      setProcesandoVentas(false);
      setConfirmacionVentas(null);
    }
  };

  const guardarVentasSemana = async ({ moverABandeja = false, registrarSemana = false } = {}) => {
    const pendientes = [...ventasPendientesRef.current];
    if (!pendientes.length && !moverABandeja && !registrarSemana) return true;

    setGuardando(true);
    const guardados = [];
    const errores = [];
    await Promise.all(pendientes.map(async (clave) => {
      const [fecha, sucursalId] = clave.split('|');
      const valores = ventasRef.current.get(clave);
      if (!valores) return;
      try {
        await planillaRepository.guardarVenta({
          fecha,
          sucursalId,
          unidades: valores.unidades,
          transacciones: valores.transacciones,
          importeBs: valores.importe_bs,
          creadoPor: perfil?.id,
        });
        guardados.push({ clave, valores });
      } catch (error) {
        errores.push(error.message || `No se pudo guardar ${fecha}.`);
      }
    }));

    if (!errores.length && (pendientes.length || moverABandeja || registrarSemana)) {
      try {
        const semanaInicio = aISO(dias[0]);
        await planillaRepository.registrarPlanillaVentasGuardada({
          semanaInicio,
        });
        setPlanillasVentasGuardadas((actuales) => [
          { semana_inicio: semanaInicio, guardada_en: new Date().toISOString() },
          ...actuales.filter((semana) => semana.semana_inicio !== semanaInicio),
        ]);
      } catch (error) {
        errores.push(error.message || 'No se pudo registrar la semana en la bandeja.');
      }
    }

    const pendientesActualizados = new Set(ventasPendientesRef.current);
    guardados.forEach(({ clave, valores }) => {
      if (ventasRef.current.get(clave) === valores) pendientesActualizados.delete(clave);
    });
    ventasPendientesRef.current = pendientesActualizados;
    setVentasPendientes(pendientesActualizados);
    setGuardando(false);

    if (errores.length) {
      setAviso({
        tipo: 'error',
        texto: `No se pudieron guardar ${errores.length} fila(s): ${errores.slice(0, 3).join(' ')}`,
      });
      return false;
    }

    if (moverABandeja) {
      setVentasEditando(false);
      setVistaVentas('bandeja');
      setAviso({ tipo: 'ok', texto: 'Semana guardada en la bandeja. Puedes continuarla cuando quieras.' });
    } else if (pendientes.length || registrarSemana) {
      setAviso({ tipo: 'ok', texto: `Cambios guardados: ${guardados.length} fila(s) de la semana.` });
    }
    return true;
  };

  const guardarVentasYEnviarABandeja = () => guardarVentasSemana({ moverABandeja: true });

  const cambiarVenta = ({ fecha, sucursalId, campo: campoEditado, valor }) => {
    const clave = `${fecha}|${sucursalId}`;
    const copia = new Map(ventasRef.current);
    copia.set(clave, { ...(copia.get(clave) || {}), [campoEditado]: valor });
    ventasRef.current = copia;
    setVentas(copia);
    const pendientes = new Set(ventasPendientesRef.current);
    pendientes.add(clave);
    ventasPendientesRef.current = pendientes;
    setVentasPendientes(pendientes);
  };

  const iniciarVentas = async (evento) => {
    evento.preventDefault();
    if (!fechaInicioVentas || guardando || procesandoVentas || ventasSemanaArchivada) return;
    if (!(await guardarVentasSemana())) return;
    const semanaElegida = inicioSemana(new Date(`${fechaInicioVentas}T00:00:00`));
    const semanaElegidaISO = aISO(semanaElegida);
    if (planillasVentasArchivadas.some((planilla) => planilla.semana_inicio === semanaElegidaISO)) {
      setAviso({
        tipo: 'error',
        texto: 'Esa semana está archivada. Restáurala desde “Archivadas” antes de iniciar o editar.',
      });
      return;
    }
    if (aISO(semanaElegida) === aISO(inicio)) {
      setVentasEditando(ventasCerradas.size === 0);
      setInicioVentasAbierto(false);
      setVistaVentas('trabajo');
      return;
    }
    setSeccionActiva('ventas');
    setCargando(true);
    setInicio(semanaElegida);
    setVentasEditando(true);
    setInicioVentasAbierto(false);
    setVistaVentas('trabajo');
  };

  const navegarSemana = async (actualizarSemana) => {
    if (guardando || procesandoVentas) return;
    const guardado = await guardarVentasSemana();
    if (!guardado) return;
    setInicio(actualizarSemana);
    setVentasEditando(false);
    setVistaVentas('trabajo');
  };

  const editarVentas = async () => {
    if (guardando || procesandoVentas || ventasSemanaArchivada) return;
    const sucursalesCerradas = [...ventasCerradas];
    if (sucursalesCerradas.length) {
      setProcesandoVentas(true);
      try {
        await Promise.all(sucursalesCerradas.map((entidadId) => (
          planillaRepository.reabrirPlantilla({
            tipo: 'ventas',
            entidadId,
            semanaInicio: aISO(dias[0]),
          })
        )));
        const semanaActual = aISO(dias[0]);
        setCierresVentas((actuales) => actuales.filter((cierre) => cierre.semana_inicio !== semanaActual));
        setVentasCerradas(new Set());
        setAviso({ tipo: 'ok', texto: 'Plantilla reabierta. Ya puedes editar las sucursales.' });
      } catch (error) {
        setAviso({
          tipo: 'error',
          texto: `No se pudo reabrir la plantilla: ${error.message}. Verifica que PLANILLAS_CIERRE.sql esté ejecutado en Supabase.`,
        });
        return;
      } finally {
        setProcesandoVentas(false);
      }
    }
    setVentasEditando(true);
  };

  const verSemanaArchivada = async (semanaInicio) => {
    if (!(await guardarVentasSemana())) return;
    setInicio(inicioSemana(new Date(`${semanaInicio}T00:00:00`)));
    setSeccionActiva('ventas');
    setVistaVentas('trabajo');
  };

  const cambiarVistaVentas = async (vista) => {
    if (vista === 'trabajo') {
      setVistaVentas('trabajo');
      return;
    }
    if (!(await guardarVentasSemana())) return;
    setVentasEditando(false);
    setVistaVentas(vista);
  };

  const abrirSemanaBandeja = async (semanaInicio) => {
    if (!(await guardarVentasSemana())) return;
    setInicio(inicioSemana(new Date(`${semanaInicio}T00:00:00`)));
    setVentasEditando(false);
    setVistaVentas('trabajo');
  };

  const cerrarVentas = () => {
    if (sucursales.length === 0 || ventasSemanaArchivada) return;
    setConfirmacionVentas({
      titulo: 'Cerrar plantilla de ventas',
      mensaje: `Se guardarán los cambios y se cerrará la semana ${rango} para todas las sucursales. Para volver a editarla, pulsa “Editar”.`,
      labelConfirmar: 'Guardar y cerrar',
      variante: 'warning',
      onConfirmar: async () => {
        setProcesandoVentas(true);
        try {
          if (!(await guardarVentasSemana({ registrarSemana: true }))) return;
          const resultados = await Promise.allSettled(sucursales.map((sucursal) => (
            planillaRepository.cerrarPlantilla({
              tipo: 'ventas',
              entidadId: sucursal.id,
              semanaInicio: aISO(dias[0]),
            })
          )));
          const sucursalesCerradas = new Set(
            resultados.flatMap((resultado, indice) => (
              resultado.status === 'fulfilled' ? [Number(sucursales[indice].id)] : []
            )),
          );
          setVentasCerradas(sucursalesCerradas);
          const semanaActual = aISO(dias[0]);
          setCierresVentas((actuales) => [
            ...actuales.filter((cierre) => cierre.semana_inicio !== semanaActual),
            ...[...sucursalesCerradas].map((entidadId) => ({
              semana_inicio: semanaActual,
              entidad_id: entidadId,
            })),
          ]);
          const erroresCierre = resultados.filter((resultado) => resultado.status === 'rejected');
          if (erroresCierre.length) {
            if (sucursalesCerradas.size) setVentasEditando(false);
            setConfirmacionVentas(null);
            setAviso({
              tipo: 'error',
              texto: `No se pudieron cerrar ${erroresCierre.length} sucursal(es): ${erroresCierre[0].reason?.message || 'error desconocido'}. Pulsa “Editar” para reabrir las sucursales que sí se cerraron.`,
            });
            return;
          }
          setVentasEditando(false);
          setVistaVentas('bandeja');
          setAviso({ tipo: 'ok', texto: 'Semana cerrada y enviada a la bandeja.' });
          setConfirmacionVentas(null);
        } catch (error) {
          setAviso({
            tipo: 'error',
            texto: `No se pudo cerrar la plantilla: ${error.message}. Verifica que PLANILLAS_CIERRE.sql esté ejecutado en Supabase.`,
          });
        } finally {
          setProcesandoVentas(false);
        }
      },
    });
  };

  const editarInventario = (proveedor, fecha) => {
    navigate('/planilla/captura', {
      state: {
        tipo: 'inventario',
        fecha,
        entidadId: String(proveedor.id),
        entidadNombre: proveedor.nombre,
      },
    });
  };

  const traerSaldoAyer = useCallback(async ({ fechaActual, fechaAyer }) => {
    try {
      setGuardando(true);
      const filas = await planillaRepository.listarInventario({ desde: fechaAyer, hasta: fechaAyer });
      const porProveedor = new Map(filas.map((fila) => [fila.proveedor_id, fila]));
      const activos = proveedores.filter((item) => item.activo !== false);
      const guardados = await Promise.all(activos.map(async (proveedor) => {
        const previo = porProveedor.get(proveedor.id);
        const saldoHoy = previo
          ? Number(previo.kilos_ayer) + Number(previo.kilos_entrante) - Number(previo.kilos_saliente)
          : 0;
        const anterior = inventario.get(`${fechaActual}|${proveedor.id}`) || {};
        const registro = { ...anterior, kilos_ayer: saldoHoy };
        await planillaRepository.guardarInventario({
          fecha: fechaActual,
          proveedorId: proveedor.id,
          kilosAyer: registro.kilos_ayer,
          kilosEntrante: registro.kilos_entrante,
          kilosSaliente: registro.kilos_saliente,
          creadoPor: perfil?.id,
        });
        return [proveedor.id, registro];
      }));
      const copia = new Map(inventario);
      for (const [proveedorId, registro] of guardados) copia.set(`${fechaActual}|${proveedorId}`, registro);
      setInventario(copia);
      setAviso({ tipo: 'ok', texto: 'Saldo de ayer aplicado como S. AYER.' });
    } catch (err) {
      setAviso({ tipo: 'error', texto: 'No se pudo traer el saldo de ayer: ' + (err.message || '') });
    } finally {
      setGuardando(false);
    }
  }, [inventario, perfil, proveedores]);

  const registrarAjusteInventario = async (evento) => {
    evento.preventDefault();
    setErrorAjusteInventario('');
    const fecha = aISO(dias[diaIdx]);
    const kilosFisicos = formAjusteInventario.kilos === ''
      ? null
      : Number(formAjusteInventario.kilos);
    const unidadesFisicas = formAjusteInventario.unidades === ''
      ? null
      : Number(formAjusteInventario.unidades);
    const ajusteKilos = kilosFisicos === null ? 0 : kilosFisicos - kilosStockActual;
    const ajusteUnidades = unidadesFisicas === null ? 0 : unidadesFisicas - unidadesStockActual;
    if (
      (kilosFisicos !== null && (!Number.isFinite(kilosFisicos) || kilosFisicos < 0))
      || (unidadesFisicas !== null && (!Number.isInteger(unidadesFisicas) || unidadesFisicas < 0))
    ) {
      setAviso({ tipo: 'error', texto: 'El conteo físico debe ser un valor válido, igual o mayor a cero.' });
      return;
    }
    if (ajusteKilos === 0 && ajusteUnidades === 0) {
      setAviso({ tipo: 'error', texto: 'El conteo coincide con el saldo actual; no hace falta registrar un ajuste.' });
      return;
    }
    if (formAjusteInventario.motivo.trim().length < 5) {
      setAviso({ tipo: 'error', texto: 'Explica el motivo del ajuste (mínimo 5 caracteres).' });
      return;
    }

    try {
      setGuardandoAjusteInventario(true);
      await planillaRepository.registrarAjusteInventarioPlanta({
        fecha,
        ajusteKilos,
        ajusteUnidades,
        motivo: formAjusteInventario.motivo,
      });
      setFormAjusteInventario({ kilos: '', unidades: '', motivo: '' });
      setAjusteInventarioAbierto(false);
      const recargada = await cargar(inicio, false);
      if (recargada)       setAviso({ tipo: 'ok', texto: 'Conteo físico guardado y saldo de planta corregido.' });
    } catch (err) {
      const detalle = err.message || 'No se pudo registrar el ajuste de inventario.';
      setErrorAjusteInventario(
        detalle.includes('registrar_ajuste_inventario_planta')
          ? `${detalle}. Ejecuta supabase/PLANILLAS_AUTOMATICAS_MANUALES.sql en Supabase.`
          : detalle,
      );
    } finally {
      setGuardandoAjusteInventario(false);
    }
  };

  const filasVentasExport = () => sucursales.map((sucursal) => {
    const fila = { Sucursal: sucursal.nombre, Sector: sucursal.sector };
    let total = 0;
    dias.forEach((dia, i) => {
      const fecha = aISO(dia);
      const key = `${fecha}|${sucursal.id}`;
      const valor = campo === 'unidades_entregadas'
        ? Number(entregas.get(key) || 0)
        : Number(ventas.get(key)?.[campo] || 0);
      fila[`Día ${i + 1}`] = (campo === 'unidades_entregadas' ? entregas.has(key) : ventas.has(key)) ? valor : '';
      total += valor;
    });
    fila.Total = total;
    return fila;
  });

  const exportarVentasExcel = () => exportarAExcel(filasVentasExport(), `Ventas_${aISO(dias[0])}`);
  const exportarVentasPDF = () => {
    const columnas = ['Sucursal', ...dias.map((d, i) => `Día ${i + 1}`), 'Total'];
    const filas = sucursales.map((sucursal) => {
      let total = 0;
      const celdas = dias.map((dia) => {
        const key = `${aISO(dia)}|${sucursal.id}`;
        const valor = campo === 'unidades_entregadas'
          ? Number(entregas.get(key) || 0)
          : Number(ventas.get(key)?.[campo] || 0);
        total += valor;
        return (campo === 'unidades_entregadas' ? entregas.has(key) : ventas.has(key))
          ? campo === 'importe_bs' ? formatoBs(valor) : String(valor)
          : '';
      });
      return [sucursal.nombre, ...celdas, campo === 'importe_bs' ? formatoBs(total) : String(total)];
    });
    exportarAPDF(columnas, filas, `Ventas ${rango}`, `Ventas_${aISO(dias[0])}`);
  };

  const proveedoresConInventario = proveedores.filter((proveedor) => (
    inventario.has(`${aISO(dias[diaIdx])}|${proveedor.id}`)
  ));
  const proveedoresVisiblesInventario = filtroProveedorInventario === 'todos'
    ? proveedoresConInventario
    : proveedoresConInventario.filter((proveedor) => String(proveedor.id) === filtroProveedorInventario);
  const filasInventario = (iso) => {
    const stockAuto = inventarioPlanta.find((fila) => fila.fecha === iso);
    const filaAutomatica = stockAuto ? [{
      Proveedor: 'Stock total de planta (automático)',
      'S. AYER': Number(stockAuto.kilos_iniciales) || 0,
      ENTRANTE: Number(stockAuto.kilos_recibidos) || 0,
      SALIENTE: Number(stockAuto.kilos_despachados) || 0,
      AJUSTES: Number(stockAuto.kilos_ajustados) || 0,
      'S. HOY': Number(stockAuto.kilos_saldo) || 0,
      'UNIDADES AJUSTADAS': Number(stockAuto.unidades_ajustadas) || 0,
      'UNIDADES HOY': Number(stockAuto.unidades_saldo) || 0,
    }] : [];
    const filasManuales = proveedoresVisiblesInventario
      .filter((proveedor) => inventario.has(`${iso}|${proveedor.id}`))
      .map((proveedor) => {
    const r = inventario.get(`${iso}|${proveedor.id}`) || {};
    const ayer = Number(r.kilos_ayer || 0);
    const entrante = Number(r.kilos_entrante || 0);
    const saliente = Number(r.kilos_saliente || 0);
        return {
          Proveedor: `${proveedor.nombre} (manual)`,
          'S. AYER': ayer,
          ENTRANTE: entrante,
          SALIENTE: saliente,
          AJUSTES: 0,
          'S. HOY': ayer + entrante - saliente,
          'UNIDADES AJUSTADAS': '',
          'UNIDADES HOY': '',
        };
      });
    return [...filaAutomatica, ...filasManuales];
  };
  const exportarInventarioExcel = () => exportarAExcel(filasInventario(aISO(dias[diaIdx])), `Inventario_${aISO(dias[diaIdx])}`);
  const exportarInventarioPDF = () => {
    const iso = aISO(dias[diaIdx]);
    const filas = filasInventario(iso).map((fila) => [
      fila.Proveedor,
      fila['S. AYER'],
      fila.ENTRANTE,
      fila.SALIENTE,
      fila.AJUSTES,
      fila['S. HOY'],
      fila['UNIDADES AJUSTADAS'],
      fila['UNIDADES HOY'],
    ]);
    exportarAPDF(
      ['Origen', 'S. AYER (kg)', 'ENTRANTE (kg)', 'SALIENTE (kg)', 'AJUSTES (kg)', 'S. HOY (kg)', 'AJUSTE (unid.)', 'S. HOY (unid.)'],
      filas,
      `Inventario ${iso}`,
      `Inventario_${iso}`,
    );
  };

  const idsComprasArchivadas = new Set(
    planillasComprasArchivadas.map((planilla) => String(planilla.proveedor_id)),
  );
  const comprasActivas = compras.filter(
    (compra) => !idsComprasArchivadas.has(String(compra.proveedor_id)),
  );
  const comprasArchivadas = compras.filter(
    (compra) => idsComprasArchivadas.has(String(compra.proveedor_id)),
  );
  const proveedoresConCompras = proveedores.filter((proveedor) => (
    comprasActivas.some((compra) => String(compra.proveedor_id) === String(proveedor.id))
  ));
  const proveedoresVisiblesCompras = filtroProveedorCompras === 'todos'
    ? proveedoresConCompras
    : proveedoresConCompras.filter((proveedor) => String(proveedor.id) === filtroProveedorCompras);
  const proveedoresArchivados = planillasComprasArchivadas
    .map((planilla) => ({
      ...planilla,
      nombre: proveedores.find(
        (proveedor) => String(proveedor.id) === String(planilla.proveedor_id),
      )?.nombre || `Proveedor ${planilla.proveedor_id}`,
    }))
    .filter((planilla) => filtroProveedorCompras === 'todos'
      || String(planilla.proveedor_id) === filtroProveedorCompras);
  const comprasVisibles = (verComprasArchivadas ? comprasArchivadas : comprasActivas)
    .filter((compra) => filtroProveedorCompras === 'todos'
      || String(compra.proveedor_id) === filtroProveedorCompras);
  const reporteCompras = () => construirReporteCompras(comprasVisibles, proveedoresVisiblesCompras, dias);
  const definicionesCompras = [
    { campo: 'kilos', etiqueta: 'Kg.' },
    { campo: 'precio', etiqueta: 'Precio (Bs/kg)' },
    { campo: 'unidades', etiqueta: 'Ud.' },
    { campo: 'total', etiqueta: 'Total (Bs)' },
    { campo: 'promedio', etiqueta: 'Prom. (kg/ud.)' },
  ];
  const filasComprasExport = () => {
    const reporte = construirReporteCompras(comprasVisibles, proveedoresVisiblesCompras, dias);
    return reporte.filas.flatMap((proveedor) =>
      definicionesCompras.map((definicion) => ({
        Proveedor: proveedor.nombre,
        Métrica: definicion.etiqueta,
        ...Object.fromEntries(proveedor.dias.map((dia) => [
          dia.fecha,
          dia.recibos.length ? dia[definicion.campo] : '',
        ])),
        'Total semana': proveedor.total[definicion.campo],
      })),
    );
  };
  const exportarComprasExcel = () => exportarAExcel(
    filasComprasExport(),
    `Compras_${aISO(dias[0])}`
  );
  const exportarComprasPDF = () => exportarAPDF(
    ['Proveedor', 'Métrica', ...dias.map((dia) => aISO(dia)), 'Total semana'],
    filasComprasExport().map((fila) => [
      fila.Proveedor,
      fila.Métrica,
      ...dias.map((dia) => fila[aISO(dia)]),
      fila['Total semana'],
    ]),
    `Compras ${rango}`,
    `Compras_${aISO(dias[0])}`
  );

  return (
    <main className={`min-h-screen px-4 py-6 md:px-8 md:py-10 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <div className="mx-auto max-w-7xl">
        <header className={`mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 shadow ${card}`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/panel')}
              className={`rounded-xl border p-2 ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-300 text-gray-600'}`}
              aria-label="Volver"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className={`text-xl font-black md:text-2xl ${strong}`}>Planillas semanales</h1>
              <p className={`mt-0.5 text-xs ${muted}`}>Semana: {rango}</p>
              <p className={`mt-0.5 text-[10px] ${muted}`}>Compras, entregas e inventario automático se actualizan cada 30 segundos.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={guardando || procesandoVentas} onClick={() => navegarSemana((d) => sumarDias(d, -7))} className={`rounded-xl border p-2 disabled:opacity-50 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`} aria-label="Semana anterior">
              <ChevronLeft size={18} />
            </button>
            <button type="button" disabled={guardando || procesandoVentas} onClick={() => navegarSemana(inicioSemana(new Date()))} className={`rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}>
              Esta semana
            </button>
            <button type="button" disabled={guardando || procesandoVentas} onClick={() => navegarSemana((d) => sumarDias(d, 7))} className={`rounded-xl border p-2 disabled:opacity-50 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`} aria-label="Semana siguiente">
              <ChevronRight size={18} />
            </button>
            <button type="button" disabled={guardando || procesandoVentas} onClick={() => cargar(inicio)} className={`rounded-xl border p-2 disabled:opacity-50 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`} aria-label="Recargar">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {aviso && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            aviso.tipo === 'error'
              ? 'border-red-500/40 bg-red-500/10 text-red-400'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
          }`}>
            {aviso.texto}
          </div>
        )}

        {cargando ? (
          <div className={`flex items-center justify-center gap-2 rounded-2xl border py-16 ${card} ${muted}`}>
            <Loader2 className="animate-spin" size={20} /> Cargando planilla...
          </div>
        ) : (
          <div className="space-y-4">
            <nav
              aria-label="Secciones de planillas"
              className={`flex flex-wrap gap-2 rounded-2xl border p-2 ${card}`}
            >
              {[
                ['compras', '1. Registro de Compras por Proveedor'],
                ['ventas', '2. Control de Ventas por Sucursal'],
                ['inventario', '3. Control de Stock / Inventario Diario'],
              ].map(([seccion, titulo]) => (
                <button
                  key={seccion}
                  type="button"
                  onClick={() => setSeccionActiva(seccion)}
                  aria-current={seccionActiva === seccion ? 'page' : undefined}
                  className={`rounded-xl px-4 py-2.5 text-xs font-bold transition md:text-sm ${
                    seccionActiva === seccion
                      ? 'bg-cyan-600 text-white'
                      : darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {titulo}
                </button>
              ))}
            </nav>

            {seccionActiva === 'compras' && (
              <SeccionCompras
                reporte={reporteCompras()}
                compras={comprasVisibles}
                proveedores={verComprasArchivadas
                  ? proveedoresArchivados.map((planilla) => ({
                    id: planilla.proveedor_id,
                    nombre: planilla.nombre,
                  }))
                  : proveedoresConCompras}
                proveedoresArchivados={proveedoresArchivados}
                mostrarArchivadas={verComprasArchivadas}
                onMostrarArchivadas={cambiarVistaCompras}
                filtroProveedor={filtroProveedorCompras}
                onFiltroProveedor={setFiltroProveedorCompras}
                oscuro={darkMode}
                rango={rango}
                semanaInicio={aISO(dias[0])}
                onIniciar={() => abrirInicioCaptura('compras')}
                onEditarPlanilla={editarPlanillaCompras}
                onArchivar={(planilla) => solicitarAccionCompra('archivar', planilla)}
                onRestaurar={(planilla) => solicitarAccionCompra('restaurar', planilla)}
                onEliminar={(planilla) => solicitarAccionCompra('eliminar', planilla)}
                procesando={procesandoCompras}
                acciones={<BotonesExportar oscuro={darkMode} onExcel={exportarComprasExcel} onPDF={exportarComprasPDF} />}
              />
            )}
            {seccionActiva === 'ventas' && (
              <SeccionVentas
                sucursales={sucursales}
                dias={dias}
                ventas={ventas}
                entregas={entregas}
                campo={campo}
                setCampo={setCampo}
                oscuro={darkMode}
                cerrada={ventasCerradas.size > 0}
                archivada={ventasSemanaArchivada}
                vistaVentas={vistaVentas}
                semanasBandeja={semanasBandeja}
                planillasArchivadas={planillasVentasArchivadas}
                editando={ventasEditando}
                procesando={procesandoVentas}
                guardando={guardando}
                cantidadPendiente={ventasPendientes.size}
                onGuardarSemana={guardarVentasYEnviarABandeja}
                onIniciar={() => {
                  setFechaInicioVentas(aISO(dias[0]));
                  setInicioVentasAbierto(true);
                }}
                onEditar={editarVentas}
                onCerrar={cerrarVentas}
                onArchivar={(semanaInicio) => solicitarAccionVentas('archivar', semanaInicio)}
                onRestaurar={(semanaInicio) => solicitarAccionVentas('restaurar', semanaInicio)}
                onEliminar={(semanaInicio = aISO(dias[0])) => solicitarAccionVentas('eliminar', semanaInicio)}
                onCambiarVista={cambiarVistaVentas}
                onAbrirSemana={abrirSemanaBandeja}
                onVerArchivada={verSemanaArchivada}
                onVolverArchivadas={() => setVistaVentas('archivadas')}
                onCambiar={cambiarVenta}
                acciones={<BotonesExportar oscuro={darkMode} onExcel={exportarVentasExcel} onPDF={exportarVentasPDF} />}
              />
            )}
            {seccionActiva === 'inventario' && (
              <SeccionInventario
                proveedores={proveedores}
                dias={dias}
                diaIdx={diaIdx}
                setDiaIdx={setDiaIdx}
                inventario={inventario}
                inventarioPlanta={inventarioPlanta}
                ajustesInventario={ajustesInventario}
                filtroProveedor={filtroProveedorInventario}
                onFiltroProveedor={setFiltroProveedorInventario}
                onTraerAyer={traerSaldoAyer}
                oscuro={darkMode}
                onIniciar={() => abrirInicioCaptura('inventario')}
                onEditar={editarInventario}
                onExportarExcel={exportarInventarioExcel}
                onExportarPDF={exportarInventarioPDF}
                onAbrirAjuste={() => {
                  setErrorAjusteInventario('');
                  setFormAjusteInventario({ kilos: '', unidades: '', motivo: '' });
                  setAjusteInventarioAbierto(true);
                }}
              />
            )}
          </div>
        )}

        {guardando && (
          <div className="pointer-events-none fixed bottom-4 right-4 flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white shadow-lg">
            <Loader2 className="animate-spin" size={14} /> Guardando...
          </div>
        )}

        {inicioVentasAbierto && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-inicio-ventas"
              className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${card}`}
            >
              <header className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-500">Todas las sucursales</p>
                  <h2 id="titulo-inicio-ventas" className={`mt-1 text-lg font-black ${strong}`}>
                    Iniciar plantilla semanal de ventas
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setInicioVentasAbierto(false)}
                  className={`rounded-lg border p-2 ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-300 text-gray-600'}`}
                  aria-label="Cerrar formulario de inicio"
                >
                  <X size={18} />
                </button>
              </header>
              <form onSubmit={iniciarVentas} className="space-y-4">
                <label className={`block text-sm font-semibold ${labelCaptura}`}>
                  Elige una fecha de la semana
                  <input
                    type="date"
                    required
                    value={fechaInicioVentas}
                    onChange={(evento) => setFechaInicioVentas(evento.target.value)}
                    className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500 ${inputCaptura}`}
                  />
                </label>
                <p className={`text-xs ${muted}`}>
                  Se abrirá la semana de esa fecha con todas las sucursales juntas. Los datos ya guardados se conservarán.
                </p>
                <footer className="flex justify-end gap-2 border-t border-slate-700/40 pt-4">
                  <button
                    type="button"
                    onClick={() => setInicioVentasAbierto(false)}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!fechaInicioVentas || guardando || procesandoVentas}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Iniciar plantilla
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}

        {inicioCaptura && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/60 p-4">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-inicio-plantilla"
              className={`my-auto w-full max-w-2xl rounded-2xl border p-5 shadow-2xl ${card}`}
            >
              <header className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-500">Captura diaria · sin hora</p>
                  <h2 id="titulo-inicio-plantilla" className={`mt-1 text-lg font-black ${strong}`}>
                    Iniciar {inicioCaptura.tipo === 'compras'
                      ? 'Registro de Compras por Proveedor'
                      : inicioCaptura.tipo === 'ventas'
                        ? 'Control de Ventas por Sucursal'
                        : 'Control de Stock / Inventario Diario'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setInicioCaptura(null)}
                  className={`rounded-lg border p-2 ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-300 text-gray-600'}`}
                  aria-label="Cerrar formulario de inicio"
                >
                  <X size={18} />
                </button>
              </header>

              <form onSubmit={iniciarPlantilla} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={`block text-sm font-semibold ${labelCaptura}`}>
                    Fecha
                    <input
                      type="date"
                      required
                      value={inicioCaptura.fecha}
                      onChange={(evento) => setInicioCaptura((actual) => ({ ...actual, fecha: evento.target.value }))}
                      className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500 ${inputCaptura}`}
                    />
                  </label>
                  <label className={`block text-sm font-semibold ${labelCaptura}`}>
                    {inicioCaptura.tipo === 'ventas' ? 'Sucursal' : 'Proveedor'}
                    <select
                      required
                      value={inicioCaptura.entidadId}
                      onChange={(evento) => setInicioCaptura((actual) => ({ ...actual, entidadId: evento.target.value }))}
                      className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500 ${inputCaptura}`}
                    >
                      <option value="">Selecciona una opción</option>
                      {(inicioCaptura.tipo === 'ventas' ? sucursales : proveedores).map((entidad) => (
                        <option key={entidad.id} value={entidad.id}>
                          {entidad.nombre}{entidad.activo === false ? ' (inactivo)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className={`text-xs ${muted}`}>
                  Se abrirá la semana de la fecha elegida. Si ya hay datos para esa sucursal o proveedor, se cargarán para continuar editándolos.
                </p>

                <footer className="flex justify-end gap-2 border-t border-slate-700/40 pt-4">
                  <button
                    type="button"
                    onClick={() => setInicioCaptura(null)}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!inicioCaptura.entidadId}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Iniciar plantilla
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}

        {ajusteInventarioAbierto && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/60 p-4">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-ajuste-inventario"
              className={`my-auto w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${card}`}
            >
              <header className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-500">
                    {aISO(dias[diaIdx])}
                  </p>
                  <h2 id="titulo-ajuste-inventario" className={`mt-1 text-lg font-black ${strong}`}>
                    Corregir con conteo físico
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setAjusteInventarioAbierto(false)}
                  disabled={guardandoAjusteInventario}
                  className={`rounded-lg border p-2 disabled:opacity-50 ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-300 text-gray-600'}`}
                  aria-label="Cerrar ajuste"
                >
                  <X size={18} />
                </button>
              </header>
              <form onSubmit={registrarAjusteInventario} className="space-y-4">
                <p className={`text-xs ${muted}`}>
                  No calcules diferencias ni uses signos. Escribe lo que contaste físicamente y el sistema calcula la corrección. Si dejas un campo vacío, ese saldo no cambia.
                </p>
                <div className={`rounded-lg border px-3 py-2 text-sm ${darkMode ? 'border-slate-700 bg-slate-950/60' : 'border-gray-200 bg-gray-50'}`}>
                  <p className={muted}>Saldo calculado para este día</p>
                  <p className={`mt-1 font-bold ${strong}`}>
                    {formatoNumero(kilosStockActual)} kg · {formatoNumero(unidadesStockActual, 0)} unidades
                  </p>
                </div>
                {errorAjusteInventario && (
                  <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                    {errorAjusteInventario}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={`block text-sm font-semibold ${labelCaptura}`}>
                    ¿Cuántos kilos contaste?
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formAjusteInventario.kilos}
                      onChange={(evento) => setFormAjusteInventario((actual) => ({ ...actual, kilos: evento.target.value }))}
                      className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500 ${inputCaptura}`}
                      placeholder={`Vacío = ${formatoNumero(kilosStockActual)} kg`}
                    />
                    {formAjusteInventario.kilos !== '' && (
                      <span className={`mt-1 block text-xs font-medium ${muted}`}>
                        Corrección: {diferenciaKilosFisico > 0 ? '+' : ''}{formatoNumero(diferenciaKilosFisico)} kg
                      </span>
                    )}
                  </label>
                  <label className={`block text-sm font-semibold ${labelCaptura}`}>
                    ¿Cuántas unidades contaste?
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={formAjusteInventario.unidades}
                      onChange={(evento) => setFormAjusteInventario((actual) => ({ ...actual, unidades: evento.target.value }))}
                      className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500 ${inputCaptura}`}
                      placeholder={`Vacío = ${formatoNumero(unidadesStockActual, 0)} unidades`}
                    />
                    {formAjusteInventario.unidades !== '' && (
                      <span className={`mt-1 block text-xs font-medium ${muted}`}>
                        Corrección: {diferenciaUnidadesFisico > 0 ? '+' : ''}{formatoNumero(diferenciaUnidadesFisico, 0)} unidades
                      </span>
                    )}
                  </label>
                </div>
                <label className={`block text-sm font-semibold ${labelCaptura}`}>
                  ¿Por qué corriges el saldo?
                  <textarea
                    required
                    minLength={5}
                    maxLength={500}
                    rows={3}
                    value={formAjusteInventario.motivo}
                    onChange={(evento) => setFormAjusteInventario((actual) => ({ ...actual, motivo: evento.target.value }))}
                    className={`mt-1.5 w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:border-amber-500 ${inputCaptura}`}
                    placeholder="Describe qué se contó y por qué se ajusta."
                  />
                </label>
                <footer className="flex justify-end gap-2 border-t border-slate-700/40 pt-4">
                  <button
                    type="button"
                    onClick={() => setAjusteInventarioAbierto(false)}
                    disabled={guardandoAjusteInventario}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardandoAjusteInventario}
                    className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-300 disabled:opacity-60"
                  >
                    {guardandoAjusteInventario ? 'Guardando...' : 'Guardar conteo y corregir saldo'}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}

      </div>
      <ModalConfirmar
        config={confirmacionCompras?.config}
        onCerrar={() => {
          if (!procesandoCompras) setConfirmacionCompras(null);
        }}
        cargando={procesandoCompras}
      />
      <ModalConfirmar
        config={confirmacionVentas}
        onCerrar={() => {
          if (!procesandoVentas) setConfirmacionVentas(null);
        }}
        cargando={procesandoVentas}
      />
    </main>
  );
}
