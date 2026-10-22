import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAvisos } from '../hooks/useAvisos';
import { Bell, X, CheckCheck, Package, Loader2, ImageIcon, Inbox } from 'lucide-react';

const fechaCorta = (valor) => {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleString('es-BO', {
    timeZone: 'America/La_Paz',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Campana de avisos del administrador.
 *
 * Solo la monta el rol 'administrador': el superadmin no recibe
 * los reportes de entrega de las sucursales. La lista completa
 * esta en la bandeja (/avisos), aqui solo va el resumen rapido.
 */
export default function PanelNotificaciones() {
  const { darkMode } = useTheme();
  const navigate = useNavigate();
  const { avisos, urls, cargando, error, marcarLeida, marcarTodas } = useAvisos();
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  // Cierra el panel al hacer click afuera.
  useEffect(() => {
    if (!abierto) return undefined;

    const manejarClick = (evento) => {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', manejarClick);
    return () => document.removeEventListener('mousedown', manejarClick);
  }, [abierto]);

  const sinLeer = avisos.filter((aviso) => !aviso.leido).length;

  const abrirAviso = async (aviso) => {
    if (!aviso.leido) await marcarLeida(aviso);
    setAbierto(false);
    navigate('/sucursal');
  };

  const campana = darkMode
    ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
    : 'bg-gray-100 border-gray-300 text-amber-600 hover:bg-gray-200';
  const panel = darkMode
    ? 'bg-slate-900 border-slate-800 text-slate-100'
    : 'bg-white border-gray-200 text-gray-900';
  const suave = darkMode ? 'text-slate-400' : 'text-gray-500';
  const borde = darkMode ? 'border-slate-800' : 'border-gray-200';

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        onClick={() => setAbierto((valor) => !valor)}
        className={`relative p-2.5 rounded-xl border transition flex items-center justify-center ${campana}`}
        title="Avisos de las sucursales"
      >
        <Bell size={18} />
        {sinLeer > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <div
          className={`absolute right-0 mt-2 w-[340px] max-w-[85vw] rounded-2xl border shadow-2xl overflow-hidden z-50 ${panel}`}
        >
          <div className={`flex items-center justify-between gap-2 px-4 py-3 border-b ${borde}`}>
            <div>
              <p className="text-sm font-extrabold">Avisos de las sucursales</p>
              <p className={`text-[11px] ${suave}`}>
                {sinLeer > 0 ? `${sinLeer} sin leer` : 'Todo al dia'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {sinLeer > 0 && (
                <button
                  onClick={marcarTodas}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold border transition ${campana}`}
                  title="Marcar todos como leidos"
                >
                  <CheckCheck size={13} />
                </button>
              )}
              <button
                onClick={() => setAbierto(false)}
                className={`p-1.5 rounded-lg transition ${suave} hover:bg-black/10`}
                title="Cerrar"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {cargando && (
              <div className={`flex items-center justify-center gap-2 py-8 text-sm ${suave}`}>
                <Loader2 size={16} className="animate-spin" /> Cargando avisos...
              </div>
            )}

            {!cargando && error && (
              <div className="px-4 py-6 text-center">
                <p className={`text-sm ${suave}`}>{error}</p>
              </div>
            )}

            {!cargando && !error && avisos.length === 0 && (
              <div className="px-4 py-8 text-center">
                <Package size={22} className={`mx-auto mb-2 ${suave}`} />
                <p className={`text-sm ${suave}`}>
                  Todavia no hay avisos de las sucursales.
                </p>
              </div>
            )}

            {avisos.map((aviso) => (
              <button
                key={aviso.id}
                onClick={() => abrirAviso(aviso)}
                className={`w-full text-left px-4 py-3 border-b transition hover:bg-black/5 ${borde} ${
                  aviso.leido ? 'opacity-70' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold">{aviso.titulo}</p>
                  {!aviso.leido && <span className="mt-1 h-2 w-2 rounded-full bg-red-500 shrink-0" />}
                </div>
                <p className={`text-[11px] mt-0.5 ${suave}`}>
                  {aviso.sucursal_nombre || 'Sucursal'}
                  {aviso.origen_nombre ? ` - ${aviso.origen_nombre}` : ''}
                  {aviso.creado_en ? ` - ${fechaCorta(aviso.creado_en)}` : ''}
                </p>
                {aviso.mensaje && (
                  <p className={`text-[12px] mt-1 ${suave}`}>{aviso.mensaje}</p>
                )}
                {aviso.unidades_recibidas != null && (
                  <p className="text-[12px] mt-1 font-bold text-red-500">
                    Recibio {aviso.unidades_recibidas} de {aviso.unidades_pedidas} unidades
                  </p>
                )}
                {aviso.estado_producto && (
                  <p className="text-[12px] mt-1 font-semibold text-purple-500">
                    {aviso.estado_producto}
                  </p>
                )}
                {aviso.fotos_observaciones?.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className={`flex items-center gap-1 text-[10px] font-bold ${suave}`}>
                      <ImageIcon size={11} /> {aviso.fotos_observaciones.length} foto
                      {aviso.fotos_observaciones.length === 1 ? '' : 's'}
                    </span>
                    {aviso.fotos_observaciones.map((ruta) => (
                      <img
                        key={ruta}
                        src={urls[ruta] || ''}
                        alt="Foto del reporte"
                        className={`h-9 w-9 rounded-lg object-cover border ${borde} ${
                          urls[ruta] ? '' : 'hidden'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className={`px-4 py-2.5 border-t ${borde}`}>
            <button
              onClick={() => {
                setAbierto(false);
                navigate('/avisos');
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-2 text-[11px] font-bold text-amber-600 transition hover:bg-amber-500/25"
            >
              <Inbox size={13} /> Ver la bandeja completa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
