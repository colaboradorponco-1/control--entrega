import CeldaNumero from './CeldaNumero';
import { aISO, DIAS_LARGOS, formatoNumero, sumarDias } from './planillaUtils';

export default function SeccionInventario({
  proveedores, dias, diaIdx, setDiaIdx, inventario, onCambiar, onGuardar, onTraerAyer, oscuro, acciones,
}) {
  const borde = oscuro ? 'border-slate-800' : 'border-gray-200';
  const cabecera = oscuro ? 'bg-slate-900 text-slate-300' : 'bg-gray-50 text-gray-600';
  const texto = oscuro ? 'text-slate-200' : 'text-gray-800';
  const muted = oscuro ? 'text-slate-400' : 'text-gray-500';
  const dia = dias[diaIdx];
  const iso = aISO(dia);
  const isoAyer = aISO(sumarDias(dia, -1));

  const registro = (proveedorId, fechaIso) => inventario.get(`${fechaIso}|${proveedorId}`) || {};

  const totales = { ayer: 0, entrante: 0, saliente: 0, hoy: 0 };
  for (const proveedor of proveedores) {
    const r = registro(proveedor.id, iso);
    const ayer = Number(r.kilos_ayer || 0);
    const entrante = Number(r.kilos_entrante || 0);
    const saliente = Number(r.kilos_saliente || 0);
    totales.ayer += ayer;
    totales.entrante += entrante;
    totales.saliente += saliente;
    totales.hoy += ayer + entrante - saliente;
  }

  return (
    <section className={`rounded-2xl border ${borde}`}>
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${borde}`}>
        <div>
          <h2 className={`text-base font-black ${texto}`}>3. Control de Stock / Inventario Diario</h2>
          <p className={`mt-0.5 text-xs ${muted}`}>S. HOY = S. AYER + ENTRANTE − SALIENTE. Se calcula sola.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dias.map((d, i) => (
            <button
              key={aISO(d)}
              type="button"
              onClick={() => setDiaIdx(i)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                i === diaIdx
                  ? 'bg-cyan-600 text-white'
                  : oscuro ? 'bg-slate-900 text-slate-300 hover:bg-slate-800' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {DIAS_LARGOS[i].slice(0, 3)}
            </button>
          ))}
        </div>
      </header>

      <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs ${borde}`}>
        <span className={muted}>Día: {DIAS_LARGOS[diaIdx]} {iso}</span>
        <div className="flex flex-wrap items-center gap-2">
          {acciones}
          <button
            type="button"
            onClick={() => onTraerAyer({ fechaActual: iso, fechaAyer: isoAyer })}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 font-semibold text-cyan-700 transition hover:bg-cyan-500/20"
          >
            Traer saldo de ayer
          </button>
        </div>
      </div>

      {proveedores.length === 0 ? (
        <p className={`px-4 py-6 text-sm ${muted}`}>No hay proveedores registrados.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className={cabecera}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Proveedor</th>
                <th className="px-3 py-2 text-center font-semibold">S. AYER</th>
                <th className="px-3 py-2 text-center font-semibold">ENTRANTE</th>
                <th className="px-3 py-2 text-center font-semibold">SALIENTE</th>
                <th className="px-3 py-2 text-center font-semibold">S. HOY</th>
              </tr>
            </thead>
            <tbody className={texto}>
              {proveedores.map((proveedor) => {
                const r = registro(proveedor.id, iso);
                const ayer = Number(r.kilos_ayer || 0);
                const entrante = Number(r.kilos_entrante || 0);
                const saliente = Number(r.kilos_saliente || 0);
                const hoy = ayer + entrante - saliente;
                return (
                  <tr key={proveedor.id} className={`border-t ${borde}`}>
                    <td className="px-3 py-1.5 font-semibold">{proveedor.nombre}</td>
                    {['kilos_ayer', 'kilos_entrante', 'kilos_saliente'].map((campo) => (
                      <td key={campo} className="px-3 py-1.5 text-center">
                        <CeldaNumero
                          valor={r[campo] ?? ''}
                          oscuro={oscuro}
                          onCambiar={(valor) => onCambiar({ fecha: iso, proveedorId: proveedor.id, campo, valor })}
                          onGuardar={() => onGuardar({ fecha: iso, proveedorId: proveedor.id })}
                        />
                      </td>
                    ))}
                    <td className={`px-3 py-1.5 text-center font-bold tabular-nums ${hoy < 0 ? 'text-red-500' : ''}`}>
                      {formatoNumero(hoy)}
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
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
