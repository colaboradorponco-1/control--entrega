import { Pencil, Plus } from 'lucide-react';
import { aISO, DIAS_LARGOS, formatoNumero, sumarDias } from './planillaUtils';

export default function SeccionInventario({
  proveedores,
  dias,
  diaIdx,
  setDiaIdx,
  inventario,
  filtroProveedor,
  onFiltroProveedor,
  onTraerAyer,
  oscuro,
  acciones,
  onIniciar,
  onEditar,
}) {
  const borde = oscuro ? 'border-slate-800' : 'border-gray-200';
  const cabecera = oscuro ? 'bg-slate-900 text-slate-300' : 'bg-gray-50 text-gray-600';
  const texto = oscuro ? 'text-slate-200' : 'text-gray-800';
  const muted = oscuro ? 'text-slate-400' : 'text-gray-500';
  const dia = dias[diaIdx];
  const iso = aISO(dia);
  const isoAyer = aISO(sumarDias(dia, -1));
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
          <p className={`mt-0.5 text-xs ${muted}`}>Consulta los saldos guardados; edita desde la plantilla semanal.</p>
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
        <span className={muted}>Día: {DIAS_LARGOS[diaIdx]} {iso}</span>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`font-semibold ${muted}`}>
            Proveedor
            <select
              value={filtroProveedor}
              onChange={(evento) => onFiltroProveedor(evento.target.value)}
              className={`ml-2 rounded-lg border px-2.5 py-2 text-xs ${oscuro ? 'border-slate-700 bg-slate-950 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
            >
              <option value="todos">Todos con datos</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
              ))}
            </select>
          </label>
          {acciones}
          <button
            type="button"
            onClick={onIniciar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-amber-950 transition hover:bg-amber-300"
          >
            <Plus size={15} /> Iniciar plantilla
          </button>
          <button
            type="button"
            onClick={() => onTraerAyer({ fechaActual: iso, fechaAyer: isoAyer })}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 font-semibold text-cyan-700 transition hover:bg-cyan-500/20"
          >
            Traer saldo de ayer
          </button>
        </div>
      </div>

      {proveedoresVisibles.length === 0 ? (
        <p className={`px-4 py-6 text-sm ${muted}`}>
          {proveedoresGuardados.length ? 'El proveedor seleccionado no tiene inventario guardado para este día.' : 'No hay inventario guardado para este día.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className={cabecera}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Proveedor</th>
                <th className="px-3 py-2 text-center font-semibold">S. AYER</th>
                <th className="px-3 py-2 text-center font-semibold">ENTRANTE</th>
                <th className="px-3 py-2 text-center font-semibold">SALIENTE</th>
                <th className="px-3 py-2 text-center font-semibold">S. HOY</th>
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
