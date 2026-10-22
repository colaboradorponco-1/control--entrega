import CeldaNumero from './CeldaNumero';
import { aISO, DIAS, formatoBs, formatoNumero } from './planillaUtils';

const CAMPOS = [
  { clave: 'importe_bs', etiqueta: 'Importe (Bs)', decimales: true },
  { clave: 'unidades', etiqueta: 'Unidades', decimales: false },
  { clave: 'transacciones', etiqueta: 'Transacciones', decimales: false },
];

export default function SeccionVentas({ sucursales, dias, ventas, campo, setCampo, onCambiar, onGuardar, oscuro, acciones }) {
  const borde = oscuro ? 'border-slate-800' : 'border-gray-200';
  const cabecera = oscuro ? 'bg-slate-900 text-slate-300' : 'bg-gray-50 text-gray-600';
  const texto = oscuro ? 'text-slate-200' : 'text-gray-800';
  const muted = oscuro ? 'text-slate-400' : 'text-gray-500';
  const definicion = CAMPOS.find((c) => c.clave === campo);
  const formatear = campo === 'importe_bs' ? formatoBs : (v) => formatoNumero(v, 0);

  const valorDe = (iso, sucursalId) => ventas.get(`${iso}|${sucursalId}`)?.[campo] ?? '';
  const totalFila = (sucursalId) => dias.reduce((acc, dia) => {
    const valor = Number(ventas.get(`${aISO(dia)}|${sucursalId}`)?.[campo] || 0);
    return acc + valor;
  }, 0);
  const totalDia = (iso) => sucursales.reduce((acc, sucursal) => {
    const valor = Number(ventas.get(`${iso}|${sucursal.id}`)?.[campo] || 0);
    return acc + valor;
  }, 0);
  const totalSemana = sucursales.reduce((acc, sucursal) => acc + totalFila(sucursal.id), 0);

  return (
    <section className={`rounded-2xl border ${borde}`}>
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${borde}`}>
        <div>
          <h2 className={`text-base font-black ${texto}`}>2. Control de Ventas por Sucursal</h2>
          <p className={`mt-0.5 text-xs ${muted}`}>Edita y guarda por celda. El total se calcula solo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {acciones}
          <div className={`inline-flex overflow-hidden rounded-lg border ${borde}`}>
            {CAMPOS.map((opcion) => (
              <button
                key={opcion.clave}
                type="button"
                onClick={() => setCampo(opcion.clave)}
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  campo === opcion.clave
                    ? 'bg-cyan-600 text-white'
                    : oscuro ? 'bg-slate-900 text-slate-300 hover:bg-slate-800' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>
        </div>
      </header>

      {sucursales.length === 0 ? (
        <p className={`px-4 py-6 text-sm ${muted}`}>No hay sucursales registradas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className={cabecera}>
              <tr>
                <th className="sticky left-0 px-3 py-2 text-left font-semibold">Sucursal</th>
                {dias.map((dia, i) => (
                  <th key={aISO(dia)} className="px-2 py-2 text-center font-semibold">{DIAS[i]}</th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className={texto}>
              {sucursales.map((sucursal) => (
                <tr key={sucursal.id} className={`border-t ${borde}`}>
                  <td className={`sticky left-0 px-3 py-1.5 font-semibold ${oscuro ? 'bg-slate-950' : 'bg-white'}`}>
                    {sucursal.nombre}
                    <span className={`ml-1 text-[10px] ${muted}`}>{sucursal.sector}</span>
                  </td>
                  {dias.map((dia) => (
                    <td key={aISO(dia)} className="px-2 py-1.5 text-center">
                      <CeldaNumero
                        valor={valorDe(aISO(dia), sucursal.id)}
                        decimales={definicion.decimales}
                        oscuro={oscuro}
                        onCambiar={(valor) => onCambiar({ fecha: aISO(dia), sucursalId: sucursal.id, campo, valor })}
                        onGuardar={() => onGuardar({ fecha: aISO(dia), sucursalId: sucursal.id })}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{formatear(totalFila(sucursal.id))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className={`${cabecera} border-t ${borde} font-black`}>
              <tr>
                <td className="sticky left-0 px-3 py-2">TOTAL DÍA</td>
                {dias.map((dia) => (
                  <td key={aISO(dia)} className="px-2 py-2 text-center tabular-nums">{formatear(totalDia(aISO(dia)))}</td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{formatear(totalSemana)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
