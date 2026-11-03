import { Download, FileText, MoreHorizontal, Pencil, Plus, RotateCcw } from 'lucide-react';
import { aISO, DIAS_LARGOS, formatoNumero, sumarDias } from './planillaUtils';

export default function SeccionInventario({
  proveedores,
  dias,
  diaIdx,
  setDiaIdx,
  inventario,
  inventarioPlanta,
  ajustesInventario,
  filtroProveedor,
  onFiltroProveedor,
  onTraerAyer,
  oscuro,
  onExportarExcel,
  onExportarPDF,
  onIniciar,
  onEditar,
  onAbrirAjuste,
}) {
  const borde = oscuro ? 'border-slate-800' : 'border-gray-200';
  const cabecera = oscuro ? 'bg-slate-900 text-slate-300' : 'bg-gray-50 text-gray-600';
  const texto = oscuro ? 'text-slate-200' : 'text-gray-800';
  const muted = oscuro ? 'text-slate-400' : 'text-gray-500';
  const dia = dias[diaIdx];
  const iso = aISO(dia);
  const isoAyer = aISO(sumarDias(dia, -1));
  const stockPlanta = inventarioPlanta.find((fila) => fila.fecha === iso);
  const ajustesDelDia = ajustesInventario.filter((ajuste) => ajuste.fecha === iso);
  const ajusteKilosRegistrado = ajustesDelDia.reduce(
    (total, ajuste) => total + Number(ajuste.ajuste_kilos || 0),
    0,
  );
  const ajusteUnidadesRegistrado = ajustesDelDia.reduce(
    (total, ajuste) => total + Number(ajuste.ajuste_unidades || 0),
    0,
  );
  const ajustesNoCoinciden = ajustesDelDia.length > 0 && (
    !stockPlanta
    || Math.abs(ajusteKilosRegistrado - Number(stockPlanta.kilos_ajustados || 0)) > 0.01
    || ajusteUnidadesRegistrado !== Number(stockPlanta.unidades_ajustadas || 0)
  );
  const proveedoresGuardados = proveedores.filter((proveedor) => inventario.has(`${iso}|${proveedor.id}`));
  const proveedoresVisibles = filtroProveedor === 'todos'
    ? proveedoresGuardados
    : proveedoresGuardados.filter((proveedor) => String(proveedor.id) === filtroProveedor);

  const registro = (proveedorId) => inventario.get(`${iso}|${proveedorId}`) || {};
  const totales = proveedoresVisibles.reduce((suma, proveedor) => {
    const fila = registro(proveedor.id);
    const ayer = Number(fila.kilos_ayer || 0);
    const entrante = Number(fila.kilos_entrante || 0);
    const saliente = Number(fila.kilos_saliente || 0);
    return {
      ayer: suma.ayer + ayer,
      entrante: suma.entrante + entrante,
      saliente: suma.saliente + saliente,
      hoy: suma.hoy + ayer + entrante - saliente,
    };
  }, { ayer: 0, entrante: 0, saliente: 0, hoy: 0 });

  return (
    <section className={`rounded-2xl border ${borde}`}>
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${borde}`}>
        <div>
          <h2 className={`text-base font-black ${texto}`}>3. Control de Stock / Inventario Diario</h2>
          <p className={`mt-0.5 text-xs ${muted}`}>El saldo se calcula automáticamente. Solo corrígelo si el conteo físico es diferente.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dias.map((d, indice) => (
            <button
              key={aISO(d)}
              type="button"
              onClick={() => setDiaIdx(indice)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                indice === diaIdx
                  ? 'bg-cyan-600 text-white'
                  : oscuro ? 'bg-slate-900 text-slate-300 hover:bg-slate-800' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {DIAS_LARGOS[indice].slice(0, 3)}
            </button>
          ))}
        </div>
      </header>

      <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs ${borde}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={muted}>Día: {DIAS_LARGOS[diaIdx]} {iso}</span>
          <details className={`relative rounded-lg border ${borde}`}>
            <summary className={`flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 font-semibold ${muted}`}>
              <MoreHorizontal size={15} /> Más opciones
            </summary>
            <div className={`absolute left-0 top-full z-20 mt-1 flex min-w-52 flex-col rounded-lg border p-1 shadow-lg ${oscuro ? 'border-slate-700 bg-slate-900' : 'border-gray-200 bg-white'}`}>
              <button
                type="button"
                onClick={() => onTraerAyer({ fechaActual: iso, fechaAyer: isoAyer })}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold ${texto} hover:bg-cyan-500/10`}
              >
                <RotateCcw size={14} /> Usar saldo manual de ayer
              </button>
              <div className={`my-1 border-t ${borde}`} />
              <button
                type="button"
                onClick={onExportarExcel}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold ${texto} hover:bg-cyan-500/10`}
              >
                <Download size={14} /> Descargar Excel
              </button>
              <button
                type="button"
                onClick={onExportarPDF}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold ${texto} hover:bg-cyan-500/10`}
              >
                <FileText size={14} /> Descargar PDF
              </button>
            </div>
          </details>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`flex items-center gap-2 font-semibold ${muted}`}>
            Proveedor
            <select
              value={filtroProveedor}
              onChange={(evento) => onFiltroProveedor(evento.target.value)}
              className={`rounded-lg border px-2.5 py-2 text-xs ${oscuro ? 'border-slate-700 bg-slate-950 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
            >
              <option value="todos">Todos con datos</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onIniciar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-amber-950 transition hover:bg-amber-300"
          >
            <Plus size={15} /> Agregar movimiento por proveedor
          </button>
        </div>
      </div>

      <div className={`border-b p-4 ${borde}`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className={`text-sm font-bold ${texto}`}>Saldo automático de planta</h3>
            <p className={`mt-0.5 text-xs ${muted}`}>Saldo calculado con recepciones y despachos. Corrígelo solo si el conteo físico es diferente.</p>
          </div>
          <button
            type="button"
            onClick={onAbrirAjuste}
            className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-amber-950 transition hover:bg-amber-300"
          >
            Corregir si el conteo no coincide
          </button>
        </div>
        {stockPlanta ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className={cabecera}>
                <tr>
                  {['Saldo anterior (kg)', 'Entró (kg)', 'Salió (kg)', 'Diferencia aplicada (kg)', 'Saldo calculado (kg)', 'Diferencia aplicada (unidades)', 'Total unidades'].map((titulo) => (
                    <th key={titulo} className="px-3 py-2 text-right font-semibold">{titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={texto}>
                <tr className={`border-t ${borde}`}>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoNumero(stockPlanta.kilos_iniciales)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoNumero(stockPlanta.kilos_recibidos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoNumero(stockPlanta.kilos_despachados)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoNumero(stockPlanta.kilos_ajustados)}</td>
                  <td className={`px-3 py-2 text-right font-black tabular-nums ${Number(stockPlanta.kilos_saldo) < 0 ? 'text-red-500' : ''}`}>
                    {formatoNumero(stockPlanta.kilos_saldo)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoNumero(stockPlanta.unidades_ajustadas, 0)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{formatoNumero(stockPlanta.unidades_saldo, 0)}</td>
                </tr>
              </tbody>
            </table>
            <p className={`px-3 py-2 text-xs ${muted}`}>
              Saldo final = inicial + recibido − despachado + corrección.
            </p>
          </div>
        ) : (
          <p className={`rounded-lg px-3 py-3 text-xs ${muted} ${oscuro ? 'bg-slate-950/60' : 'bg-gray-50'}`}>
            No hay movimientos de planta guardados para este día.
          </p>
        )}
        {ajustesNoCoinciden && (
          <p role="alert" className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            Hay una diferencia entre las correcciones guardadas y el saldo calculado: el historial suma {formatoNumero(ajusteKilosRegistrado)} kg y {formatoNumero(ajusteUnidadesRegistrado, 0)} unidades, pero la tabla muestra {formatoNumero(stockPlanta?.kilos_ajustados)} kg y {formatoNumero(stockPlanta?.unidades_ajustadas, 0)}. Recarga antes de registrar otra corrección.
          </p>
        )}
        {ajustesDelDia.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className={`text-xs font-bold ${texto}`}>Historial de correcciones (diferencia aplicada)</p>
            {ajustesDelDia.map((ajuste) => (
              <p key={ajuste.id} className={`rounded-lg px-3 py-2 text-xs ${oscuro ? 'bg-slate-950/60 text-slate-300' : 'bg-gray-50 text-gray-700'}`}>
                {Number(ajuste.ajuste_kilos) > 0 ? '+' : ''}{formatoNumero(ajuste.ajuste_kilos)} kg · {Number(ajuste.ajuste_unidades) > 0 ? '+' : ''}{formatoNumero(ajuste.ajuste_unidades, 0)} unidades — {ajuste.motivo}
              </p>
            ))}
          </div>
        )}
      </div>

      {proveedoresVisibles.length === 0 ? (
        <div className="px-4 py-5">
          <h3 className={`text-sm font-bold ${texto}`}>Detalle manual por proveedor</h3>
          <p className={`mt-1 text-sm ${muted}`}>
            {proveedoresGuardados.length ? 'El proveedor seleccionado no tiene inventario manual guardado para este día.' : 'No hay detalle manual por proveedor para este día.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <h3 className={`px-4 pt-4 text-sm font-bold ${texto}`}>Detalle manual por proveedor</h3>
          <table className="w-full min-w-[700px] text-sm">
            <thead className={cabecera}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Proveedor</th>
                <th className="px-3 py-2 text-center font-semibold">S. AYER MANUAL</th>
                <th className="px-3 py-2 text-center font-semibold">ENTRANTE MANUAL</th>
                <th className="px-3 py-2 text-center font-semibold">SALIENTE MANUAL</th>
                <th className="px-3 py-2 text-center font-semibold">S. HOY MANUAL</th>
                <th className="px-3 py-2 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className={texto}>
              {proveedoresVisibles.map((proveedor) => {
                const fila = registro(proveedor.id);
                const ayer = Number(fila.kilos_ayer || 0);
                const entrante = Number(fila.kilos_entrante || 0);
                const saliente = Number(fila.kilos_saliente || 0);
                const hoy = ayer + entrante - saliente;
                return (
                  <tr key={proveedor.id} className={`border-t ${borde}`}>
                    <td className="px-3 py-2 font-semibold">{proveedor.nombre}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{formatoNumero(ayer)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{formatoNumero(entrante)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{formatoNumero(saliente)}</td>
                    <td className={`px-3 py-2 text-center font-bold tabular-nums ${hoy < 0 ? 'text-red-500' : ''}`}>{formatoNumero(hoy)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onEditar(proveedor, iso)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${borde} ${muted} hover:text-amber-500`}
                      >
                        <Pencil size={13} /> Editar semana
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className={`${cabecera} border-t ${borde} font-black`}>
              <tr>
                <td className="px-3 py-2">TOTAL</td>
                <td className="px-3 py-2 text-center tabular-nums">{formatoNumero(totales.ayer)}</td>
                <td className="px-3 py-2 text-center tabular-nums">{formatoNumero(totales.entrante)}</td>
                <td className="px-3 py-2 text-center tabular-nums">{formatoNumero(totales.saliente)}</td>
                <td className="px-3 py-2 text-center tabular-nums">{formatoNumero(totales.hoy)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
