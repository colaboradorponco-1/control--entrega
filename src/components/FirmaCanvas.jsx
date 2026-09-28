import { useEffect, useRef, useState, useCallback } from 'react';
import { PenLine, Eraser } from 'lucide-react';

const ALTO = 190;

/**
 * firms someone with a finger on the glass.
 * works with mouse too, for when they use a computer.
 */
export default function FirmaCanvas({ onCambio, theme = {}, titulo = 'Firma' }) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);
  const ultimoPunto = useRef(null);
  const [tieneFirma, setTieneFirma] = useState(false);

  const {
    card = 'bg-white',
    borde = 'border-slate-300',
    texto = 'text-slate-700',
    tenue = 'text-slate-400',
    btn = 'border border-slate-300 text-slate-600',
  } = theme;

  // Prepara el lienzo al tamaño real de la pantalla, para que
  // no salga borroso al dibujar.
  const preparar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ancho = canvas.parentElement.clientWidth;
    if (!ancho) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = ancho * ratio;
    canvas.height = ALTO * ratio;
    canvas.style.width = `${ancho}px`;
    canvas.style.height = `${ALTO}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, ALTO);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  useEffect(() => {
    preparar();
    // Al girar el celular hay que reajustar el lienzo, pero solo
    // si todavia no se firmó, para no borrar lo firmado.
    const alRedimensionar = () => {
      if (!tieneFirma && !dibujando.current) preparar();
    };
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, [preparar, tieneFirma]);

  const posicion = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const caja = canvas.getBoundingClientRect();

    // El puntero ya trae las coordenadas, funciona igual con dedo y con mouse
    const fuente = e.touches?.[0] || e;
    return { x: fuente.clientX - caja.left, y: fuente.clientY - caja.top };
  };

  const empezar = (e) => {
    e.preventDefault();
    const punto = posicion(e);
    if (!punto) return;

    dibujando.current = true;
    ultimoPunto.current = punto;

    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(punto.x, punto.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();

    setTieneFirma(true);
  };

  const mover = (e) => {
    if (!dibujando.current) return;
    e.preventDefault();
    const punto = posicion(e);
    if (!punto) return;

    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(ultimoPunto.current.x, ultimoPunto.current.y);
    ctx.lineTo(punto.x, punto.y);
    ctx.stroke();

    ultimoPunto.current = punto;
  };

  const terminar = (e) => {
    if (!dibujando.current) return;
    if (e) e.preventDefault();
    dibujando.current = false;
    ultimoPunto.current = null;
    // Se entrega el dibujo recien cuando se levanta el dedo: antes
    // el PNG solo tendria el primer punto.
    onCambio?.(exportar(), true);
  };

  const limpiar = () => {
    preparar();
    setTieneFirma(false);
    onCambio?.(null, false);
  };

  // Entrega el dibujo como imagen PNG
  const exportar = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  };

  return (
    <div>
      <div className={`flex items-center justify-between mb-2`}>
        <label className={`block text-xs font-semibold uppercase tracking-wider ${texto}`}>
          {titulo} *
        </label>
        {tieneFirma && (
          <button
            type="button"
            onClick={limpiar}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${btn}`}
          >
            <Eraser size={12} /> Borrar
          </button>
        )}
      </div>

      <div className={`relative rounded-xl overflow-hidden border-2 border-dashed ${borde} ${card}`}>
        <canvas
          ref={canvasRef}
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerLeave={terminar}
          onPointerCancel={terminar}
          className="block touch-none cursor-crosshair"
          style={{ height: ALTO }}
        />

        {!tieneFirma && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
            <PenLine size={22} className={tenue} />
            <span className={`text-xs font-medium ${tenue}`}>Firmá acá con el dedo</span>
          </div>
        )}
      </div>
    </div>
  );
}
