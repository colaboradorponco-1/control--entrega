import { Pencil, Plus } from 'lucide-react';
import { aISO, DIAS, formatoBs, formatoNumero } from './planillaUtils';

const CAMPOS = [
  { clave: 'importe_bs', etiqueta: 'Importe (Bs)', decimales: true },
  { clave: 'unidades', etiqueta: 'Unidades', decimales: false },
  { clave: 'transacciones', etiqueta: 'Transacciones', decimales: false },
];

export default function SeccionVentas({
  sucursales,
  dias,
  ventas,
  campo,
  setCampo,
  filtroSucursal,
  onFiltroSucursal,
  oscuro,
  acciones,
  onIniciar,
  onEditar,
}) {
  const borde = oscuro ? 'border-slate-800' : 'border-gray-200';
  const cabecera = oscuro ? 'bg-slate-900 text-slate-300' : 'bg-gray-50 text-gray-600';
  const texto = oscuro ? 'text-slate-200' : 'text-gray-800';
  const muted = oscuro ? 'text-slate-400' : 'text-gray-500';
  const definicion = CAMPOS.find((opcion) => opcion.clave === campo);
  const formatear = (numero) => campo === 'importe_bs' ? formatoBs(numero) : formatoNumero(numero, 0);
  const tieneDatosGuardados = (sucursal) => dias.some((dia) => ventas.has(`${aISO(dia)}|${sucursal.id}`));
  const sucursalesGuardadas = sucursales.filter(tieneDatosGuardados);
  const sucursalesVisibles = filtroSucursal === 'todas'
    ? sucursalesGuardadas
    : sucursalesGuardadas.filter((sucursal) => String(sucursal.id) === filtroSucursal);

  const totalFila = (sucursalId) => dias.reduce((total, dia) => (
    total + (Number(ventas.get(`${aISO(dia)}|${sucursalId}`)?.[campo]) || 0)
  ), 0);
  const totalDia = (iso) => sucursalesVisibles.reduce((total, sucursal) => (
    total + (Number(ventas.get(`${iso}|${sucursal.id}`)?.[campo]) || 0)
  ), 0);
  const totalSemana = sucursalesVisibles.reduce((total, sucursal) => total + totalFila(sucursal.id), 0);

  return (
    <section className={`rounded-2xl border ${borde}`}>
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${borde}`}>
        <div>
          <h2 className={`text-base font-black ${texto}`}>2. Control de Ventas por Sucursal</h2>
          <p className={`mt-0.5 text-xs ${muted}`}>Consulta los datos guardados y abre una sucursal para editar su planilla.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`text-xs font-semibold ${muted}`}>
            Sucursal
            <select
              value={filtroSucursal}
              onChange={(evento) => onFiltroSucursal(evento.target.value)}
              className={`ml-2 rounded-lg border px-2.5 py-2 text-xs ${oscuro ? 'border-slate-700 bg-slate-950 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
            >
              <option value="todas">Todas con datos</option>
              {sucursales.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>
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

      {sucursalesVisibles.length === 0 ? (
        <p className={`px-4 py-6 text-sm ${muted}`}>
          {sucursalesGuardadas.length ? 'La sucursal seleccionada no tiene datos guardados esta semana.' : 'No hay ventas guardadas esta semana.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className={cabecera}>
              <tr>
                <th className="sticky left-0 px-3 py-2 text-left font-semibold">Sucursal</th>
                {dias.map((dia, indice) => (
                  <th key={aISO(dia)} className="px-2 py-2 text-center font-semibold">{DIAS[indice]}</th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">Total</th>
                <th className="px-3 py-2 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className={texto}>
              {sucursalesVisibles.map((sucursal) => (
                <tr key={sucursal.id} className={`border-t ${borde}`}>
                  <td className={`sticky left-0 px-3 py-2 font-semibold ${oscuro ? 'bg-slate-950' : 'bg-white'}`}>
                    {sucursal.nombre}
                    <span className={`ml-1 text-[10px] ${muted}`}>{sucursal.sector}</span>
                  </td>
                  {dias.map((dia) => {
                    const fila = ventas.get(`${aISO(dia)}|${sucursal.id}`);
                    return (
                      <td key={aISO(dia)} className="px-2 py-2 text-center tabular-nums">
                        {fila ? formatear(fila[campo]) : '—'}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{formatear(totalFila(sucursal.id))}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onEditar(sucursal)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${borde} ${muted} hover:text-amber-500`}
                    >
                      <Pencil size={13} /> Editar
                    </button>
                  </td>
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
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p className={`px-3 py-2 text-xs ${muted}`}>Mostrando: {definicion.etiqueta}</p>
        </div>
      )}
    </section>
  );
}
