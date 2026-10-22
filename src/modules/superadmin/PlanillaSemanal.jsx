import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { planillaRepository } from '../../repositories/planillaRepository';
import { exportarAExcel, exportarAPDF } from '../../utils/exportUtils';
import SeccionCompras from './SeccionCompras';
import SeccionVentas from './SeccionVentas';
import SeccionInventario from './SeccionInventario';
import BotonesExportar from './BotonesExportar';
import { aISO, diasDeSemana, formatoBs, inicioSemana, rangoSemana, sumarDias } from './planillaUtils';

export default function PlanillaSemanal() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const { darkMode } = useTheme();
  const perfilId = perfil?.id;

  const [inicio, setInicio] = useState(() => inicioSemana(new Date()));
  const [sucursales, setSucursales] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [compras, setCompras] = useState([]);
  const [ventas, setVentas] = useState(() => new Map());
  const [inventario, setInventario] = useState(() => new Map());
  const [campo, setCampo] = useState('importe_bs');
  const [diaIdx, setDiaIdx] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const ventasRef = useRef(new Map());
  const inventarioRef = useRef(new Map());

  const dias = useMemo(() => diasDeSemana(inicio), [inicio]);
  const rango = useMemo(() => rangoSemana(inicio), [inicio]);

  const card = darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-white';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';

  const cargar = useCallback(async () => {
    setCargando(true);
    setAviso(null);
    const desde = aISO(diasDeSemana(inicio)[0]);
    const hasta = aISO(diasDeSemana(inicio)[6]);
    try {
      const [listaSucursales, listaProveedores, filasVentas, filasInventario, filasCompras] = await Promise.all([
        planillaRepository.listarSucursales(),
        planillaRepository.listarProveedores(),
        planillaRepository.listarVentas({ desde, hasta }),
        planillaRepository.listarInventario({ desde, hasta }),
        planillaRepository.comprasSemana({ desde, hasta }),
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

      ventasRef.current = mapaVentas;
      inventarioRef.current = mapaInventario;
      setVentas(mapaVentas);
      setInventario(mapaInventario);
      setSucursales(listaSucursales);
      setProveedores(listaProveedores);

      const porProveedor = new Map();
      for (const fila of filasCompras) {
        const nombre = fila.proveedores?.nombre || 'Sin proveedor';
        const actual = porProveedor.get(nombre) || { nombre, kg: 0, unidades: 0, monto: 0 };
        actual.kg += Number(fila.kilos || 0);
        actual.unidades += Number(fila.unidades || 0);
        actual.monto += Number(fila.total_monto || 0);
        porProveedor.set(nombre, actual);
      }
      setCompras([...porProveedor.values()].map((fila) => ({
        ...fila,
        precioProm: fila.kg > 0 ? fila.monto / fila.kg : 0,
      })));
    } catch (err) {
      setAviso({ tipo: 'error', texto: 'No se pudo cargar la planilla: ' + (err.message || 'revisa tu conexión') });
    } finally {
      setCargando(false);
    }
  }, [inicio]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarVenta = useCallback(({ fecha, sucursalId, campo: campoEditado, valor }) => {
    const clave = `${fecha}|${sucursalId}`;
    const copia = new Map(ventasRef.current);
    copia.set(clave, { ...(copia.get(clave) || {}), [campoEditado]: valor });
    ventasRef.current = copia;
    setVentas(copia);
  }, []);

  const guardarVenta = useCallback(async ({ fecha, sucursalId }) => {
    const valores = ventasRef.current.get(`${fecha}|${sucursalId}`) || {};
    try {
      setGuardando(true);
      await planillaRepository.guardarVenta({
        fecha,
        sucursalId,
        unidades: valores.unidades,
        transacciones: valores.transacciones,
        importeBs: valores.importe_bs,
        creadoPor: perfilId,
      });
    } catch (err) {
      setAviso({ tipo: 'error', texto: 'No se pudo guardar la venta: ' + (err.message || '') });
    } finally {
      setGuardando(false);
    }
  }, [perfilId]);

  const cambiarInventario = useCallback(({ fecha, proveedorId, campo: campoEditado, valor }) => {
    const clave = `${fecha}|${proveedorId}`;
    const copia = new Map(inventarioRef.current);
    copia.set(clave, { ...(copia.get(clave) || {}), [campoEditado]: valor });
    inventarioRef.current = copia;
    setInventario(copia);
  }, []);

  const guardarInventarioFila = useCallback(async (fecha, proveedorId) => {
    const valores = inventarioRef.current.get(`${fecha}|${proveedorId}`) || {};
    await planillaRepository.guardarInventario({
      fecha,
      proveedorId,
      kilosAyer: valores.kilos_ayer,
      kilosEntrante: valores.kilos_entrante,
      kilosSaliente: valores.kilos_saliente,
      creadoPor: perfilId,
    });
  }, [perfilId]);

  const guardarInventario = useCallback(async ({ fecha, proveedorId }) => {
    try {
      setGuardando(true);
      await guardarInventarioFila(fecha, proveedorId);
    } catch (err) {
      setAviso({ tipo: 'error', texto: 'No se pudo guardar el inventario: ' + (err.message || '') });
    } finally {
      setGuardando(false);
    }
  }, [guardarInventarioFila]);

  const traerSaldoAyer = useCallback(async ({ fechaActual, fechaAyer }) => {
    try {
      setGuardando(true);
      const filas = await planillaRepository.listarInventario({ desde: fechaAyer, hasta: fechaAyer });
      const porProveedor = new Map(filas.map((fila) => [fila.proveedor_id, fila]));
      const copia = new Map(inventarioRef.current);
      for (const proveedor of proveedores) {
        const previo = porProveedor.get(proveedor.id);
        const saldoHoy = previo
          ? Number(previo.kilos_ayer) + Number(previo.kilos_entrante) - Number(previo.kilos_saliente)
          : 0;
        copia.set(`${fechaActual}|${proveedor.id}`, { ...(copia.get(`${fechaActual}|${proveedor.id}`) || {}), kilos_ayer: saldoHoy });
      }
      inventarioRef.current = copia;
      setInventario(copia);
      await Promise.all(proveedores.map((proveedor) => guardarInventarioFila(fechaActual, proveedor.id)));
      setAviso({ tipo: 'ok', texto: 'Saldo de ayer aplicado como S. AYER.' });
    } catch (err) {
      setAviso({ tipo: 'error', texto: 'No se pudo traer el saldo de ayer: ' + (err.message || '') });
    } finally {
      setGuardando(false);
    }
  }, [proveedores, guardarInventarioFila]);

  const filasVentasExport = () => sucursales.map((sucursal) => {
    const fila = { Sucursal: sucursal.nombre, Sector: sucursal.sector };
    let total = 0;
    dias.forEach((dia, i) => {
      const valor = Number(ventas.get(`${aISO(dia)}|${sucursal.id}`)?.[campo] || 0);
      fila[`Día ${i + 1}`] = valor;
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
        const valor = Number(ventas.get(`${aISO(dia)}|${sucursal.id}`)?.[campo] || 0);
        total += valor;
        return campo === 'importe_bs' ? formatoBs(valor) : String(valor);
      });
      return [sucursal.nombre, ...celdas, campo === 'importe_bs' ? formatoBs(total) : String(total)];
    });
    exportarAPDF(columnas, filas, `Ventas ${rango}`, `Ventas_${aISO(dias[0])}`);
  };

  const filasInventario = (iso) => proveedores.map((proveedor) => {
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

  const exportarComprasExcel = () => exportarAExcel(
    compras.map((fila) => ({
      Proveedor: fila.nombre, Kg: fila.kg, Unidades: fila.unidades, 'Costo total (Bs)': fila.monto, 'Precio prom (Bs/kg)': fila.precioProm,
    })),
    `Compras_${aISO(dias[0])}`
  );
  const exportarComprasPDF = () => exportarAPDF(
    ['Proveedor', 'Kg', 'Unidades', 'Costo total (Bs)', 'Precio prom (Bs/kg)'],
    compras.map((fila) => [fila.nombre, fila.kg, fila.unidades, formatoBs(fila.monto), formatoBs(fila.precioProm)]),
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
              <h1 className={`text-xl font-black md:text-2xl ${strong}`}>Planilla de Ventas e Inventario</h1>
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
            <button type="button" onClick={cargar} className={`rounded-xl border p-2 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`} aria-label="Recargar">
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
          <div className="space-y-5">
            <SeccionCompras filas={compras} oscuro={darkMode} acciones={<BotonesExportar oscuro={darkMode} onExcel={exportarComprasExcel} onPDF={exportarComprasPDF} />} />
            <SeccionVentas
              sucursales={sucursales}
              dias={dias}
              ventas={ventas}
              campo={campo}
              setCampo={setCampo}
              onCambiar={cambiarVenta}
              onGuardar={guardarVenta}
              oscuro={darkMode}
              acciones={<BotonesExportar oscuro={darkMode} onExcel={exportarVentasExcel} onPDF={exportarVentasPDF} />}
            />
            <SeccionInventario
              proveedores={proveedores}
              dias={dias}
              diaIdx={diaIdx}
              setDiaIdx={setDiaIdx}
              inventario={inventario}
              onCambiar={cambiarInventario}
              onGuardar={guardarInventario}
              onTraerAyer={traerSaldoAyer}
              oscuro={darkMode}
              acciones={<BotonesExportar oscuro={darkMode} onExcel={exportarInventarioExcel} onPDF={exportarInventarioPDF} />}
            />
          </div>
        )}

        {guardando && (
          <div className="pointer-events-none fixed bottom-4 right-4 flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white shadow-lg">
            <Loader2 className="animate-spin" size={14} /> Guardando...
          </div>
        )}
      </div>
    </main>
  );
}
