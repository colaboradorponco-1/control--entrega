import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { sucursalRepository } from '../../repositories/sucursalRepository';
import { authRepository } from '../../repositories/AuthRepository';
import { ArrowLeft, LogOut, Store, CheckCircle2, Clock, AlertCircle, Sun, Moon, ShoppingCart } from 'lucide-react';

export default function MisEntregas() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const [entregas, setEntregas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);

  const cargarEntregas = useCallback(async () => {
    try {
      setCargando(true);
      const data = await sucursalRepository.obtenerEntregasPorSucursal(perfil.sucursal_id);
      setEntregas(data);
    } catch (err) {
      console.error('Error al obtener entregas:', err);
    } finally {
      setCargando(false);
    }
  }, [perfil]);

  useEffect(() => {
    if (perfil?.sucursal_id) {
      cargarEntregas();
    }
  }, [perfil?.sucursal_id, cargarEntregas]);

  const handleConfirmar = async (despachoId) => {
    try {
      await sucursalRepository.confirmarEntrega(despachoId, 'Entrega recibida conforme');
      setMensaje({ tipo: 'exito', texto: 'Recepción confirmada con éxito' });
      cargarEntregas();
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error al confirmar la recepción' });
    }
  };

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const tableHead = darkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-gray-50 text-gray-600 border-gray-200';
  const rowHover = darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50';
  const divider = darkMode ? 'border-slate-800' : 'border-gray-200';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';

  return (
    <div className={`min-h-screen p-4 md:p-6 lg:p-8 transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      {/* Encabezado */}
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center p-4 md:p-6 rounded-2xl shadow mb-6 md:mb-8 border gap-4 transition-colors duration-300 ${card}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-emerald-500 font-semibold text-xs uppercase tracking-wider mb-1">
            <Store size={16} className="shrink-0" /> Módulo de Sucursal
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight break-words">{perfil?.sucursales?.nombre || 'Receptoría de Sucursal'}</h1>
          <p className={`text-xs sm:text-sm mt-1 ${muted}`}>Encargado: <span className={`font-medium ${strong}`}>{perfil?.nombre_completo}</span></p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
          <button
            onClick={() => navigate('/panel')}
            aria-label="Volver al panel"
            className={`p-2.5 rounded-xl border transition ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'}`}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={toggleTheme}
            aria-label="Cambiar modo"
            className={`p-2.5 rounded-xl border transition flex items-center justify-center shrink-0 ${darkMode ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-gray-100 border-gray-300 text-amber-600 hover:bg-gray-200'}`}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={() => navigate('/sucursal/pedidos')}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-500 px-3 md:px-4 py-2.5 rounded-xl text-sm font-semibold transition md:shrink-0"
          >
            <ShoppingCart size={16} /> <span className="hidden sm:inline">Pedidos</span>
          </button>
          <button
            onClick={() => authRepository.logout()}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-red-950/50 hover:bg-red-900/60 border border-red-800/50 text-red-300 px-3 md:px-4 py-2.5 rounded-xl text-sm font-semibold transition md:shrink-0"
          >
            <LogOut size={16} /> <span className="hidden sm:inline">Cerrar Sesión</span><span className="sm:hidden">Salir</span>
          </button>
        </div>
      </div>

      {mensaje && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 shadow-lg text-sm ${mensaje.tipo === 'exito' ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200' : 'bg-red-950/50 border-red-500/50 text-red-200'}`}>
          {mensaje.tipo === 'exito' ? <CheckCircle2 size={20} className="text-emerald-400 shrink-0" /> : <AlertCircle size={20} className="text-red-400 shrink-0" />}
          <span>{mensaje.texto}</span>
        </div>
      )}

      <div className={`p-5 md:p-6 rounded-2xl shadow border transition-colors duration-300 ${card}`}>
        <h2 className={`text-lg font-bold mb-6 border-b pb-3 flex flex-wrap items-center justify-between gap-2 ${strong} ${divider}`}>
          <span>Entregas del Día de Hoy</span>
          <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg border border-emerald-500/20">{entregas.length} registros</span>
        </h2>
        
        {cargando ? (
          <p className={`text-center py-12 ${muted}`}>Cargando despachos...</p>
        ) : entregas.length === 0 ? (
          <p className={`text-center py-12 ${muted}`}>No hay despachos registrados para esta sucursal el día de hoy.</p>
        ) : (
          <div className={`overflow-x-auto rounded-xl border -mx-5 md:mx-0 ${divider}`}>
            <table className="w-full text-left border-collapse min-w-[620px]">
              <thead>
                <tr className={`text-xs font-bold uppercase tracking-wider sticky top-0 border-b ${tableHead}`}>
                  <th className="p-3 md:p-3.5">Hora</th>
                  <th className="p-3 md:p-3.5">Unidades</th>
                  <th className="p-3 md:p-3.5">Kilos</th>
                  <th className="p-3 md:p-3.5">Estado</th>
                  <th className="p-3 md:p-3.5 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className={`divide-y text-sm ${darkMode ? 'divide-slate-800' : 'divide-gray-200'} ${normal}`}>
                {entregas.map((row) => (
                  <tr key={row.id} className={`transition ${rowHover}`}>
                    <td className={`p-3 md:p-3.5 font-medium ${muted}`}>
                      {new Date(row.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 md:p-3.5">{row.unidades} u</td>
                    <td className={`p-3 md:p-3.5 font-bold ${strong}`}>{row.kilos} kg</td>
                    <td className="p-3 md:p-3.5">
                      {row.estado_recepcion === 'RECIBIDO' ? (
                        <span className="px-3 py-1 text-xs rounded-full font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 inline-flex items-center gap-1.5">
                          <CheckCircle2 size={14} /> Confirmado
                        </span>
                      ) : (
                        <span className="px-3 py-1 text-xs rounded-full font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20 inline-flex items-center gap-1.5">
                          <Clock size={14} /> En Tránsito
                        </span>
                      )}
                    </td>
                    <td className="p-3 md:p-3.5 text-center">
                      {row.estado_recepcion !== 'RECIBIDO' && (
                        <button
                          onClick={() => handleConfirmar(row.id)}
                          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-3 md:px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-600/25 uppercase tracking-wide whitespace-nowrap"
                        >
                          Confirmar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
