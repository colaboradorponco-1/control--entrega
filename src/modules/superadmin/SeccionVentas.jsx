import { Archive, Eye, LockKeyhole, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import CeldaNumero from './CeldaNumero';
import { aISO, DIAS, formatoBs, formatoNumero, rangoSemana } from './planillaUtils';

const CAMPOS = [
  { clave: 'importe_bs', etiqueta: 'Importe (Bs)', decimales: true },
  { clave: 'unidades', etiqueta: 'Unidades vendidas', decimales: false },
  { clave: 'transacciones', etiqueta: 'Transacciones', decimales: false },
  { clave: 'unidades_entregadas', etiqueta: 'Unidades recibidas', decimales: false },
];

const formatearFechaHora = (valor) => {
  if (!valor) return '—';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/La_Paz',
  }).format(fecha);
};

export default function SeccionVentas({
  sucursales,
  dias,
  ventas,
  entregas,
  campo,
  setCampo,
  oscuro,
  cerrada,
  archivada,
  vistaVentas,
  semanasBandeja,
  planillasArchivadas,
  editando,
  procesando,
  guardando,
  cantidadPendiente,
  acciones,
  onIniciar,
  onEditar,
  onGuardarSemana,
  onCerrar,
  onArchivar,
  onRestaurar,
  onEliminar,
  onCambiarVista,
  onAbrirSemana,
  onVerArchivada,
  onVolverArchivadas,
  onCambiar,
}) {
  const borde = oscuro ? 'border-slate-800' : 'border-gray-200';
  const cabecera = oscuro ? 'bg-slate-900 text-slate-300' : 'bg-gray-50 text-gray-600';
  const texto = oscuro ? 'text-slate-200' : 'text-gray-800';
  const muted = oscuro ? 'text-slate-400' : 'text-gray-500';
  const boton = oscuro
    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
    : 'border-gray-300 text-gray-700 hover:bg-gray-100';
  const formatear = (numero) => campo === 'importe_bs' ? formatoBs(numero) : formatoNumero(numero, 0);
  const valorDia = (sucursalId, dia) => {
    const key = `${aISO(dia)}|${sucursalId}`;
    return campo === 'unidades_entregadas'
      ? entregas.get(key)
      : ventas.get(key)?.[campo];
  };
  const totalFila = (sucursalId) => dias.reduce((total, dia) => (
    total + (Number(valorDia(sucursalId, dia)) || 0)
  ), 0);
  const totalDia = (iso) => sucursales.reduce((total, sucursal) => (
    total + (Number(campo === 'unidades_entregadas'
      ? entregas.get(`${iso}|${sucursal.id}`)
      : ventas.get(`${iso}|${sucursal.id}`)?.[campo]) || 0)
  ), 0);
  const totalSemana = sucursales.reduce((total, sucursal) => total + totalFila(sucursal.id), 0);

  return (
    <section className={`rounded-2xl border ${borde}`}>
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${borde}`}>
        <div>
          <h2 className={`text-base font-black ${texto}`}>
            {vistaVentas === 'bandeja'
              ? 'Bandeja de semanas guardadas'
              : vistaVentas === 'archivadas'
                ? 'Semanas de ventas archivadas'
                : '2. Control de Ventas por Sucursal'}
          </h2>
          <p className={`mt-0.5 text-xs ${muted}`}>
            {vistaVentas === 'bandeja'
              ? 'Las semanas guardadas salen del área de trabajo y puedes continuarlas aquí.'
              : 'Todas las sucursales en una sola plantilla semanal.'}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row xl:items-center">
          {vistaVentas === 'trabajo' && (
            <div className="flex flex-wrap items-center gap-2">
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
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className={`flex items-center gap-2 text-xs font-semibold ${muted}`}>
              Vista
              <select
                value={vistaVentas}
                onChange={(evento) => onCambiarVista(evento.target.value)}
                className={`rounded-lg border px-2.5 py-2 text-xs ${oscuro ? 'border-slate-700 bg-slate-950 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
              >
                <option value="trabajo">Semana de trabajo</option>
                <option value="bandeja">Bandeja ({semanasBandeja.length})</option>
                <option value="archivadas">Archivadas ({planillasArchivadas.length})</option>
              </select>
            </label>
            {vistaVentas === 'bandeja' && (
              <button
                type="button"
                onClick={onIniciar}
                disabled={procesando || guardando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-amber-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                <Plus size={15} /> Iniciar nueva semana
              </button>
            )}
            {vistaVentas === 'trabajo' && !archivada && (
              <div className="flex flex-wrap items-center gap-2 lg:border-l lg:border-slate-700 lg:pl-3">
                <button
                  type="button"
                  onClick={onEditar}
                  disabled={editando || procesando || guardando}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${boton}`}
                >
                  <Pencil size={14} /> Editar
                </button>
                <button
                  type="button"
                  onClick={onGuardarSemana}
                  disabled={!editando || procesando || guardando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-2.5 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={14} /> Guardar y enviar a bandeja{cantidadPendiente ? ` (${cantidadPendiente})` : ''}
                </button>
                <button
                  type="button"
                  onClick={onCerrar}
                  disabled={!editando || procesando || guardando}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${boton}`}
                >
                  <LockKeyhole size={14} /> Cerrar plantilla
                </button>
                {acciones}
              </div>
            )}
            {archivada && (
              <button
                type="button"
                onClick={onVolverArchivadas}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${boton}`}
              >
                Volver a archivadas
              </button>
            )}
          </div>
        </div>
      </header>

      {vistaVentas === 'bandeja' ? (
        semanasBandeja.length === 0 ? (
          <p className={`px-4 py-6 text-sm ${muted}`}>No hay semanas guardadas en la bandeja.</p>
        ) : (
          <div className="overflow-x-auto p-3 md:p-4">
            <table className="w-full min-w-[760px] text-sm">
              <thead className={cabecera}>
                <tr>
                  {['Semana', 'Fecha y hora de guardado', 'Estado', 'Acciones'].map((titulo) => (
                    <th key={titulo} className="px-3 py-2 text-left font-semibold">{titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={texto}>
                {semanasBandeja.map((semana) => (
                  <tr key={semana.semana_inicio} className={`border-t ${borde}`}>
                    <td className="px-3 py-2 font-semibold">
                      {rangoSemana(new Date(`${semana.semana_inicio}T00:00:00`))}
                    </td>
                    <td className="px-3 py-2">
                      {formatearFechaHora(semana.guardada_en)}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        semana.cerrada
                          ? 'bg-slate-500/10 text-slate-500'
                          : 'bg-amber-500/10 text-amber-700'
                      }`}>
                        {semana.cerrada ? 'Cerrada' : 'Guardada · por continuar'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onAbrirSemana(semana.semana_inicio)}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 px-2.5 py-1.5 text-xs font-semibold text-cyan-600 hover:bg-cyan-500/10"
                        >
                          <Eye size={13} /> {semana.cerrada ? 'Ver semana' : 'Continuar semana'}
                        </button>
                        {semana.cerrada && (
                          <>
                            <button
                              type="button"
                              onClick={() => onArchivar(semana.semana_inicio)}
                              disabled={procesando}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${boton}`}
                            >
                              <Archive size={13} /> Archivar
                            </button>
                            <button
                              type="button"
                              onClick={() => onEliminar(semana.semana_inicio)}
                              disabled={procesando}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                            >
                              <Trash2 size={13} /> Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : vistaVentas === 'archivadas' ? (
        planillasArchivadas.length === 0 ? (
          <p className={`px-4 py-6 text-sm ${muted}`}>No hay plantillas de ventas archivadas.</p>
        ) : (
          <div className="overflow-x-auto p-3 md:p-4">
            <table className="w-full min-w-[680px] text-sm">
              <thead className={cabecera}>
                <tr>
                  {['Semana', 'Fecha y hora de archivado', 'Acciones'].map((titulo) => (
                    <th key={titulo} className="px-3 py-2 text-left font-semibold">{titulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={texto}>
                {planillasArchivadas.map((planilla) => (
                  <tr key={planilla.semana_inicio} className={`border-t ${borde}`}>
                    <td className="px-3 py-2 font-semibold">
                      {rangoSemana(new Date(`${planilla.semana_inicio}T00:00:00`))}
                    </td>
                    <td className="px-3 py-2">
                      {formatearFechaHora(planilla.archivado_en)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onVerArchivada(planilla.semana_inicio)}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 px-2.5 py-1.5 text-xs font-semibold text-cyan-600 hover:bg-cyan-500/10"
                        >
                          <Eye size={13} /> Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => onRestaurar(planilla.semana_inicio)}
                          disabled={procesando}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 px-2.5 py-1.5 text-xs font-semibold text-cyan-600 hover:bg-cyan-500/10 disabled:opacity-50"
                        >
                          <RotateCcw size={13} /> Restaurar
                        </button>
                        <button
                          type="button"
                          onClick={() => onEliminar(planilla.semana_inicio)}
                          disabled={procesando}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          <Trash2 size={13} /> Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <>
          {archivada ? (
            <p className="border-b border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-700">
              Semana archivada: solo lectura. Restáurala para volver a las planillas activas.
            </p>
          ) : cerrada && (
            <p className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-600">
              La plantilla tiene sucursales cerradas. Pulsa “Editar” para reabrirlas.
            </p>
          )}
          {sucursales.length === 0 ? (
            <p className={`px-4 py-6 text-sm ${muted}`}>No hay sucursales registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
            <thead className={cabecera}>
              <tr>
                <th className="sticky left-0 px-3 py-2 text-left font-semibold">Sucursal</th>
                {dias.map((dia, indice) => (
                  <th key={aISO(dia)} className="px-2 py-2 text-center font-semibold">{DIAS[indice]}</th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className={texto}>
              {sucursales.map((sucursal) => (
                <tr key={sucursal.id} className={`border-t ${borde}`}>
                  <td className={`sticky left-0 px-3 py-2 font-semibold ${oscuro ? 'bg-slate-950' : 'bg-white'}`}>
                    {sucursal.nombre}
                    <span className={`ml-1 text-[10px] ${muted}`}>{sucursal.sector}</span>
                  </td>
                  {dias.map((dia) => {
                    const fila = ventas.get(`${aISO(dia)}|${sucursal.id}`);
                    const valor = valorDia(sucursal.id, dia);
                    return (
                      <td key={aISO(dia)} className="px-2 py-2 text-center tabular-nums">
                        {campo === 'unidades_entregadas'
                          ? entregas.has(`${aISO(dia)}|${sucursal.id}`) ? formatear(valor) : '—'
                          : (
                            <CeldaNumero
                              valor={fila?.[campo] ?? ''}
                              decimales={campo === 'importe_bs'}
                              oscuro={oscuro}
                              disabled={!editando || cerrada || procesando || guardando}
                              onCambiar={(nuevoValor) => onCambiar({
                                fecha: aISO(dia),
                                sucursalId: sucursal.id,
                                campo,
                                valor: nuevoValor,
                              })}
                            />
                          )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{formatear(totalFila(sucursal.id))}</td>
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
              <p className={`px-3 py-2 text-xs ${muted}`}>
                {campo === 'unidades_entregadas' ? 'Unidades recibidas automáticamente desde pedidos entregados.' : `Editando: ${CAMPOS.find((opcion) => opcion.clave === campo)?.etiqueta}`}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
