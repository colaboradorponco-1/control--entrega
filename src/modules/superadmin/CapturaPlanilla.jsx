import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, LockKeyhole, Save, UnlockKeyhole } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { planillaRepository } from '../../repositories/planillaRepository';
import ModalConfirmar from '../../components/ModalConfirmar';
import { exportarAExcel } from '../../utils/exportUtils';
import { aISO, diasDeSemana, inicioSemana } from './planillaUtils';

const TITULOS = {
  compras: 'Registro de Compras por Proveedor',
  ventas: 'Control de Ventas por Sucursal',
  inventario: 'Control de Stock / Inventario Diario',
};

const CAMPOS_VENTA = [
  { campo: 'unidades', titulo: 'Unidades', decimales: 0 },
  { campo: 'transacciones', titulo: 'Transacciones', decimales: 0 },
  { campo: 'importeBs', titulo: 'Total (Bs)', decimales: 2 },
];

const CAMPOS_INVENTARIO = [
  { campo: 'kilosAyer', titulo: 'S. AYER' },
  { campo: 'kilosEntrante', titulo: 'ENTRANTE' },
  { campo: 'kilosSaliente', titulo: 'SALIENTE' },
];

const valor = (dato) => dato == null ? '' : String(dato);

function filaVacia(tipo) {
  if (tipo === 'inventario') {
    return { kilosAyer: '', kilosEntrante: '', kilosSaliente: '' };
  }
  if (tipo === 'ventas') {
    return { unidades: '', transacciones: '', importeBs: '' };
  }
  return { numeroRecibo: '', kilos: '', unidades: '', precioPorKilo: '', id: null };
}

function formatoFecha(fecha) {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}-${mes}-${anio.slice(-2)}`;
}

function formatoFechaCompleta(fecha) {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}-${mes}-${anio}`;
}

function formatoNumero(numero, decimales = 2) {
  return Number(numero || 0).toLocaleString('es-BO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

function CampoTabla({ value, onChange, oscuro, step = '0.01', disabled = false, label }) {
  return (
    <input
      aria-label={label}
      type="number"
      min="0"
      step={step}
      value={value}
      onChange={(evento) => onChange(evento.target.value)}
      disabled={disabled}
      className={`w-full min-w-20 rounded border px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-70 ${
        oscuro
          ? 'border-slate-700 bg-slate-950 text-white'
          : 'border-gray-300 bg-white text-gray-900'
      }`}
    />
  );
}

export default function CapturaPlanilla() {
  const navigate = useNavigate();
  const location = useLocation();
  const { perfil } = useAuth();
  const { darkMode } = useTheme();
  const datos = location.state;
  const tipo = datos?.tipo;
  const fechaElegida = datos?.fecha;
  const entidadId = datos?.entidadId;
  const semana = useMemo(
    () => fechaElegida ? inicioSemana(new Date(`${fechaElegida}T00:00:00`)) : null,
    [fechaElegida],
  );
  const dias = useMemo(() => semana ? diasDeSemana(semana) : [], [semana]);
  const fechas = useMemo(() => dias.map(aISO), [dias]);
  const desde = fechas[0];
  const hasta = fechas[6];
  const [valores, setValores] = useState({});
  const [pendientes, setPendientes] = useState({});
  const [duplicados, setDuplicados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargada, setCargada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [cerrada, setCerrada] = useState(false);
  const [archivada, setArchivada] = useState(false);
  const [confirmacionCierre, setConfirmacionCierre] = useState(false);

  const oscuro = darkMode;
  const hoja = oscuro ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-gray-400 bg-white text-gray-900';
  const borde = oscuro ? 'border-slate-700' : 'border-gray-500';
  const cabecera = oscuro ? 'bg-slate-800' : 'bg-gray-200';
  const banda = oscuro ? 'bg-slate-800/70' : 'bg-gray-100';
  const muted = oscuro ? 'text-slate-400' : 'text-gray-500';

  useEffect(() => {
    if (!TITULOS[tipo] || !fechaElegida || !entidadId) {
      navigate('/planilla', { replace: true });
    }
  }, [entidadId, fechaElegida, navigate, tipo]);

  useEffect(() => {
    if (!TITULOS[tipo] || !desde || !hasta || !entidadId) return undefined;
    let vigente = true;

    const cargar = async () => {
      setCargando(true);
      setCargada(false);
      setError('');
      setDuplicados([]);
      try {
        const filas = {};
        let tieneDatosGuardados = false;
        for (const fecha of fechas) filas[fecha] = filaVacia(tipo);
        const estadoCerrado = await planillaRepository.obtenerEstadoCerrado({
          tipo,
          entidadId,
          semanaInicio: desde,
        });

        if (tipo === 'compras') {
          const estadoArchivado = await planillaRepository.obtenerEstadoPlanillaComprasArchivada({
            proveedorId: entidadId,
            semanaInicio: desde,
          });
          if (estadoArchivado) {
            if (vigente) {
              setArchivada(true);
              setError('Esta planilla está archivada. Restáurala desde “Archivadas” antes de editarla.');
            }
            return;
          }
          const compras = await planillaRepository.comprasSemana({ desde, hasta });
          const delProveedor = compras.filter((compra) => compra.proveedor_id === Number(entidadId));
          tieneDatosGuardados = delProveedor.length > 0;
          const porFecha = new Map();
          for (const compra of delProveedor) {
            porFecha.set(compra.fecha, [...(porFecha.get(compra.fecha) || []), compra]);
          }

          const fechasDuplicadas = [];
          for (const [fecha, registros] of porFecha) {
            if (registros.length > 1) {
              const kilos = registros.reduce((total, registro) => total + Number(registro.kilos || 0), 0);
              const unidades = registros.reduce((total, registro) => total + Number(registro.unidades || 0), 0);
              const total = registros.reduce(
                (suma, registro) => suma + Number(registro.total_monto ?? (registro.kilos || 0) * (registro.precio_por_kilo || 0)),
                0,
              );
              fechasDuplicadas.push({
                fecha,
                recibos: registros.map((registro) => registro.numero_recibo).filter(Boolean),
              });
              filas[fecha] = {
                numeroRecibo: registros.map((registro) => registro.numero_recibo).filter(Boolean).join(', '),
                kilos: valor(kilos),
                unidades: valor(unidades),
                precioPorKilo: valor(kilos ? total / kilos : 0),
              };
              continue;
            }
            const compra = registros[0];
            filas[fecha] = {
              id: compra.id,
              numeroRecibo: compra.numero_recibo || '',
              kilos: valor(compra.kilos),
              unidades: valor(compra.unidades),
              precioPorKilo: valor(compra.precio_por_kilo),
            };
          }
          if (vigente) setDuplicados(fechasDuplicadas);
        } else if (tipo === 'ventas') {
          const ventas = await planillaRepository.listarVentas({ desde, hasta });
          const deLaSucursal = ventas.filter((fila) => fila.sucursal_id === Number(entidadId));
          tieneDatosGuardados = deLaSucursal.length > 0;
          for (const venta of deLaSucursal) {
            filas[venta.fecha] = {
              unidades: valor(venta.unidades),
              transacciones: valor(venta.transacciones),
              importeBs: valor(venta.importe_bs),
            };
          }
        } else {
          const inventario = await planillaRepository.listarInventario({ desde, hasta });
          const delProveedor = inventario.filter((registro) => registro.proveedor_id === Number(entidadId));
          tieneDatosGuardados = delProveedor.length > 0;
          for (const fila of delProveedor) {
            filas[fila.fecha] = {
              kilosAyer: valor(fila.kilos_ayer),
              kilosEntrante: valor(fila.kilos_entrante),
              kilosSaliente: valor(fila.kilos_saliente),
            };
          }
        }

        if (vigente) {
          setValores(filas);
          setPendientes({});
          setCerrada(estadoCerrado);
          setArchivada(false);
          setAviso(tieneDatosGuardados
            ? 'Se cargó la planilla guardada de esta semana. Puedes editarla y guardar los cambios.'
            : '');
          setCargada(true);
        }
      } catch (err) {
        if (vigente) setError(err.message || 'No se pudo cargar la planilla de esta semana.');
      } finally {
        if (vigente) setCargando(false);
      }
    };

    cargar();
    return () => {
      vigente = false;
    };
  }, [desde, entidadId, fechas, hasta, tipo]);
  if (!TITULOS[tipo] || !fechaElegida || !entidadId || !semana) return null;

  if (archivada) {
    return (
      <main className={`min-h-screen px-4 py-8 ${oscuro ? 'bg-slate-950' : 'bg-gray-100'}`}>
        <section className={`mx-auto max-w-2xl rounded-2xl border p-5 shadow-lg md:p-8 ${hoja}`}>
          <h1 className="text-lg font-black">Planilla archivada</h1>
          <p className={`mt-3 text-sm ${muted}`}>
            Esta planilla está archivada y no se puede editar. Restáurala desde la lista de archivadas para continuar.
          </p>
          <button
            type="button"
            onClick={() => navigate('/planilla', {
              replace: true,
              state: {
                fechaCaptura: fechaElegida,
                verComprasArchivadas: true,
              },
            })}
            className="mt-5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-300"
          >
            Volver a planillas archivadas
          </button>
        </section>
      </main>
    );
  }

  const cambiar = (fecha, campo, nuevoValor) => {
    setError('');
    setAviso('');
    setPendientes((actuales) => ({ ...actuales, [fecha]: true }));
    setValores((actuales) => ({
      ...actuales,
      [fecha]: { ...filaVacia(tipo), ...actuales[fecha], [campo]: nuevoValor },
    }));
  };

  const guardarDatos = async () => {
    if (archivada) {
      setError('Esta planilla está archivada. Restáurala antes de editarla.');
      return false;
    }
    if (cerrada) return false;
    if (!cargada) {
      setError('No se guardó porque no se pudo cargar primero la planilla desde la base de datos.');
      return false;
    }
    setError('');
    setGuardando(true);
    try {
      if (tipo === 'compras') {
        const comprasPorGuardar = fechas.flatMap((fecha) => {
          if (!pendientes[fecha]) return [];
          if (duplicados.some((duplicado) => duplicado.fecha === fecha)) return [];
          const fila = valores[fecha] || filaVacia(tipo);
          const contieneDatos = [fila.numeroRecibo, fila.kilos, fila.unidades, fila.precioPorKilo]
            .some((dato) => String(dato ?? '').trim() !== '');
          if (!contieneDatos) {
            if (fila.id) throw new Error(`El recibo existente del ${formatoFecha(fecha)} no se puede eliminar desde esta plantilla.`);
            return [];
          }

          if (!fila.numeroRecibo.trim() || Number(fila.kilos) <= 0 || Number(fila.unidades) <= 0
            || String(fila.precioPorKilo).trim() === '' || Number(fila.precioPorKilo) < 0) {
            throw new Error(`Completa el recibo, los kilos, las unidades y el precio del ${formatoFecha(fecha)}.`);
          }

          return [{
            fecha,
            proveedorId: entidadId,
            numeroRecibo: fila.numeroRecibo,
            kilos: fila.kilos,
            unidades: fila.unidades,
            precioPorKilo: fila.precioPorKilo,
            id: fila.id,
          }];
        });
        const resultadosCompra = await Promise.allSettled(comprasPorGuardar.map(async (compra) => {
          if (compra.id) {
            await planillaRepository.actualizarCompra(compra);
            return { fecha: compra.fecha, id: compra.id };
          } else {
            const creada = await planillaRepository.crearCompraManual({ ...compra, creadoPor: perfil?.id });
            return { fecha: compra.fecha, id: creada.id };
          }
        }));
        setValores((actuales) => {
          const siguientes = { ...actuales };
          for (const resultado of resultadosCompra) {
            if (resultado.status !== 'fulfilled') continue;
            const compra = resultado.value;
            siguientes[compra.fecha] = { ...siguientes[compra.fecha], id: compra.id };
          }
          return siguientes;
        });
        const errorCompra = resultadosCompra.find((resultado) => resultado.status === 'rejected');
        setPendientes((actuales) => {
          const siguientes = { ...actuales };
          for (const resultado of resultadosCompra) {
            if (resultado.status === 'fulfilled') siguientes[resultado.value.fecha] = false;
          }
          return siguientes;
        });
        if (errorCompra) throw errorCompra.reason;
      } else if (tipo === 'ventas') {
        const ventasPorGuardar = fechas.flatMap((fecha) => {
          if (!pendientes[fecha]) return [];
          const fila = valores[fecha] || filaVacia(tipo);
          return [{
            fecha,
            sucursalId: entidadId,
            unidades: fila.unidades,
            transacciones: fila.transacciones,
            importeBs: fila.importeBs,
            creadoPor: perfil?.id,
          }];
        });
        const resultadosVenta = await Promise.allSettled(
          ventasPorGuardar.map((venta) => planillaRepository.guardarVenta(venta)),
        );
        setPendientes((actuales) => {
          const siguientes = { ...actuales };
          resultadosVenta.forEach((resultado, indice) => {
            if (resultado.status === 'fulfilled') siguientes[ventasPorGuardar[indice].fecha] = false;
          });
          return siguientes;
        });
        const errorVenta = resultadosVenta.find((resultado) => resultado.status === 'rejected');
        if (errorVenta) throw errorVenta.reason;
      } else {
        const inventarioPorGuardar = fechas.flatMap((fecha) => {
          if (!pendientes[fecha]) return [];
          const fila = valores[fecha] || filaVacia(tipo);
          return [{
            fecha,
            proveedorId: entidadId,
            kilosAyer: fila.kilosAyer,
            kilosEntrante: fila.kilosEntrante,
            kilosSaliente: fila.kilosSaliente,
            creadoPor: perfil?.id,
          }];
        });
        const resultadosInventario = await Promise.allSettled(
          inventarioPorGuardar.map((fila) => planillaRepository.guardarInventario(fila)),
        );
        setPendientes((actuales) => {
          const siguientes = { ...actuales };
          resultadosInventario.forEach((resultado, indice) => {
            if (resultado.status === 'fulfilled') siguientes[inventarioPorGuardar[indice].fecha] = false;
          });
          return siguientes;
        });
        const errorInventario = resultadosInventario.find((resultado) => resultado.status === 'rejected');
        if (errorInventario) throw errorInventario.reason;
      }
      setAviso('Planilla guardada. Puedes seguir completándola y guardar de nuevo más tarde.');
      return true;
    } catch (err) {
      setError(err.message || 'No se pudo guardar la planilla.');
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    setAviso('');
    await guardarDatos();
  };

  const cerrarPlantilla = async () => {
    if (!cargada || cerrada) return;
    setAviso('');
    setCerrando(true);
    try {
      const guardado = await guardarDatos();
      if (!guardado) return;
      await planillaRepository.cerrarPlantilla({ tipo, entidadId, semanaInicio: desde });
      navigate('/planilla', {
        replace: true,
        state: {
          fechaCaptura: fechaElegida,
          mensajeCaptura: 'La planilla quedó guardada y cerrada.',
        },
      });
    } catch (err) {
      setError(err.message || 'No se pudo cerrar la planilla.');
    } finally {
      setCerrando(false);
    }
  };

  const reabrirPlantilla = async () => {
    if (!cargada || !cerrada) return;
    setError('');
    setAviso('');
    setGuardando(true);
    try {
      await planillaRepository.reabrirPlantilla({ tipo, entidadId, semanaInicio: desde });
      setCerrada(false);
      setAviso('Planilla reabierta. Puedes continuar editándola.');
    } catch (err) {
      setError(err.message || 'No se pudo reabrir la planilla.');
    } finally {
      setGuardando(false);
    }
  };

  const exportar = () => {
    const nombreArchivo = `${tipo}_${entidadId}_${desde}_${hasta}`;
    if (tipo === 'compras') {
      const lineas = [
        {
          Descripción: 'N. DE RECIBO',
          Unidad: '',
          ...Object.fromEntries(fechas.map((fecha) => [formatoFechaCompleta(fecha), valores[fecha]?.numeroRecibo || ''])),
          'TOTAL SEMANA': '',
        },
      ];
      const kilosSemana = fechas.reduce((total, fecha) => total + (Number(valores[fecha]?.kilos) || 0), 0);
      const unidadesSemana = fechas.reduce((total, fecha) => total + (Number(valores[fecha]?.unidades) || 0), 0);
      const montoSemana = fechas.reduce((total, fecha) => (
        total + (Number(valores[fecha]?.kilos) || 0) * (Number(valores[fecha]?.precioPorKilo) || 0)
      ), 0);
      const metricas = [
        { descripcion: datos.entidadNombre, unidad: 'Kg.', valor: (fila) => fila.kilos, total: kilosSemana },
        { descripcion: 'Precio', unidad: 'Bs/kg', valor: (fila) => fila.precioPorKilo, total: kilosSemana ? montoSemana / kilosSemana : 0 },
        { descripcion: 'Unidades', unidad: 'Ud.', valor: (fila) => fila.unidades, total: unidadesSemana },
        { descripcion: 'Total', unidad: 'Bs.', valor: (fila) => (Number(fila.kilos) || 0) * (Number(fila.precioPorKilo) || 0), total: montoSemana },
        { descripcion: 'Promedio', unidad: 'Kg/ud.', valor: (fila) => (Number(fila.unidades) ? Number(fila.kilos) / Number(fila.unidades) : 0), total: unidadesSemana ? kilosSemana / unidadesSemana : 0 },
      ];
      for (const metrica of metricas) {
        lineas.push({
          Descripción: metrica.descripcion,
          Unidad: metrica.unidad,
          ...Object.fromEntries(fechas.map((fecha) => [
            formatoFechaCompleta(fecha),
            metrica.valor(valores[fecha] || filaVacia(tipo)),
          ])),
          'TOTAL SEMANA': metrica.total,
        });
      }
      exportarAExcel(lineas, nombreArchivo);
      return;
    }

    if (tipo === 'ventas') {
      const filasVenta = CAMPOS_VENTA.map((metrica) => {
        const fila = { Sucursal: datos.entidadNombre, Métrica: metrica.titulo };
        let total = 0;
        for (const fecha of fechas) {
          const numero = Number(valores[fecha]?.[metrica.campo]) || 0;
          fila[formatoFechaCompleta(fecha)] = numero;
          total += numero;
        }
        fila['TOTAL SEMANA'] = total;
        return fila;
      });
      exportarAExcel(filasVenta, nombreArchivo);
      return;
    }

    const filasInventario = fechas.map((fecha) => {
      const fila = valores[fecha] || filaVacia(tipo);
      const ayer = Number(fila.kilosAyer) || 0;
      const entrante = Number(fila.kilosEntrante) || 0;
      const saliente = Number(fila.kilosSaliente) || 0;
      return {
        Fecha: formatoFechaCompleta(fecha),
        Proveedor: datos.entidadNombre,
        'S. AYER': ayer,
        ENTRANTE: entrante,
        SALIENTE: saliente,
        'S. HOY': ayer + entrante - saliente,
      };
    });
    exportarAExcel(filasInventario, nombreArchivo);
  };

  const descargar = () => {
    if (!cargada) return;
    setError('');
    try {
      exportar();
    } catch (err) {
      setError(err.message || 'No se pudo exportar la planilla.');
    }
  };

  const guardarYSalir = async () => {
    setAviso('');
    if (!cargada) {
      navigate('/planilla', { replace: true });
      return;
    }
    if (!cerrada) {
      const guardado = await guardarDatos();
      if (!guardado) return;
    }
    navigate('/planilla', {
      replace: true,
      state: {
        fechaCaptura: fechaElegida,
        mensajeCaptura: cerrada
          ? 'Saliste de la planilla cerrada.'
          : 'La planilla quedó guardada y abierta para continuar después.',
      },
    });
  };
  const totalesCompra = fechas.reduce((totales, fecha) => {
    const fila = valores[fecha] || filaVacia(tipo);
    const kilos = Number(fila.kilos) || 0;
    const unidades = Number(fila.unidades) || 0;
    const total = kilos * (Number(fila.precioPorKilo) || 0);
    totales.kilos += kilos;
    totales.unidades += unidades;
    totales.total += total;
    return totales;
  }, { kilos: 0, unidades: 0, total: 0 });

  return (
    <main className={`min-h-screen px-3 py-5 md:px-6 ${oscuro ? 'bg-slate-950' : 'bg-gray-100'}`}>
      <section className={`mx-auto max-w-[1500px] overflow-hidden rounded-xl border shadow-lg ${hoja}`}>
        <header className={`flex items-center gap-3 border-b px-4 py-3 ${borde}`}>
          <button
            type="button"
            onClick={guardarYSalir}
            disabled={guardando || cerrando}
            className={`rounded border p-2 ${oscuro ? 'border-slate-700 hover:bg-slate-800' : 'border-gray-300 hover:bg-gray-100'}`}
            aria-label={cerrada ? 'Salir de la planilla' : 'Guardar y salir sin cerrar la planilla'}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-black uppercase md:text-base">{TITULOS[tipo]} · {datos.entidadNombre}</h1>
            <p className={`mt-0.5 text-xs ${muted}`}>
              Del {formatoFechaCompleta(desde)} al {formatoFechaCompleta(hasta)}
              {cerrada && <span className="ml-2 font-bold text-amber-500">· CERRADA</span>}
            </p>
          </div>
        </header>

        {aviso && (
          <p role="status" className="mx-3 mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-300">
            {aviso}
          </p>
        )}

        {cerrada && (
          <p className={`mx-3 mt-3 rounded-lg border px-3 py-2 text-sm ${oscuro ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
            Esta planilla está cerrada y no acepta cambios. Puedes exportarla o reabrirla para corregir datos.
          </p>
        )}

        {error && (
          <p role="alert" className="mx-3 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </p>
        )}

        {duplicados.length > 0 && (
          <p role="alert" className={`mx-3 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm ${oscuro ? 'text-amber-300' : 'text-amber-700'}`}>
            Ya existen varios recibos para este proveedor en {duplicados.map((item) => formatoFecha(item.fecha)).join(', ')}.
            Esos días quedan protegidos para no sobrescribir ni combinar recibos.
          </p>
        )}

        {cargando ? (
          <p className={`flex items-center gap-2 px-4 py-8 text-sm ${muted}`}>
            <Loader2 size={17} className="animate-spin" /> Cargando la planilla semanal...
          </p>
        ) : (
          <form onSubmit={guardar} className="p-3 md:p-4">
            <div className="overflow-x-auto">
              {tipo === 'compras' && (
                <table className="w-full min-w-[1050px] border-collapse text-xs">
                  <thead>
                    <tr className={cabecera}>
                      <th colSpan="2" className={`border ${borde} px-2 py-2 text-left`}>N. DE RECIBO</th>
                      {fechas.map((fecha) => {
                        const duplicado = duplicados.find((item) => item.fecha === fecha);
                        return (
                          <th key={fecha} className={`border ${borde} p-1`}>
                            {duplicado
                              ? <span title={duplicado.recibos.join(', ')}>{duplicado.recibos.join(', ')}</span>
                              : <input
                                  aria-label={`Número de recibo ${formatoFecha(fecha)}`}
                                  value={valores[fecha]?.numeroRecibo || ''}
                                  onChange={(evento) => cambiar(fecha, 'numeroRecibo', evento.target.value)}
                                  disabled={cerrada || !cargada || guardando || cerrando}
                                  className={`w-full min-w-20 border-0 bg-transparent px-1 py-1 text-center outline-none focus:ring-1 focus:ring-amber-500 ${oscuro ? 'text-white' : 'text-gray-900'}`}
                                />}
                          </th>
                        );
                      })}
                      <th className={`border ${borde} px-2 py-2`}>TOTAL SEMANA</th>
                    </tr>
                    <tr className={cabecera}>
                      <th className={`border ${borde} px-2 py-2 text-left`}>DESCRIPCIÓN</th>
                      <th className={`border ${borde} px-2 py-2 text-left`}>UNIDAD</th>
                      {fechas.map((fecha) => <th key={fecha} className={`border ${borde} px-1 py-2`}>{formatoFecha(fecha)}</th>)}
                      <th className={`border ${borde} px-2 py-2`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { campo: 'kilos', titulo: datos.entidadNombre, unidad: 'Kg.', decimales: 2 },
                      { campo: 'precioPorKilo', titulo: 'Precio', unidad: 'Bs/kg', decimales: 2 },
                      { campo: 'unidades', titulo: 'Unidades', unidad: 'Ud.', decimales: 0 },
                      { campo: 'total', titulo: 'Total', unidad: 'Bs.', decimales: 2 },
                      { campo: 'promedio', titulo: 'Promedio', unidad: 'Kg/ud.', decimales: 2 },
                    ].map((metrica, indice) => (
                      <tr key={metrica.campo} className={`${indice === 3 ? banda : ''} border-b ${borde}`}>
                        <th className={`border ${borde} px-2 py-2 text-left ${indice === 0 ? 'font-bold' : 'font-medium'}`}>
                          {metrica.titulo}
                        </th>
                        <td className={`border ${borde} px-2 py-2`}>{metrica.unidad}</td>
                        {fechas.map((fecha) => {
                          const fila = valores[fecha] || filaVacia(tipo);
                          const bloqueado = duplicados.some((item) => item.fecha === fecha);
                          const kilos = Number(fila.kilos) || 0;
                          const unidades = Number(fila.unidades) || 0;
                          const total = kilos * (Number(fila.precioPorKilo) || 0);
                          const calculado = metrica.campo === 'total'
                            ? formatoNumero(total)
                            : metrica.campo === 'promedio'
                              ? formatoNumero(unidades ? kilos / unidades : 0)
                              : null;
                          return (
                            <td key={fecha} className={`border ${borde} p-1`}>
                              {['kilos', 'precioPorKilo', 'unidades'].includes(metrica.campo) && !bloqueado
                                ? <CampoTabla
                                    label={`${metrica.titulo} ${formatoFecha(fecha)}`}
                                    value={fila[metrica.campo]}
                                    step={metrica.campo === 'unidades' ? '1' : '0.01'}
                                    onChange={(nuevoValor) => cambiar(fecha, metrica.campo, nuevoValor)}
                                    oscuro={oscuro}
                                    disabled={cerrada || !cargada || guardando || cerrando}
                                  />
                                : <span className="block min-w-20 text-right tabular-nums">
                                    {bloqueado && ['kilos', 'precioPorKilo', 'unidades'].includes(metrica.campo)
                                      ? formatoNumero(fila[metrica.campo], metrica.decimales)
                                      : calculado ?? formatoNumero(fila[metrica.campo], metrica.decimales)}
                                  </span>}
                            </td>
                          );
                        })}
                        <td className={`border ${borde} px-2 py-2 text-right font-semibold tabular-nums`}>
                          {metrica.campo === 'kilos'
                            ? formatoNumero(totalesCompra.kilos)
                            : metrica.campo === 'unidades'
                              ? formatoNumero(totalesCompra.unidades, 0)
                              : metrica.campo === 'total'
                                ? formatoNumero(totalesCompra.total)
                                : metrica.campo === 'precioPorKilo'
                                  ? formatoNumero(totalesCompra.kilos ? totalesCompra.total / totalesCompra.kilos : 0)
                                  : formatoNumero(totalesCompra.unidades ? totalesCompra.kilos / totalesCompra.unidades : 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tipo === 'ventas' && (
                <table className="w-full min-w-[900px] border-collapse text-xs">
                  <thead>
                    <tr className={cabecera}>
                      <th className={`border ${borde} px-3 py-2 text-left`}>SUCURSAL · {datos.entidadNombre}</th>
                      {fechas.map((fecha) => <th key={fecha} className={`border ${borde} px-2 py-2`}>{formatoFecha(fecha)}</th>)}
                      <th className={`border ${borde} px-3 py-2`}>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAMPOS_VENTA.map((metrica, indice) => {
                      const total = fechas.reduce((suma, fecha) => suma + (Number(valores[fecha]?.[metrica.campo]) || 0), 0);
                      return (
                        <tr key={metrica.campo} className={`${indice === 2 ? banda : ''} border-b ${borde}`}>
                          <th className={`border ${borde} px-3 py-2 text-left`}>{metrica.titulo}</th>
                          {fechas.map((fecha) => (
                            <td key={fecha} className={`border ${borde} p-1`}>
                              <CampoTabla
                                label={`${metrica.titulo} ${formatoFecha(fecha)}`}
                                value={valores[fecha]?.[metrica.campo] || ''}
                                step={metrica.decimales === 0 ? '1' : '0.01'}
                                onChange={(nuevoValor) => cambiar(fecha, metrica.campo, nuevoValor)}
                                oscuro={oscuro}
                                disabled={cerrada || !cargada || guardando || cerrando}
                              />
                            </td>
                          ))}
                          <td className={`border ${borde} px-3 py-2 text-right font-bold tabular-nums`}>
                            {formatoNumero(total, metrica.decimales)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {tipo === 'inventario' && (
                <table className="w-full min-w-[850px] border-collapse text-xs">
                  <thead>
                    <tr className={cabecera}>
                      <th className={`border ${borde} px-3 py-2`}>FECHA</th>
                      <th colSpan="4" className={`border ${borde} px-3 py-2 text-center`}>{datos.entidadNombre}</th>
                    </tr>
                    <tr className={cabecera}>
                      <th className={`border ${borde} px-3 py-2`}></th>
                      {['S. AYER', 'ENTRANTE', 'SALIENTE', 'S. HOY'].map((titulo) => (
                        <th key={titulo} className={`border ${borde} px-3 py-2`}>{titulo}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fechas.map((fecha, indice) => {
                      const fila = valores[fecha] || filaVacia(tipo);
                      const saldo = (Number(fila.kilosAyer) || 0)
                        + (Number(fila.kilosEntrante) || 0)
                        - (Number(fila.kilosSaliente) || 0);
                      return (
                        <tr key={fecha} className={`${indice % 2 ? banda : ''} border-b ${borde}`}>
                          <th className={`border ${borde} px-3 py-2 text-left`}>{formatoFecha(fecha)}</th>
                          {CAMPOS_INVENTARIO.map((metrica) => (
                            <td key={metrica.campo} className={`border ${borde} p-1`}>
                              <CampoTabla
                                label={`${metrica.titulo} ${formatoFecha(fecha)}`}
                                value={fila[metrica.campo]}
                                onChange={(nuevoValor) => cambiar(fecha, metrica.campo, nuevoValor)}
                                oscuro={oscuro}
                                disabled={cerrada || !cargada || guardando || cerrando}
                              />
                            </td>
                          ))}
                          <td className={`border ${borde} px-3 py-2 text-right font-bold tabular-nums`}>{formatoNumero(saldo)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className={`${cabecera} font-black`}>
                    <tr>
                      <th className={`border ${borde} px-3 py-2 text-left`}>TOTAL</th>
                      {CAMPOS_INVENTARIO.map((metrica) => (
                        <td key={metrica.campo} className={`border ${borde} px-3 py-2 text-right tabular-nums`}>
                          {formatoNumero(fechas.reduce(
                            (total, fecha) => total + (Number(valores[fecha]?.[metrica.campo]) || 0),
                            0,
                          ))}
                        </td>
                      ))}
                      <td className={`border ${borde} px-3 py-2 text-right tabular-nums`}>
                        {formatoNumero(fechas.reduce((total, fecha) => {
                          const fila = valores[fecha] || filaVacia(tipo);
                          return total
                            + (Number(fila.kilosAyer) || 0)
                            + (Number(fila.kilosEntrante) || 0)
                            - (Number(fila.kilosSaliente) || 0);
                        }, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <footer className={`mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3 ${borde}`}>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={descargar}
                  disabled={cargando || !cargada || guardando || cerrando}
                  className={`inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${oscuro ? 'border-slate-700 hover:bg-slate-800' : 'border-gray-300 hover:bg-gray-100'}`}
                >
                  <Download size={15} /> Exportar
                </button>
                {cerrada ? (
                  <button
                    type="button"
                    onClick={reabrirPlantilla}
                    disabled={!cargada || guardando || cerrando}
                    className="inline-flex items-center gap-2 rounded border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-600 hover:bg-cyan-500/10 disabled:opacity-60"
                  >
                    {guardando ? <Loader2 size={15} className="animate-spin" /> : <UnlockKeyhole size={15} />}
                    Reabrir plantilla
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmacionCierre(true)}
                    disabled={!cargada || guardando || cerrando}
                    className={`inline-flex items-center gap-2 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${oscuro ? 'border-slate-700 hover:bg-slate-800' : 'border-gray-300 hover:bg-gray-100'}`}
                  >
                    <LockKeyhole size={15} /> Cerrar planilla
                  </button>
                )}
              </div>
              {!cerrada && (
                <button
                  type="submit"
                  disabled={!cargada || guardando || cerrando}
                  className="inline-flex items-center gap-2 rounded bg-amber-400 px-4 py-2 text-xs font-bold text-amber-950 hover:bg-amber-300 disabled:opacity-60"
                >
                  {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              )}
            </footer>
          </form>
        )}
        <ModalConfirmar
          config={confirmacionCierre ? {
            titulo: 'Cerrar planilla semanal',
            mensaje: `Se guardarán los datos actuales y se cerrará la planilla de ${datos.entidadNombre} del ${formatoFechaCompleta(desde)} al ${formatoFechaCompleta(hasta)}. Al cerrarla no se podrá editar hasta reabrirla.`,
            labelConfirmar: 'Guardar y cerrar',
            variante: 'warning',
            onConfirmar: cerrarPlantilla,
          } : null}
          onCerrar={() => setConfirmacionCierre(false)}
          cargando={guardando || cerrando}
        />
      </section>
    </main>
  );
}
