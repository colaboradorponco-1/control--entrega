export default function CeldaNumero({ valor, onCambiar, onGuardar, oscuro = false, decimales = true }) {
  return (
    <input
      type="number"
      min="0"
      step={decimales ? '0.01' : '1'}
      value={valor ?? ''}
      onChange={(evento) => onCambiar(evento.target.value)}
      onBlur={onGuardar}
      onKeyDown={(evento) => {
        if (evento.key === 'Enter') evento.currentTarget.blur();
      }}
      className={`w-20 rounded-md border px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-cyan-500 ${
        oscuro
          ? 'border-slate-700 bg-slate-900 text-slate-100'
          : 'border-gray-300 bg-white text-gray-800'
      }`}
    />
  );
}
