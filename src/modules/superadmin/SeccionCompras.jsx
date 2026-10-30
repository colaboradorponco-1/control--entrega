import { formatoBs, formatoNumero } from './planillaUtils';

const METRICAS = [
  { campo: 'kilos', etiqueta: 'Kg.', decimales: 2 },
  { campo: 'precio', etiqueta: 'Precio (Bs/kg)', decimales: 2, dinero: true },
  { campo: 'unidades', etiqueta: 'Ud.', decimales: 0 },
  { campo: 'total', etiqueta: 'Total (Bs)', decimales: 2, dinero: true },
  { campo: 'promedio', etiqueta: 'Prom. (kg/ud.)', decimales: 2 },
];

export default function SeccionCompras({ reporte, oscuro, acciones }) {
  const borde = oscuro ? 'border-slate-800' : 'border-gray-200';
  const cabecera = oscuro ? 'bg-slate-900 text-slate-300' : 'bg-gray-50 text-gray-600';
  const texto = oscuro ? 'text-slate-200' : 'text-gray-800';
  const muted = oscuro ? 'text-slate-400' : 'text-gray-500';
  const formatear = (metrica, valor) => (
    metrica.dinero
      ? formatoBs(valor)
      : formatoNumero(valor, metrica.decimales)
  );

  return (
    <section className={`rounded-2xl border ${borde}`}>
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${borde}`}>
        <div>
          <h2 className={`text-base font-black ${texto}`}>1. Registro de Compras por Proveedor</h2>
          <p className={`mt-0.5 text-xs ${muted}`}>Kg., precio, unidades, total y promedio por cada día y el total semanal.</p>
        </div>
        {acciones}
      </header>

      {reporte.filas.length === 0 ? (
        <p className={`px-4 py-6 text-sm ${muted}`}>No hay proveedores ni recepciones registradas esta semana.</p>
      ) : (
        <div className="space-y-4 p-3 md:p-4">
          {reporte.filas.map((proveedor) => (
            <div key={proveedor.id} className={`overflow-x-auto rounded-lg border ${borde}`}>
              <table className="w-full min-w-[1120px] border-collapse text-sm">
                <thead className={cabecera}>
                  <tr>
                    <th colSpan="2" className={`border-b border-r px-3 py-2 text-left font-semibold ${borde}`}>
                      N. DE RECIBO · {proveedor.nombre}
                    </th>
                    {proveedor.dias.map((dia) => (
                      <th key={dia.fecha} className={`border-b border-r px-2 py-2 text-center font-medium ${borde}`}>
                        {dia.recibos.length ? dia.recibos.join(', ') : '—'}
                      </th>
                    ))}
                    <th className={`border-b px-3 py-2 text-right font-semibold ${borde}`}>TOTAL SEMANA</th>
                  </tr>
                  <tr className="text-xs uppercase">
                    <th className={`border-b border-r px-3 py-2 text-left font-semibold ${borde}`}>Descripción</th>
                    <th className={`border-b border-r px-3 py-2 text-left font-semibold ${borde}`}>Unidad</th>
                    {proveedor.dias.map((dia) => (
                      <th key={dia.fecha} className={`border-b border-r px-2 py-2 text-center font-semibold ${borde}`}>
                        {formatoFecha(dia.fecha)}
                      </th>
                    ))}
                    <th className={`border-b px-3 py-2 text-right font-semibold ${borde}`}></th>
                  </tr>
                </thead>
                <tbody className={texto}>
                  {METRICAS.map((metrica, indice) => (
                    <tr
                      key={metrica.campo}
                      className={`${indice === 3 ? cabecera : ''} border-t ${borde}`}
                    >
                      {indice === 0 && (
                        <th rowSpan={METRICAS.length} className={`border-r px-3 py-2 text-left align-middle font-bold ${borde}`}>
                          {proveedor.nombre}
                        </th>
                      )}
                      <th className={`border-r px-3 py-2 text-left font-medium ${borde}`}>{metrica.etiqueta}</th>
                      {proveedor.dias.map((dia) => (
                        <td key={dia.fecha} className={`border-r px-2 py-2 text-right tabular-nums ${borde}`}>
                          {formatear(metrica, dia[metrica.campo])}
                        </td>
                      ))}
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${indice === 3 ? 'text-cyan-500' : ''}`}>
                        {formatear(metrica, proveedor.total[metrica.campo])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div className={`overflow-x-auto rounded-lg border-2 ${borde}`}>
            <table className="w-full min-w-[1120px] border-collapse text-sm">
              <tbody className={`${cabecera} font-black`}>
                {METRICAS.map((metrica, indice) => (
                  <tr key={metrica.campo} className={`border-t ${borde}`}>
                    {indice === 0 && (
                      <th rowSpan={METRICAS.length} className={`border-r px-3 py-2 text-left align-middle ${borde}`}>
                        TOTAL GENERAL
                      </th>
                    )}
                    <th className={`border-r px-3 py-2 text-left ${borde}`}>{metrica.etiqueta}</th>
                    {reporte.totalesPorDia.map((dia) => (
                      <td key={dia.fecha} className={`border-r px-2 py-2 text-right tabular-nums ${borde}`}>
                        {formatear(metrica, dia[metrica.campo])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums text-cyan-500">
                      {formatear(metrica, reporte.totalSemana[metrica.campo])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function formatoFecha(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}
