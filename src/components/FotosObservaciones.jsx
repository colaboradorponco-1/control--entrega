import { useEffect, useRef, useState } from 'react';
import { Camera, Images, X, Plus } from 'lucide-react';

const MAXIMO = 7;
const TEMA_VACIO = {};

/**
 * fotos de apoyo para las observaciones.
 *
 * van aparte de la foto principal del formulario: hasta 7.
 * es opcional, asi que se puede guardar sin ninguna.
 * al tocar el espacio se abre la misma hoja de camara o galeria
 * que usa el resto del sistema.
 */
export default function FotosObservaciones({
  fotos,
  onCambio,
  onError,
  theme = TEMA_VACIO,
  etiqueta = 'Fotos de apoyo',
}) {
  const inputCamara = useRef(null);
  const inputGaleria = useRef(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [vistas, setVistas] = useState([]);

  const {
    borde = 'border-slate-300',
    texto = 'text-slate-700',
    tenue = 'text-slate-400',
    hoja = 'bg-white border-slate-200',
    opciones = 'hover:bg-slate-50',
  } = theme;

  // Al desmontar el componente (o al vaciarse la lista) se liberan
  // las URLs. Usamos un ref para no depender de `vistas` en el cleanup,
  // porque revocar en cada cambio mataba las miniaturas nuevas.
  const vistasRef = useRef([]);
  useEffect(() => { vistasRef.current = vistas; }, [vistas]);
  useEffect(() => {
    return () => { vistasRef.current.forEach((v) => URL.revokeObjectURL(v)); };
  }, []);

  // El padre puede vaciar la lista desde afuera (por ejemplo al limpiar
  // el formulario tras guardar). Si no miramos `fotos`, las miniaturas
  // quedan pegadas aunque ya no haya fotos Selected.
  const anterior = useRef(fotos);
  useEffect(() => {
    const seLimpioDesdeAdelante = fotos.length < anterior.current.length;
    if (seLimpioDesdeAdelante) {
      setVistas((v) => {
        v.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
    }
    anterior.current = fotos;
  }, [fotos]);

  const agregar = (nuevos) => {
    const validos = nuevos.filter((f) => f.type.startsWith('image/'));
    if (validos.length < nuevos.length) {
      onError?.('Algunos archivos no son imagenes y se descartaron');
    }

    const cupo = MAXIMO - fotos.length;
    if (cupo <= 0) return;
    if (validos.length > cupo) {
      onError?.(`Solo caben ${cupo} foto${cupo === 1 ? '' : 's'} mas`);
    }

    const entrant = validos.slice(0, cupo);
    setVistas((v) => [...v, ...entrant.map((f) => URL.createObjectURL(f))]);
    onCambio([...fotos, ...entrant]);
  };

  const recibir = (e) => {
    const archivos = Array.from(e.target.files || []);
    e.target.value = '';
    if (archivos.length) agregar(archivos);
  };

  const quitar = (i) => {
    URL.revokeObjectURL(vistas[i]);
    setVistas((v) => v.filter((_, n) => n !== i));
    onCambio(fotos.filter((_, n) => n !== i));
  };

  const lleno = fotos.length >= MAXIMO;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className={`block text-xs font-semibold uppercase tracking-wider ${texto}`}>
          {etiqueta}
        </label>
        <span className={`text-[11px] font-semibold ${tenue}`}>
          {fotos.length} de {MAXIMO}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {vistas.map((src, i) => (
          <div key={src} className={`relative rounded-lg overflow-hidden border ${borde}`}>
            <img src={src} alt={`Foto ${i + 1}`} className="w-full h-20 object-cover" />
            <button
              type="button"
              onClick={() => quitar(i)}
              className="absolute top-1 right-1 p-1 rounded-md bg-black/70 text-white hover:bg-black/80"
              aria-label={`Quitar foto ${i + 1}`}
            >
              <X size={12} />
            </button>
          </div>
        ))}

        {!lleno && (
          <button
            type="button"
            onClick={() => setEligiendo(true)}
            className={`h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 transition ${borde} ${tenue}`}
          >
            <Plus size={18} />
            <span className="text-[10px] font-bold">Agregar</span>
          </button>
        )}
      </div>

      <input ref={inputCamara} type="file" accept="image/*" capture="environment" onChange={recibir} className="hidden" />
      <input ref={inputGaleria} type="file" accept="image/*" multiple onChange={recibir} className="hidden" />

      {eligiendo && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setEligiendo(false)}
        >
          <div
            className={`w-full max-w-sm m-3 rounded-2xl border overflow-hidden ${hoja}`}
            onClick={(e) => e.stopPropagation()}
          >
            <p className={`px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider ${tenue}`}>
              Fotos de apoyo
            </p>

            <button
              type="button"
              onClick={() => { setEligiendo(false); inputCamara.current?.click(); }}
              className={`w-full flex items-center gap-3 px-4 py-4 text-left text-sm font-bold transition ${opciones}`}
            >
              <Camera size={20} />
              Tomar foto ahora
            </button>

            <button
              type="button"
              onClick={() => { setEligiendo(false); inputGaleria.current?.click(); }}
              className={`w-full flex items-center gap-3 px-4 py-4 text-left text-sm font-bold transition ${opciones} border-t`}
            >
              <Images size={20} />
              Buscar en la galeria
            </button>

            <button
              type="button"
              onClick={() => setEligiendo(false)}
              className={`w-full px-4 py-3.5 text-sm font-semibold transition border-t ${tenue} ${opciones}`}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
