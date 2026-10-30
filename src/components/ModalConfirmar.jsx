import { useEffect } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/**
 * Modal de confirmación reutilizable.
 * Reemplaza window.confirm con una UI consistente con el sistema.
 *
 * Uso:
 *   const [confirmar, setConfirmar] = useState(null);
 *   // Para abrir:
 *   setConfirmar({ mensaje: '¿Cancelar pedido #5?', onConfirmar: () => cancelar(5) });
 *   // En el JSX:
 *   <ModalConfirmar config={confirmar} onCerrar={() => setConfirmar(null)} />
 */
export default function ModalConfirmar({
  config,
  onCerrar,
  cargando = false,
}) {
  const { darkMode } = useTheme();

  // Cerrar con Escape
  useEffect(() => {
    if (!config) return undefined;
    const manejar = (e) => { if (e.key === 'Escape' && !cargando) onCerrar(); };
    document.addEventListener('keydown', manejar);
    return () => document.removeEventListener('keydown', manejar);
  }, [config, onCerrar, cargando]);

  if (!config) return null;

  const {
    titulo = '¿Confirmar acción?',
    mensaje,
    labelConfirmar = 'Confirmar',
    variante = 'danger',   // 'danger' | 'warning' | 'default'
    onConfirmar,
    inputMotivo,
  } = config;

  // Un motivo con longitud mínima bloquea el botón de confirmar.
  const motivoCorto = Boolean(inputMotivo)
    && inputMotivo.requerido !== false
    && String(inputMotivo.value || '').trim().length < (inputMotivo.minLength ?? 5);

  const colores = {
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-amber-500 hover:bg-amber-600',
    default: 'bg-purple-600 hover:bg-purple-700',
  };

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const cancelBtn = darkMode
    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
    : 'border-gray-300 text-gray-700 hover:bg-gray-50';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !cargando) onCerrar(); }}
      role="presentation"
    >
      <div className={`${card} w-full max-w-sm rounded-2xl border p-5 shadow-2xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="rounded-xl bg-amber-500/10 p-2 text-amber-500">
              <AlertTriangle size={18} />
            </span>
            <h2 className={`text-base font-black ${strong}`}>{titulo}</h2>
          </div>
          {!cargando && (
            <button
              type="button"
              onClick={onCerrar}
              className={`rounded-lg p-1.5 transition ${muted} hover:bg-slate-500/10`}
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {mensaje && (
          <p className={`mb-5 text-sm leading-relaxed ${muted}`}>{mensaje}</p>
        )}

        {inputMotivo && (
          <div className="mb-5">
            <textarea
              value={inputMotivo.value ?? ''}
              onChange={inputMotivo.onChange}
              placeholder={inputMotivo.placeholder || 'Escribe el motivo...'}
              rows={3}
              maxLength={inputMotivo.maxLength ?? 500}
              autoFocus
              className={`w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none transition ${
                darkMode
                  ? 'border-slate-700 bg-slate-950/60 text-white placeholder-slate-500 focus:border-amber-500'
                  : 'border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:border-amber-500'
              }`}
            />
            <p className={`mt-1.5 text-[11px] ${motivoCorto ? 'text-amber-500' : muted}`}>
              {motivoCorto
                ? `Escribe al menos ${inputMotivo.minLength ?? 5} caracteres.`
                : `${String(inputMotivo.value || '').trim().length} de ${inputMotivo.maxLength ?? 500} caracteres`}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCerrar}
            disabled={cargando}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${cancelBtn}`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={cargando || motivoCorto}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:opacity-60 ${colores[variante]}`}
          >
            {cargando && <Loader2 size={15} className="animate-spin" />}
            {labelConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
