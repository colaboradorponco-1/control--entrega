import { AlertTriangle, CheckCircle2, ImageIcon, Package, PackageX } from 'lucide-react';

export const ETIQUETA_ESTADO_PRODUCTO = {
  FRESCO: 'Fresco y refrigerado',
  TIBIO: 'Fresco pero tibio',
  EMBALAJE: 'Embalaje dañado o húmedo',
  DETERIORO: 'Presenta deterioro',
  OTRO: 'Otro',
};

const TIPOS = {
  REPORTE_ENTREGA: {
    texto: 'Reporte de entrega',
    clase: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
    icono: Package,
  },
  RECEPCION_FALTANTES: {
    texto: 'Faltantes en la recepción',
    clase: 'bg-red-500/15 text-red-500 border-red-500/30',
    icono: PackageX,
  },
};

const fechaLarga = (valor) => {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleString('es-BO', {
    timeZone: 'America/La_Paz',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const URLs_VACIAS = {};
const TEMA_VACIO = {};

/**
 * Tarjeta de un aviso. Se usa en la campana del panel y en la
 * bandeja completa, para que se vean igual en los dos lados.
 */
export default function TarjetaAviso({
  aviso,
  urls = URLs_VACIAS,
  theme = TEMA_VACIO,
  onAbrir,
  onVerFoto,
  onMarcarLeida,
}) {
  const {
    borde = 'border-gray-200',
    texto = 'text-gray-900',
    tenue = 'text-gray-500',
    hoja = 'bg-white',
    suave = 'bg-gray-50',
  } = theme;

  const tipo = TIPOS[aviso.tipo] || {
    texto: aviso.tipo || 'Aviso',
    clase: 'bg-gray-500/15 text-gray-500 border-gray-500/30',
    icono: Package,
  };
  const IconoTipo = tipo.icono;

  const fotos = [
    ...(aviso.fotos_observaciones || []),
    ...(aviso.fotos_extra || []),
  ].filter(Boolean);
  const fotosUnicas = [...new Set(fotos)];

  return (
    <article className={`rounded-xl border p-4 ${borde} ${hoja} ${aviso.leido ? 'opacity-80' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold ${tipo.clase}`}>
            <IconoTipo size={11} /> {tipo.texto}
          </span>
          <h3 className={`mt-1.5 text-sm font-extrabold ${texto}`}>{aviso.titulo}</h3>
          <p className={`mt-0.5 text-[11px] ${tenue}`}>
            {aviso.sucursal_nombre || 'Sucursal'}
            {aviso.origen_nombre ? ` - ${aviso.origen_nombre}` : ''}
            {aviso.creado_en ? ` - ${fechaLarga(aviso.creado_en)}` : ''}
          </p>
        </div>
        {!aviso.leido && (
          <span className="mt-1 flex items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-500">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Sin leer
          </span>
        )}
      </div>

      {aviso.mensaje && (
        <p className={`mt-2 text-sm ${texto}`}>{aviso.mensaje}</p>
      )}

      {aviso.unidades_recibidas != null && (
        <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg ${suave} px-3 py-2`}>
          <AlertTriangle size={14} className="text-amber-500" />
          <span className={`text-xs font-bold ${texto}`}>
            Recibió {aviso.unidades_recibidas} de {aviso.unidades_pedidas} unidades
          </span>
          {aviso.faltantes > 0 && (
            <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-500">
              Faltan {aviso.faltantes}
            </span>
          )}
          {aviso.recibido_por && (
            <span className={`text-[11px] ${tenue}`}>Recibió: {aviso.recibido_por}</span>
          )}
        </div>
      )}

      {aviso.estado_producto && (
        <p className={`mt-2 text-sm ${texto}`}>
          <span className="font-bold">Estado del pollo:</span>{' '}
          {ETIQUETA_ESTADO_PRODUCTO[aviso.estado_producto] || aviso.estado_producto}
        </p>
      )}

      {aviso.observaciones_entrega && (
        <p className={`mt-1 whitespace-pre-wrap text-sm ${texto}`}>{aviso.observaciones_entrega}</p>
      )}

      {aviso.observaciones_recepcion && (
        <p className={`mt-1 whitespace-pre-wrap text-sm ${texto}`}>
          <span className="font-bold">Al recibir:</span> {aviso.observaciones_recepcion}
        </p>
      )}

      {(fotosUnicas.length > 0 || aviso.foto_url) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className={`flex items-center gap-1 text-[10px] font-bold ${tenue}`}>
            <ImageIcon size={11} /> Evidencia
          </span>
          {fotosUnicas.map((ruta) => (
            <button
              key={ruta}
              type="button"
              onClick={() => onVerFoto?.(urls[ruta] || null, ruta)}
              className={`h-12 w-12 overflow-hidden rounded-lg border ${borde} ${urls[ruta] ? '' : 'hidden'}`}
              title="Ver foto"
            >
              {urls[ruta] && (
                <img src={urls[ruta]} alt="Foto del aviso" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
          {aviso.foto_url && (
            <button
              type="button"
              onClick={() => onVerFoto?.(urls[aviso.foto_url] || null, aviso.foto_url)}
              className={`h-12 w-12 overflow-hidden rounded-lg border ${borde} ${urls[aviso.foto_url] ? '' : 'hidden'}`}
              title="Foto de la recepción"
            >
              {urls[aviso.foto_url] && (
                <img src={urls[aviso.foto_url]} alt="Foto de la recepción" className="h-full w-full object-cover" />
              )}
            </button>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!aviso.leido && onMarcarLeida && (
          <button
            type="button"
            onClick={() => onMarcarLeida(aviso)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${borde} ${tenue} hover:opacity-80`}
          >
            <CheckCircle2 size={12} /> Marcar como leído
          </button>
        )}
        {onAbrir && (
          <button
            type="button"
            onClick={() => onAbrir(aviso)}
            className="rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-bold text-amber-600 transition hover:bg-amber-500/25"
          >
            Ver el pedido
          </button>
        )}
      </div>
    </article>
  );
}
