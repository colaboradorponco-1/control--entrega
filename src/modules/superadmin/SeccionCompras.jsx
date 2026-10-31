import { formatoBs, formatoNumero } from './planillaUtils';
import { Archive, FileSpreadsheet, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';

const COMPRAS_VACIAS = [];

const METRICAS = [
  { campo: 'kilos', etiqueta: 'Kg.', decimales: 2 },
  { campo: 'precio', etiqueta: 'Precio (Bs/kg)', decimales: 2, dinero: true },
  { campo: 'unidades', etiqueta: 'Ud.', decimales: 0 },
  { campo: 'total', etiqueta: 'Total (Bs)', decimales: 2, dinero: true },
  { campo: 'promedio', etiqueta: 'Prom. (kg/ud.)', decimales: 2 },
];

export default function SeccionCompras({
  reporte,
  compras = COMPRAS_VACIAS,
  proveedores,
  proveedoresArchivados,
  mostrarArchivadas,
  onMostrarArchivadas,
  filtroProveedor,
  onFiltroProveedor,
  oscuro,
  rango,
  semanaInicio,
  acciones,
  onIniciar,
  onEditarPlanilla,
  onArchivar,
  onRestaurar,
  onEliminar,
  procesando = false,
}) {
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
        <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center lg:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex overflow-hidden rounded-lg border ${borde}`}>
              <button
                type="button"
                onClick={() => onMostrarArchivadas(false)}
                aria-pressed={!mostrarArchivadas}
                className={`px-3 py-2 text-xs font-semibold ${
                  !mostrarArchivadas
                    ? 'bg-cyan-600 text-white'
                    : oscuro ? 'bg-slate-900 text-slate-300' : 'bg-white text-gray-600'
                }`}
              >
                Activas
              </button>
              <button
                type="button"
                onClick={() => onMostrarArchivadas(true)}
                aria-pressed={mostrarArchivadas}
                className={`px-3 py-2 text-xs font-semibold ${
                  mostrarArchivadas
                    ? 'bg-cyan-600 text-white'
                    : oscuro ? 'bg-slate-900 text-slate-300' : 'bg-white text-gray-600'
                }`}
              >
                Archivadas ({proveedoresArchivados.length})
              </button>
            </div>
            <label className={`flex items-center gap-2 text-xs font-semibold ${muted}`}>
              Proveedor
              <select
                value={filtroProveedor}
                onChange={(evento) => onFiltroProveedor(evento.target.value)}
                className={`rounded-lg border px-2.5 py-2 text-xs ${oscuro ? 'border-slate-700 bg-slate-950 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
              >
                <option value="todos">{mostrarArchivadas ? 'Todos archivados' : 'Todos con datos'}</option>
                {proveedores.map((proveedor) => (
                  <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                ))}
              </select>
            </label>
          </div>
          {!mostrarArchivadas && (
            <div className="flex flex-wrap items-center gap-2 lg:border-l lg:border-slate-700 lg:pl-3">
              <button
                type="button"
                onClick={onIniciar}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-amber-950 transition hover:bg-amber-300"
              >
                <Plus size={15} /> Iniciar plantilla
              </button>
              {acciones}
            </div>
          )}
        </div>
      </header>

      {mostrarArchivadas ? (
        proveedoresArchivados.length === 0 ? (
          <p className={`px-4 py-6 text-sm ${muted}`}>No hay planillas archivadas para esta semana.</p>
        ) : (
          <div className="overflow-x-auto p-3 md:p-4">
            <table className="w-full min-w-[760px] text-sm">
              <thead className={cabecera}>
                <tr>
                  {['Proveedor', 'Semana', 'Recibos', 'Total (Bs)', 'Acciones'].map((titulo) => (
                    <th key={titulo} className="px-3 py-2 text-left font-semibold">{titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={texto}>
                {proveedoresArchivados.map((planilla) => {
                  const recibos = compras.filter(
                    (compra) => String(compra.proveedor_id) === String(planilla.proveedor_id),
                  );
                  const total = recibos.reduce(
                    (suma, compra) => suma + Number(
                      compra.total_monto ?? Number(compra.kilos || 0) * Number(compra.precio_por_kilo || 0),
                    ),
                    0,
                  );
                  return (
                    <tr key={`${planilla.proveedor_id}|${planilla.semana_inicio}`} className={`border-t ${borde}`}>
                      <td className="px-3 py-2 font-semibold">{planilla.nombre}</td>
                      <td className="px-3 py-2">{rango}</td>
                      <td className="px-3 py-2">{recibos.length}</td>
                      <td className="px-3 py-2">{formatoBs(total)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onRestaurar(planilla)}
                            disabled={procesando}
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 px-2.5 py-1.5 text-xs font-semibold text-cyan-600 hover:bg-cyan-500/10"
                          >
                            <RotateCcw size={13} /> Restaurar
                          </button>
                          <button
                            type="button"
                            onClick={() => onEliminar(planilla)}
                            disabled={procesando}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 size={13} /> Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : reporte.filas.length === 0 ? (
        <p className={`px-4 py-6 text-sm ${muted}`}>No hay proveedores ni recepciones registradas esta semana.</p>
      ) : (
        <div className="space-y-4 p-3 md:p-4">
          {reporte.filas.map((proveedor) => (
            <div key={proveedor.id} className={`overflow-x-auto rounded-lg border ${borde}`}>
              <table className="w-full min-w-[1120px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: '26%' }} />
                  <col style={{ width: '19%' }} />
                  {proveedor.dias.map((dia) => <col key={dia.fecha} style={{ width: '6%' }} />)}
                  <col style={{ width: '13%' }} />
                </colgroup>
                <thead className={cabecera}>
                  <tr>
                    <th colSpan="2" className={`border-b border-r px-3 py-2 text-left font-semibold ${borde}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>N. DE RECIBO</span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onEditarPlanilla(proveedor)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-400 px-3 py-2 text-xs font-black text-amber-950 shadow-sm transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                          >
                            <FileSpreadsheet size={15} /> Editar planilla
                          </button>
                          <button
                            type="button"
                            onClick={() => onArchivar({
                              proveedor_id: proveedor.id,
                              semana_inicio: semanaInicio,
                            })}
                            disabled={procesando}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:cursor-wait disabled:opacity-60 ${borde} ${muted} hover:bg-slate-500/10`}
                          >
                            {procesando
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Archive size={14} />}
                            {procesando ? 'Archivando...' : 'Archivar'}
                          </button>
                        </div>
                      </div>
                    </th>
                    {proveedor.dias.map((dia) => (
                      <th key={dia.fecha} className={`border-b border-r px-2 py-2 text-center font-medium ${borde}`}>
                        {dia.recibos.length ? dia.recibos.join(', ') : '—'}
                      </th>
                    ))}
                    <th className={`border-b px-3 py-2 text-right font-semibold ${borde}`}>TOTAL SEMANA</th>
                  </tr>
                  <tr className="text-xs uppercase">
                    <th className={`border-b border-r px-3 py-2 text-left font-semibold ${borde}`}>Proveedor</th>
                    <th className={`border-b border-r px-3 py-2 text-left font-semibold ${borde}`}>Concepto</th>
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
                          {dia.recibos.length ? formatear(metrica, dia[metrica.campo]) : '—'}
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
            <table className="w-full min-w-[1120px] table-fixed border-collapse text-sm">
              <colgroup>
                <col style={{ width: '26%' }} />
                <col style={{ width: '19%' }} />
                {reporte.totalesPorDia.map((dia) => <col key={dia.fecha} style={{ width: '6%' }} />)}
                <col style={{ width: '13%' }} />
              </colgroup>
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
                        {compras.some((compra) => compra.fecha === dia.fecha)
                          ? formatear(metrica, dia[metrica.campo])
                          : '—'}
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

      <div className={`border-t p-3 md:p-4 ${borde}`}>
        <h3 className={`mb-2 text-sm font-bold ${texto}`}>Detalle de recibos</h3>
        {compras.length === 0 ? (
          <p className={`text-sm ${muted}`}>No hay recibos para esta semana.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className={cabecera}>
                <tr>
                  {['Fecha', 'Proveedor', 'N. recibo', 'Kg.', 'Unidades', 'Precio/kg', 'Total', 'Origen'].map((titulo) => (
                    <th key={titulo} className="px-3 py-2 text-left font-semibold">{titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={texto}>
                {compras.map((compra) => (
                  <tr key={compra.id} className={`border-t ${borde}`}>
                    <td className="px-3 py-2">{formatoFecha(compra.fecha)}</td>
                    <td className="px-3 py-2">{compra.proveedores?.nombre || 'Sin proveedor'}</td>
                    <td className="px-3 py-2">{compra.numero_recibo}</td>
                    <td className="px-3 py-2">{formatoNumero(compra.kilos)}</td>
                    <td className="px-3 py-2">{formatoNumero(compra.unidades, 0)}</td>
                    <td className="px-3 py-2">{formatoBs(compra.precio_por_kilo)}</td>
                    <td className="px-3 py-2">{formatoBs(compra.total_monto)}</td>
                    <td className="px-3 py-2">
                      {compra.origen_registro === 'MANUAL'
                        ? 'Manual'
                        : compra.origen_registro === 'CORREGIDO' ? 'Corregido' : 'Planta'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
