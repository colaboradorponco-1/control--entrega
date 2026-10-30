import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { recepcionRepository } from '../../repositories/recepcionRepository';
import { evidenciasRepository } from '../../repositories/evidenciasRepository';
import { authRepository } from '../../repositories/AuthRepository';
import FirmaCanvas from '../../components/FirmaCanvas';
import SelectorFoto from '../../components/SelectorFoto';
import FotosObservaciones from '../../components/FotosObservaciones';
import { ArrowLeft, LogOut, PackagePlus, Scale, Hash, DollarSign, FileText, CheckCircle, AlertCircle, Sun, Moon, ShoppingCart, User, Eye } from 'lucide-react';

export default function RecepcionPollo() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const [proveedores, setProveedores] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  // Estados del formulario de recepción
  const [unidades, setUnidades] = useState('');
  const [kilos, setKilos] = useState(''); // AGREGADO: Estado original de kilos
  const [kilosCalculados, setKilosCalculados] = useState(0);

  const [proveedorId, setProveedorId] = useState('');
  const [numeroRecibo, setNumeroRecibo] = useState('');
  const [precioPorKilo, setPrecioPorKilo] = useState('');
  const [entregadoPor, setEntregadoPor] = useState('');
  const [recibidoPor, setRecibidoPor] = useState('');
  const [observaciones, setObservaciones] = useState('');

// Sincronizar kilosCalculados con kilos cada vez que kilos cambia
useEffect(() => {
  setKilosCalculados(parseFloat(kilos) || 0);
}, [kilos]);

// Evidencia: una foto y dos firmas, la de quien trae y la de quien recibe
  const [foto, setFoto] = useState(null);
  const [firmaEntrega, setFirmaEntrega] = useState(null);
  const [firmaRecepcion, setFirmaRecepcion] = useState(null);
  const [fotosExtra, setFotosExtra] = useState([]);
  const [ubicacion, setUbicacion] = useState(null);
  const [viendo, setViendo] = useState(null);

  const cargarDatos = useCallback(async () => {
    try {
      const listProveedores = await recepcionRepository.obtenerProveedores();
      setProveedores(listProveedores);

      const listHistorial = await recepcionRepository.obtenerRecepcionesDelDia();
      setHistorial(listHistorial);
    } catch (err) {
      console.error('Error al cargar datos:', err);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Auto-cierre del mensaje de éxito a los 5 segundos.
  useEffect(() => {
    if (mensaje?.tipo !== 'ok') return;
    const t = setTimeout(() => setMensaje(null), 5000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const total = useMemo(() => {
    const k = parseFloat(kilosCalculados);
    const p = parseFloat(precioPorKilo);
    if (Number.isNaN(k) || Number.isNaN(p)) return null;
    return (k * p).toFixed(2);
  }, [kilosCalculados, precioPorKilo]);

  const limpiarFormulario = () => {
    setNumeroRecibo('');
    setKilos('');
    setUnidades('');
    setPrecioPorKilo('');
    setEntregadoPor('');
    setRecibidoPor(perfil?.nombre_completo || '');
    setObservaciones('');
    setFoto(null);
    setFirmaEntrega(null);
    setFirmaRecepcion(null);
    setFotosExtra([]);
    setUbicacion(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje(null);

    // Aviso antes de subir nada: si falta la firma, no tiene
    // sentido gastar datos moviendo archivos al servidor.
    if (!entregadoPor.trim()) {
      setMensaje({ tipo: 'error', texto: 'Escribe quién trae el pollo' });
      return;
    }
    if (!foto) {
      setMensaje({ tipo: 'error', texto: 'Adjunta la foto del lote que está llegando' });
      return;
    }
    if (!firmaEntrega) {
      setMensaje({ tipo: 'error', texto: 'Falta la firma de quien trae el pollo' });
      return;
    }
    if (!firmaRecepcion) {
      setMensaje({ tipo: 'error', texto: 'Falta la firma del encargado que recibe' });
      return;
    }
    if (!recibidoPor.trim()) {
      setMensaje({ tipo: 'error', texto: 'Escribe el nombre de quien recibe en planta' });
      return;
    }

    setMensaje(null);

    setCargando(true);

    try {
      await recepcionRepository.registrarLote({
        proveedor_id: proveedorId,
        numero_recibo: numeroRecibo,
        kilos,
        unidades,
        precio_por_kilo: precioPorKilo,
        observaciones,
        entregado_por: entregadoPor,
        recibido_por: recibidoPor,
        fotosExtra,
        foto,
        firmaEntrega: evidenciasRepository.dataUrlABlob(firmaEntrega),
        firmaRecepcion: evidenciasRepository.dataUrlABlob(firmaRecepcion),
        ubicacion,
      });

      setMensaje({ tipo: 'exito', texto: 'Lote registrado con foto y las dos firmas' });
      limpiarFormulario();
      cargarDatos();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'Error al guardar el registro' });
    } finally {
      setCargando(false);
    }
  };

  const verEvidencia = async (tipo, ruta) => {
    try {
      const url = await recepcionRepository.verEvidencia(ruta);
      if (url) setViendo({ tipo, url });
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo abrir la evidencia' });
    }
  };

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500 focus:ring-amber-500/20'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-amber-500/20';
  const label = darkMode ? 'text-slate-300' : 'text-gray-600';
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
          <div className="flex items-center gap-2 text-amber-500 font-semibold text-xs uppercase tracking-wider mb-1">
            <PackagePlus size={16} className="shrink-0" /> Módulo de Planta
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight break-words">Recepción de Pollo</h1>
          <p className={`text-xs sm:text-sm mt-1 ${muted}`}>Operador: <span className={`font-medium ${strong}`}>{perfil?.nombre_completo}</span></p>
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
            onClick={() => navigate('/planta/pedidos')}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-500 px-3 md:px-4 py-2.5 rounded-xl text-sm font-semibold transition md:shrink-0"
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
          {mensaje.tipo === 'exito' ? <CheckCircle size={20} className="text-emerald-400 shrink-0" /> : <AlertCircle size={20} className="text-red-400 shrink-0" />}
          <span>{mensaje.texto}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Formulario */}
        <div className={`p-5 md:p-6 rounded-2xl shadow border transition-colors duration-300 lg:col-span-1 ${card}`}>
          <h2 className={`text-lg font-bold mb-6 border-b pb-3 ${strong} ${divider}`}>Nuevo Ingreso</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Proveedor</label>
              <select
                required
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 transition ${input}`}
              >
                <option value="">Seleccione proveedor...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>N° de Recibo / Nota</label>
              <div className="relative">
                <FileText className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                <input
                  type="text"
                  required
                  value={numeroRecibo}
                  onChange={(e) => setNumeroRecibo(e.target.value)}
                  placeholder="Ej: REC-1024"
                  className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Unidades</label>
                <div className="relative">
                  <Hash className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                  <input
                    type="number"
                    required
                    min="1"
                    value={unidades}
                    onChange={(e) => setUnidades(e.target.value)}
                    placeholder="0"
                    className={`w-full pl-11 pr-2 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Kilos</label>
                <div className="relative">
                  <Scale className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0.1"
                    value={kilos}
                    onChange={(e) => setKilos(e.target.value)}
                    placeholder="0.00"
                    className={`w-full pl-11 pr-2 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Precio por Kilo (Bs)</label>
              <div className="relative">
                <DollarSign className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={precioPorKilo}
                  onChange={(e) => setPrecioPorKilo(e.target.value)}
                  placeholder="0.00"
                  className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                />
              </div>
            </div>

            {/* El total lo calcula la persona, pero la base tambien lo revisa */}
            {total !== null && (
              <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${darkMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                <span className={`text-xs font-bold uppercase tracking-wider ${label}`}>Total a pagar</span>
                <span className="text-xl font-black text-amber-500">{total} Bs</span>
              </div>
            )}

            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${label}`}>
                Quién trae el pollo *
              </label>
              <div className="relative">
                <User className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                <input
                  type="text"
                  required
                  value={entregadoPor}
                  onChange={(e) => setEntregadoPor(e.target.value)}
                  placeholder="Nombre del chofer o representante"
                  className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${label}`}>
                Quién recibe en planta *
              </label>
              <div className="relative">
                <User className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                <input
                  type="text"
                  required
                  value={recibidoPor}
                  onChange={(e) => setRecibidoPor(e.target.value)}
                  placeholder="Tu nombre, o el del encargado que recibe"
                  className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                />
              </div>
            </div>

            <div>
              <SelectorFoto
                etiqueta="Foto del lote"
                ayuda="Puedes tomarla con la camara o buscarla en la galeria"
                theme={{ borde: input, texto: label, tenue: muted, hoja: card }}
                onSeleccionar={setFoto}
                onError={(texto) => setMensaje({ tipo: 'error', texto })}
              />
            </div>

            <FirmaCanvas
              titulo="Firma de quien trae"
              theme={{ card: 'bg-white', borde: 'border-slate-300', texto: label, tenue: muted }}
              onCambio={(dataUrl) => setFirmaEntrega(dataUrl)}
            />

            <FirmaCanvas
              titulo="Firma de quien recibe"
              theme={{ card: 'bg-white', borde: 'border-slate-300', texto: label, tenue: muted }}
              onCambio={(dataUrl) => setFirmaRecepcion(dataUrl)}
            />
            <p className={`-mt-3 text-[11px] ${muted}`}>
              Arriba firma quien trae el pollo; aquí abajo, vos como responsable de la planta.
            </p>

            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${label}`}>
                Observaciones
              </label>
              <textarea
                rows={2}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej: todo en buen estado / llegó frío / iban 3 cajas menos"
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
              />
            </div>

            <FotosObservaciones
              fotos={fotosExtra}
              onCambio={setFotosExtra}
              onError={(texto) => setMensaje({ tipo: 'error', texto })}
              theme={{ borde: input, texto: label, tenue: muted, hoja: card }}
            />

            

            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-amber-500/25 disabled:opacity-50 text-sm uppercase tracking-wide mt-2"
            >
              {cargando ? 'Guardando...' : 'Registrar Ingreso'}
            </button>
          </form>
        </div>

        {/* Historial */}
        <div className={`p-5 md:p-6 rounded-2xl shadow border transition-colors duration-300 lg:col-span-2 flex flex-col ${card}`}>
          <h2 className={`text-lg font-bold mb-6 border-b pb-3 flex flex-wrap items-center justify-between gap-2 ${strong} ${divider}`}>
            <span>Ingresos del Día</span>
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/10 text-amber-500 rounded-lg border border-amber-500/20">{historial.length} registros</span>
          </h2>
          {historial.length === 0 ? (
            <p className={`text-center py-12 ${muted}`}>No hay ingresos registrados en la fecha de hoy.</p>
          ) : (
            <div className={`overflow-x-auto rounded-xl border -mx-5 md:mx-0 ${divider}`}>
              <table className="w-full text-left border-collapse min-w-[640px]">
                <thead>
                  <tr className={`text-xs font-bold uppercase tracking-wider sticky top-0 border-b ${tableHead}`}>
                    <th className="p-3 md:p-3.5">Recibo</th>
                    <th className="p-3 md:p-3.5">Proveedor</th>
                    <th className="p-3 md:p-3.5">Unidades</th>
                    <th className="p-3 md:p-3.5">Kilos</th>
                    <th className="p-3 md:p-3.5">Promedio</th>
                    <th className="p-3 md:p-3.5">Total</th>
                    <th className="p-3 md:p-3.5">Evidencia</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-sm ${darkMode ? 'divide-slate-800' : 'divide-gray-200'} ${normal}`}>
                  {historial.map((row) => (
                    <tr key={row.id} className={`transition ${rowHover}`}>
                      <td className={`p-3 md:p-3.5 font-semibold ${strong}`}>{row.numero_recibo}</td>
                      <td className="p-3 md:p-3.5">{row.proveedores?.nombre}</td>
                      <td className="p-3 md:p-3.5">{row.unidades} u</td>
                      <td className="p-3 md:p-3.5">{row.kilos} kg</td>
                      <td className={`p-3 md:p-3.5 ${muted}`}>{row.promedio_kilo_unidad} kg/u</td>
                      <td className="p-3 md:p-3.5 font-bold text-emerald-500">Bs {row.total_monto}</td>
                      <td className="p-3 md:p-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {row.foto_url && (
                            <button
                              onClick={() => verEvidencia('Foto del lote', row.foto_url)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${input}`}
                            >
                              <Eye size={11} /> Foto
                            </button>
                          )}
                          {row.firma_entrega_url && (
                            <button
                              onClick={() => verEvidencia('Firma de quien trae', row.firma_entrega_url)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${input}`}
                            >
                              <Eye size={11} /> Firma entrega
                            </button>
                          )}
                          {row.firma_recepcion_url && (
                            <button
                              onClick={() => verEvidencia('Firma de quien recibe', row.firma_recepcion_url)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${input}`}
                            >
                              <Eye size={11} /> Firma recibe
                            </button>
                          )}
                          {row.fotos_extra?.length > 0 && (
                            <button
                              onClick={() => verEvidencia(`Fotos de apoyo (${row.fotos_extra.length})`, row.fotos_extra[0])}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${input}`}
                            >
                              <Eye size={11} /> +{row.fotos_extra.length} fotos
                            </button>
                          )}
                        </div>
                        {row.entregado_por_nombre && (
                          <p className={`text-[10px] mt-1 ${muted}`}>
                            Trajo: {row.entregado_por_nombre}
                          </p>
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

      {/* Visor de evidencia del lote */}
      {viendo && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 bg-black/90"
          onClick={() => setViendo(null)}
        >
          <p className="text-white text-sm font-bold mb-3">{viendo.tipo}</p>
          <img
            src={viendo.url}
            alt={viendo.tipo}
            className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl bg-white"
          />
          <button className="mt-5 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold">
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
