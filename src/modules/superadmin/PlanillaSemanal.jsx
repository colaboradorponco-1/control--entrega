import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [ventas, setVentas] = useState(() => new Map());
  const [inventario, setInventario] = useState(() => new Map());
  const [campo, setCampo] = useState('importe_bs');
  const [seccionActiva, setSeccionActiva] = useState('compras');
  const [filtroProveedorCompras, setFiltroProveedorCompras] = useState('todos');
  const [filtroSucursal, setFiltroSucursal] = useState('todas');
  const [filtroProveedorInventario, setFiltroProveedorInventario] = useState('todos');
  const [verComprasArchivadas, setVerComprasArchivadas] = useState(
    () => Boolean(location.state?.verComprasArchivadas),
  );
  const [diaIdx, setDiaIdx] = useState(() => {
    if (!fechaInicial) return 0;
    const semana = inicioSemana(new Date(`${fechaInicial}T00:00:00`));
    return diasDeSemana(semana).findIndex((dia) => aISO(dia) === fechaInicial);
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [inicioCaptura, setInicioCaptura] = useState(null);
  const [confirmacionCompras, setConfirmacionCompras] = useState(null);
  const [procesandoCompras, setProcesandoCompras] = useState(false);

  const dias = useMemo(() => diasDeSemana(inicio), [inicio]);
  const rango = useMemo(() => rangoSemana(inicio), [inicio]);

  const card = darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-white';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const labelCaptura = darkMode ? 'text-slate-300' : 'text-gray-700';
  const inputCaptura = darkMode
    ? 'border-slate-700 bg-slate-950 text-white placeholder-slate-500'
    : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400';

  const cargar = useCallback(async (semana = inicio, limpiarAviso = true) => {
    setCargando(true);
    if (limpiarAviso) setAviso(null);
    const desde = aISO(diasDeSemana(semana)[0]);
    const hasta = aISO(diasDeSemana(semana)[6]);
    try {
      const [
        listaSucursales,
        listaProveedores,
        filasVentas,
        filasInventario,
        filasCompras,
        comprasArchivadas,
      ] = await Promise.all([
        planillaRepository.listarSucursales(),
        planillaRepository.listarProveedores(),
        planillaRepository.listarVentas({ desde, hasta }),
        planillaRepository.listarInventario({ desde, hasta }),
        planillaRepository.comprasSemana({ desde, hasta }),
        planillaRepository.listarPlanillasComprasArchivadas({ semanaInicio: desde }),
      ]);

      const mapaVentas = new Map();
      for (const fila of filasVentas) {
        mapaVentas.set(`${fila.fecha}|${fila.sucursal_id}`, {
          unidades: fila.unidades,
          transacciones: fila.transacciones,
          importe_bs: fila.importe_bs,
        });
      }
      const mapaInventario = new Map();
      for (const fila of filasInventario) {
        mapaInventario.set(`${fila.fecha}|${fila.proveedor_id}`, {
          kilos_ayer: fila.kilos_ayer,
          kilos_entrante: fila.kilos_entrante,
          kilos_saliente: fila.kilos_saliente,
        });
      }

      setVentas(mapaVentas);
      setInventario(mapaInventario);
      setSucursales(listaSucursales);
      setProveedores(listaProveedores);

      setCompras(filasCompras);
      setPlanillasComprasArchivadas(comprasArchivadas);
      return true;
    } catch (err) {
      const detalle = err.message || 'revisa tu conexión';
      const faltaArchivado = detalle.includes('planillas_compras_archivadas');
      setAviso({
        tipo: 'error',
        texto: faltaArchivado
          ? `No se pudo cargar la planilla: ${detalle}. Ejecuta supabase/PLANILLAS_COMPRAS_ARCHIVAR.sql en Supabase para habilitar el archivado.`
          : 'No se pudo cargar la planilla: ' + detalle,
      });
      return false;
    } finally {
      setCargando(false);
    }
  }, [inicio]);

  useEffect(() => {
    cargar(inicio, false);
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

  const editarVenta = (sucursal) => {
    navigate('/planilla/captura', {
      state: {
        tipo: 'ventas',
        fecha: aISO(dias[0]),
        entidadId: String(sucursal.id),
        entidadNombre: sucursal.nombre,
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

  const sucursalesConVentas = sucursales.filter((sucursal) => (
    dias.some((dia) => ventas.has(`${aISO(dia)}|${sucursal.id}`))
  ));
  const sucursalesVisibles = filtroSucursal === 'todas'
    ? sucursalesConVentas
    : sucursalesConVentas.filter((sucursal) => String(sucursal.id) === filtroSucursal);
  const filasVentasExport = () => sucursalesVisibles.map((sucursal) => {
    const fila = { Sucursal: sucursal.nombre, Sector: sucursal.sector };
    let total = 0;
    dias.forEach((dia, i) => {
      const fecha = aISO(dia);
      const key = `${fecha}|${sucursal.id}`;
      const valor = Number(ventas.get(key)?.[campo] || 0);
      fila[`Día ${i + 1}`] = ventas.has(key) ? valor : '';
      total += valor;
    });
    fila.Total = total;
    return fila;
  });

  const exportarVentasExcel = () => exportarAExcel(filasVentasExport(), `Ventas_${aISO(dias[0])}`);
  const exportarVentasPDF = () => {
    const columnas = ['Sucursal', ...dias.map((d, i) => `Día ${i + 1}`), 'Total'];
    const filas = sucursalesVisibles.map((sucursal) => {
      let total = 0;
      const celdas = dias.map((dia) => {
        const key = `${aISO(dia)}|${sucursal.id}`;
        const valor = Number(ventas.get(key)?.[campo] || 0);
        total += valor;
        return ventas.has(key)
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
  const filasInventario = (iso) => proveedoresVisiblesInventario
    .filter((proveedor) => inventario.has(`${iso}|${proveedor.id}`))
    .map((proveedor) => {
    const r = inventario.get(`${iso}|${proveedor.id}`) || {};
    const ayer = Number(r.kilos_ayer || 0);
    const entrante = Number(r.kilos_entrante || 0);
    const saliente = Number(r.kilos_saliente || 0);
    return { Proveedor: proveedor.nombre, 'S. AYER': ayer, ENTRANTE: entrante, SALIENTE: saliente, 'S. HOY': ayer + entrante - saliente };
  });
  const exportarInventarioExcel = () => exportarAExcel(filasInventario(aISO(dias[diaIdx])), `Inventario_${aISO(dias[diaIdx])}`);
  const exportarInventarioPDF = () => {
    const iso = aISO(dias[diaIdx]);
    const filas = filasInventario(iso).map((fila) => [fila.Proveedor, fila['S. AYER'], fila.ENTRANTE, fila.SALIENTE, fila['S. HOY']]);
    exportarAPDF(['Proveedor', 'S. AYER', 'ENTRANTE', 'SALIENTE', 'S. HOY'], filas, `Inventario ${iso}`, `Inventario_${iso}`);
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
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setInicio((d) => sumarDias(d, -7))} className={`rounded-xl border p-2 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`} aria-label="Semana anterior">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => setInicio(inicioSemana(new Date()))} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}>
              Esta semana
            </button>
            <button type="button" onClick={() => setInicio((d) => sumarDias(d, 7))} className={`rounded-xl border p-2 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`} aria-label="Semana siguiente">
              <ChevronRight size={18} />
            </button>
            <button type="button" onClick={() => cargar(inicio)} className={`rounded-xl border p-2 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`} aria-label="Recargar">
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
                campo={campo}
                setCampo={setCampo}
                filtroSucursal={filtroSucursal}
                onFiltroSucursal={setFiltroSucursal}
                oscuro={darkMode}
                onIniciar={() => abrirInicioCaptura('ventas')}
                onEditar={editarVenta}
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
                filtroProveedor={filtroProveedorInventario}
                onFiltroProveedor={setFiltroProveedorInventario}
                onTraerAyer={traerSaldoAyer}
                oscuro={darkMode}
                onIniciar={() => abrirInicioCaptura('inventario')}
                onEditar={editarInventario}
                acciones={<BotonesExportar oscuro={darkMode} onExcel={exportarInventarioExcel} onPDF={exportarInventarioPDF} />}
              />
            )}
          </div>
        )}

        {guardando && (
          <div className="pointer-events-none fixed bottom-4 right-4 flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white shadow-lg">
            <Loader2 className="animate-spin" size={14} /> Guardando...
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

      </div>
      <ModalConfirmar
        config={confirmacionCompras?.config}
        onCerrar={() => {
          if (!procesandoCompras) setConfirmacionCompras(null);
        }}
        cargando={procesandoCompras}
      />
    </main>
  );
}
