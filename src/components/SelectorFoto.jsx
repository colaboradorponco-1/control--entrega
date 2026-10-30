import { useEffect, useRef, useState } from 'react';
import { Camera, Images, X, Trash2 } from 'lucide-react';

const TEMA_VACIO = {};

/**
 * elige la foto de dos maneras: sacarla en el momento con la
 * camara, o buscar una que ya este en la galeria.
 *
 * por que no un solo input: con capture="environment" el
 * celular abre la camara directo y en android deja elegir de la
 * galeria. sin capture se abre el selector. se ofrecen las dos.
 */
export default function SelectorFoto({
  onSeleccionar,
  onError,
  theme = TEMA_VACIO,
  etiqueta = 'Foto',
  ayuda,
  maxMB = 5,
  alto = 'h-40',
}) {
  const inputCamara = useRef(null);
  const inputGaleria = useRef(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [vista, setVista] = useState(null);

  const {
    borde = 'border-slate-300',
    texto = 'text-slate-700',
    tenue = 'text-slate-400',
    hoja = 'bg-white border-slate-200',
    opciones = 'hover:bg-slate-50',
  } = theme;

  // La vista previa se libera sola, si no cada render deja un
  // archivo de mas tomandose la memoria del celular.
  useEffect(() => {
    if (!onSeleccionar) return undefined;
    return () => { if (vista) URL.revokeObjectURL(vista); };
  }, [vista, onSeleccionar]);

  const recibir = (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;

    if (!archivo.type.startsWith('image/')) {
      onError?.('Ese archivo no es una imagen');
      return;
    }
    if (archivo.size > maxMB * 1024 * 1024) {
      onError?.(`La foto pesa mas de ${maxMB} MB, tomala de nuevo`);
      return;
    }

    if (vista) URL.revokeObjectURL(vista);
    setVista(URL.createObjectURL(archivo));
    onSeleccionar(archivo);
  };

  const quitar = () => {
    if (vista) URL.revokeObjectURL(vista);
    setVista(null);
    onSeleccionar(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className={`block text-xs font-semibold uppercase tracking-wider ${texto}`}>
          {etiqueta} *
        </label>
        {vista && (
          <button
            type="button"
            onClick={quitar}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${tenue} hover:bg-slate-500/10`}
          >
            <Trash2 size={12} /> Quitar
          </button>
        )}
      </div>

      {vista ? (
        <div className={`relative rounded-xl overflow-hidden border ${borde}`}>
          <img src={vista} alt={etiqueta} className={`w-full ${alto} object-cover`} />
          <button
            type="button"
            onClick={quitar}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-white hover:bg-black/80"
            aria-label="Quitar foto"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEligiendo(true)}
          className={`w-full ${alto} flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl cursor-pointer transition ${borde} ${tenue}`}
        >
          <Camera size={22} />
          <span className="text-xs font-bold">Tomar o elegir foto</span>
        </button>
      )}

      {ayuda && !vista && (
        <p className={`mt-1.5 text-[11px] ${tenue}`}>{ayuda}</p>
      )}

      {/* los dos archivos escondido, el de camara y el de galeria */}
      <input ref={inputCamara} type="file" accept="image/*" capture="environment" onChange={recibir} className="hidden" />
      <input ref={inputGaleria} type="file" accept="image/*" onChange={recibir} className="hidden" />

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
              {etiqueta} del pollo
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
