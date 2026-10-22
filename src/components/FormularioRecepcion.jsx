import { User, FileCheck2, Loader2 } from 'lucide-react';
import FirmaCanvas from './FirmaCanvas';
import SelectorFoto from './SelectorFoto';
import FotosObservaciones from './FotosObservaciones';

const TEMA_VACIO = {};

/**
 * Formulario de recepción del pedido.
 *
 * Va dentro de la tarjeta del pedido (no en una ventana): la
 * sucursal marca "Recibir pedido" y el formulario aparece ahí
 * mismo, con las unidades, la foto, la firma y las observaciones.
 *
 * La foto y la firma son obligatorias porque la base las exige
 * para dar el pedido por recibido.
 */
export default function FormularioRecepcion({
  pedido,
  form,
  onForm,
  onFoto,
  onFirma,
  fotosExtra,
  onFotosExtra,
  onSubmit,
  onCancel,
  onError,
  enviando = false,
  hayFaltantes = false,
  excede = false,
  faltaObservacion = false,
  theme = TEMA_VACIO,
}) {
  const {
    input = '',
    label = '',
    muted = '',
    strong = '',
    bordeInput = '',
    hoja = '',
  } = theme;

  if (!pedido) return null;


  return (
    <form
      onSubmit={onSubmit}
      className={`mt-3 space-y-3 rounded-xl border p-3 ${
        hayFaltantes
          ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-emerald-500/30 bg-emerald-500/5'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-xs font-black ${strong}`}>Recibir pedido #{pedido.id}</p>
          <p className={`text-[11px] ${muted}`}>
            Pediste {pedido.unidades} unidades. Contá lo que llegó y firmá el comprobante.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold ${input}`}
        >
          Cerrar
        </button>
      </div>

      <div>
        <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${label}`}>
          Unidades recibidas *
        </label>
        <input
          type="number"
          min="0"
          required
          value={form.unidades_recibidas}
          onChange={(e) => onForm({ ...form, unidades_recibidas: e.target.value })}
          className={`w-full px-3 py-2.5 border rounded-xl text-lg font-bold outline-none focus:ring-2 transition ${input}`}
        />
        {hayFaltantes && (
          <p className="mt-1 text-[11px] font-bold text-amber-500">
            Faltan {pedido.unidades - Number(form.unidades_recibidas || 0)} unidades. Quedará registrado.
          </p>
        )}
        {excede && (
          <p className="mt-1 text-[11px] font-bold text-amber-500">
            Recibiste más de lo pedido ({pedido.unidades}). Verificá el número.
          </p>
        )}
      </div>

      <div>
        <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${label}`}>
          Quién recibió *
        </label>
        <div className="relative">
          <User size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${muted} pointer-events-none`} />
          <input
            type="text"
            required
            value={form.recibido_por}
            onChange={(e) => onForm({ ...form, recibido_por: e.target.value })}
            placeholder="Nombre de quien recibió"
            className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
          />
        </div>
        <p className={`mt-1 text-[11px] ${muted}`}>Si no sos vos, poné el nombre de quien recibió de verdad.</p>
      </div>

      <SelectorFoto
        etiqueta="Foto de la entrega"
        ayuda="Puedes tomarla con la camara o buscarla en la galeria"
        alto="h-32"
        theme={{ borde: bordeInput, texto: label, tenue: muted, hoja }}
        onSeleccionar={onFoto}
        onError={(texto) => onError?.(texto)}
      />

      <FirmaCanvas
        titulo="Firma de quien recibe"
        theme={{
          card: 'bg-white',
          borde: 'border-slate-300',
          texto: label,
          tenue: muted,
        }}
        onCambio={(dataUrl) => onFirma(dataUrl)}
      />

      <div>
        <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${label}`}>
          Observaciones al recibir {hayFaltantes ? '(requerido: hay faltantes)' : '(opcional)'}
        </label>
        <textarea
          rows={2}
          value={form.observaciones}
          onChange={(e) => onForm({ ...form, observaciones: e.target.value })}
          placeholder="Ej: todo bien / faltaban 5 unidades / llegó frío"
          className={`w-full px-3 py-2 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
        />
        {faltaObservacion && (
          <p className="mt-1 text-[11px] font-bold text-amber-500">
            Hay faltantes: explicá acá qué faltó para poder confirmar.
          </p>
        )}
      </div>

      <FotosObservaciones
        fotos={fotosExtra}
        onCambio={onFotosExtra}
        onError={(texto) => onError?.(texto)}
        theme={{ borde: bordeInput, texto: label, tenue: muted, hoja }}
      />

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-semibold border ${input}`}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando || faltaObservacion}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white px-3 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-500/20"
        >
          {enviando ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />}
          Firmar y confirmar
        </button>
      </div>

    </form>
  );
}
