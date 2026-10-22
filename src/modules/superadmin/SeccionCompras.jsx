import { formatoBs, formatoNumero } from './planillaUtils';

export default function SeccionCompras({ filas, oscuro, acciones }) {
  const borde = oscuro ? 'border-slate-800' : 'border-gray-200';
  const cabecera = oscuro ? 'bg-slate-900 text-slate-300' : 'bg-gray-50 text-gray-600';
  const texto = oscuro ? 'text-slate-200' : 'text-gray-800';
  const muted = oscuro ? 'text-slate-400' : 'text-gray-500';

  const totalKg = filas.reduce((acc, fila) => acc + fila.kg, 0);
  const totalUnidades = filas.reduce((acc, fila) => acc + fila.unidades, 0);
  const totalMonto = filas.reduce((acc, fila) => acc + fila.monto, 0);
  const precioGlobal = totalKg > 0 ? totalMonto / totalKg : 0;

  return (
    <section className={`rounded-2xl border ${borde}`}>
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${borde}`}>
        <div>
          <h2 className={`text-base font-black ${texto}`}>1. Registro de Compras y Costos Promedio</h2>
          <p className={`mt-0.5 text-xs ${muted}`}>Se arma automáticamente desde las recepciones de la semana.</p>
        </div>
        {acciones}
      </header>

      {filas.length === 0 ? (
        <p className={`px-4 py-6 text-sm ${muted}`}>No hay recepciones registradas esta semana.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className={cabecera}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Proveedor</th>
                <th className="px-3 py-2 text-right font-semibold">Kg</th>
                <th className="px-3 py-2 text-right font-semibold">Unidades</th>
                <th className="px-3 py-2 text-right font-semibold">Costo total (Bs)</th>
                <th className="px-3 py-2 text-right font-semibold">Precio prom. (Bs/kg)</th>
              </tr>
            </thead>
            <tbody className={texto}>
              {filas.map((fila) => (
                <tr key={fila.nombre} className={`border-t ${borde}`}>
                  <td className="px-3 py-2 font-semibold">{fila.nombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoNumero(fila.kg)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoNumero(fila.unidades, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoBs(fila.monto)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatoBs(fila.precioProm)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className={`${cabecera} border-t ${borde} font-black`}>
              <tr>
                <td className="px-3 py-2">TOTAL SEMANA</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatoNumero(totalKg)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatoNumero(totalUnidades, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatoBs(totalMonto)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatoBs(precioGlobal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
