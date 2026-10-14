import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { sucursalesRepository } from '../../repositories/sucursalesRepository';
import { authRepository } from '../../repositories/AuthRepository';
import MapaUbicacion from '../../components/MapaUbicacion';
import {
  LogOut, Sun, Moon, Plus, Pencil, Trash2, X,
  Search, ArrowLeft, CheckCircle, AlertCircle, MapPin, Loader2, Route, ExternalLink
} from 'lucide-react';

const SECTOR_COLOR = {
  ESTE: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  OESTE: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  NORTE: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  CENTRO: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  SUR: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  PARTICULAR: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};

const EMPTY_FORM = { nombre: '', sector: '', ubicacion: null, enlaceMapa: '' };

export default function GestionSucursales() {
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [sucursales, setSucursales] = useState([]);
  const [sectores, setSectores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroZona, setFiltroZona] = useState('TODAS');
  const [mensaje, setMensaje] = useState(null);

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editandoId, setEditandoId] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500 focus:ring-amber-500/20'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-amber-500/20';
  const label = darkMode ? 'text-slate-300' : 'text-gray-600';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';
  const tableHead = darkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-gray-50 text-gray-600 border-gray-200';
  const rowHover = darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50';

  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);
      const [sucursalesData, sectoresData] = await Promise.all([
        sucursalesRepository.listar(),
        sucursalesRepository.listarSectores(),
      ]);
      setSucursales(sucursalesData);
      setSectores(sectoresData);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'Error al cargar las sucursales' });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(null), 5000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const sucursalesFiltradas = sucursales.filter((s) => {
    const coincideZona = filtroZona === 'TODAS' || s.sector === filtroZona;
    const coincideTexto = !busqueda || s.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return coincideZona && coincideTexto;
  });

  const porZona = sectores.map((zona) => ({
    zona,
    total: sucursales.filter((s) => s.sector === zona).length,
  }));

  const abrirCrear = () => {
    setForm({ ...EMPTY_FORM, sector: sectores[0] || '' });
    setEditandoId(null);
    setModal('crear');
  };

  const abrirEditar = (s) => {
    setForm({
      nombre: s.nombre,
      sector: s.sector,
      ubicacion: s.latitude != null && s.longitude != null
        ? { lat: Number(s.latitude), longitude: Number(s.longitude) }
        : null,
      enlaceMapa: s.map_url || '',
    });
    setEditandoId(s.id);
    setModal('editar');
  };

  const cerrarModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setEditandoId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'El nombre de la sucursal es obligatorio' });
      return;
    }
    if (!form.sector.trim()) {
      setMensaje({ tipo: 'error', texto: 'Selecciona la zona donde está la sucursal' });
      return;
    }

    const enlaceMapa = form.enlaceMapa.trim();
    if (enlaceMapa) {
      try {
        const url = new URL(enlaceMapa);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo no permitido');
      } catch {
        setMensaje({ tipo: 'error', texto: 'Ingresa un enlace válido que comience con https:// o http://' });
        return;
      }
    }

    const nombre = form.nombre.trim();

    const duplicada = sucursales.find(
      (s) => s.nombre.toLowerCase() === nombre.toLowerCase() && s.sector === form.sector && s.id !== editandoId
    );
    if (duplicada) {
      setMensaje({ tipo: 'error', texto: `Ya existe "${nombre}" en la zona ${form.sector}` });
      return;
    }

    try {
      setEnviando(true);
      if (editandoId) {
        await sucursalesRepository.actualizar(editandoId, {
          nombre,
          sector: form.sector,
          latitude: form.ubicacion?.lat ?? null,
          longitude: form.ubicacion?.longitude ?? null,
          map_url: enlaceMapa || null,
        });
        setMensaje({ tipo: 'exito', texto: `Sucursal "${nombre}" actualizada` });
      } else {
        await sucursalesRepository.crear({
          nombre,
          sector: form.sector,
          latitude: form.ubicacion?.lat ?? null,
          longitude: form.ubicacion?.longitude ?? null,
          map_url: enlaceMapa || null,
        });
        setMensaje({ tipo: 'exito', texto: `Sucursal "${nombre}" agregada en la zona ${form.sector}` });
      }
      cerrarModal();
      await cargarDatos();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo guardar la sucursal' });
    } finally {
      setEnviando(false);
    }
  };

  const handleEliminar = async (s) => {
    try {
      const usos = await sucursalesRepository.contarUsos(s.id);

      // Se cuentan pedidos tambien, no solo despachos. Una sucursal
      // con pedidos tiene ON DELETE RESTRICT y no se puede borrar,
      // aunque no tenga despachos.
      const partes = [];
      if (usos.despachos > 0) partes.push(`${usos.despachos} despacho(s)`);
      if (usos.pedidos > 0) partes.push(`${usos.pedidos} pedido(s)`);
      if (usos.usuarios > 0) partes.push(`${usos.usuarios} usuario(s)`);

      if (partes.length > 0) {
        const listado =
          partes.length === 1
            ? partes[0]
            : partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1];

        setMensaje({
          tipo: 'error',
          texto:
            `No se puede eliminar "${s.nombre}": tiene ${listado}. ` +
            `Borrarla rompería el historial de esos registros. ` +
            `Si la sucursal dejó de operar, conviene dejarla y no borrarla.`,
        });
        return;
      }

      const confirmado = window.confirm(`¿Eliminar la sucursal "${s.nombre}" de la zona ${s.sector}?`);
      if (!confirmado) return;

      await sucursalesRepository.eliminar(s.id);
      setMensaje({ tipo: 'exito', texto: `Sucursal "${s.nombre}" eliminada` });
      await cargarDatos();
    } catch (err) {
      // Red de seguridad: si el conteo se quedaron corto por
      // algo, Postgres igual va a rechazar el borrado. 23503 es
      // "violates foreign key constraint". Se traduce para que no
      // aparezca el error crudo de la base.
      const violoFk =
        err?.code === '23503' ||
        (err?.message || '').includes('foreign key constraint');

      if (violoFk) {
        setMensaje({
          tipo: 'error',
          texto:
            `No se puede eliminar "${s.nombre}" porque tiene registros ` +
            `asociados (pedidos o despachos) y borrarla rompería el historial.`,
        });
        return;
      }

      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo eliminar la sucursal' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 transition-colors">
      <header className={`sticky top-0 z-20 border-b backdrop-blur-xl ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-gray-200'}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/panel')}
              className={`p-2.5 rounded-xl border transition ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'}`}
              aria-label="Volver al panel"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="p-2 bg-amber-500/15 rounded-xl border border-amber-500/25">
                <MapPin size={18} className="text-amber-500" />
              </div>
              <div className="min-w-0">
                <h1 className={`text-base md:text-xl font-black tracking-tight truncate ${strong}`}>
                  Sucursales
                </h1>
                <p className={`text-[10px] md:text-xs font-medium ${muted}`}>
                  {sucursales.length} sucursales en {sectores.length} zonas
                </p>
              </div>
            </div>

            <button
              onClick={toggleTheme}
              className={`p-2.5 rounded-xl border transition ${darkMode ? 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800' : 'bg-gray-50 border-gray-300 text-amber-500 hover:bg-gray-100'}`}
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() => authRepository.logout()}
              className="hidden sm:flex items-center gap-2 bg-red-950/50 hover:bg-red-900/60 border border-red-800/50 text-red-300 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
            >
              <LogOut size={16} /> Salir
            </button>
            <button
              onClick={abrirCrear}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 md:px-4 py-2.5 rounded-xl text-sm font-bold transition shadow-lg shadow-amber-500/20"
            >
              <Plus size={16} /> <span className="hidden sm:inline">Nueva</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-7 space-y-5">
        {mensaje && (
          <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
            mensaje.tipo === 'error'
              ? 'bg-red-950/40 border-red-800/50 text-red-300'
              : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
          }`}>
            {mensaje.tipo === 'error' ? <AlertCircle size={18} className="shrink-0 mt-0.5" /> : <CheckCircle size={18} className="shrink-0 mt-0.5" />}
            <p className="text-sm font-semibold">{mensaje.texto}</p>
          </div>
        )}

        {/* Resumen por zona */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className={`${card} border rounded-2xl p-4`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Total</p>
            <p className="text-2xl font-black text-amber-500 mt-1">{sucursales.length}</p>
          </div>
          {porZona.map(({ zona, total }) => (
            <div key={zona} className={`${card} border rounded-2xl p-4`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>{zona}</p>
              <p className="text-2xl font-black mt-1">{total}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 relative">
            <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${muted}`} />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar sucursal..."
              className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none transition ${input}`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {['TODAS', ...sectores].map((zona) => (
              <button
                key={zona}
                onClick={() => setFiltroZona(zona)}
                className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${
                  filtroZona === zona
                    ? 'bg-amber-500 text-slate-950 border-amber-500'
                    : darkMode
                      ? 'bg-slate-950/60 text-slate-400 border-slate-800 hover:bg-slate-800'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {zona === 'TODAS' ? 'Todas las zonas' : zona}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla escritorio */}
        <div className={`hidden md:block ${card} border rounded-2xl overflow-hidden`}>
          <div className={`flex items-center justify-between px-5 py-3 border-b ${tableHead}`}>
            <span className="text-xs font-bold uppercase tracking-wider">Sucursal</span>
            <span className="text-xs font-bold uppercase tracking-wider">Zona / ubicación</span>
            <span className="text-xs font-bold uppercase tracking-wider text-right">Acciones</span>
          </div>

          {cargando ? (
            <div className={`flex items-center justify-center gap-2 py-14 ${muted}`}>
              <Loader2 size={20} className="animate-spin" /> Cargando sucursales...
            </div>
          ) : sucursalesFiltradas.length === 0 ? (
            <div className={`py-14 text-center ${muted}`}>
              {busqueda || filtroZona !== 'TODAS'
                ? 'Ninguna sucursal coincide con tu búsqueda.'
                : 'Aún no hay sucursales registradas.'}
            </div>
          ) : (
            <div className="divide-y divide-inherit">
              {sucursalesFiltradas.map((s) => (
                <div key={s.id} className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-3.5 transition ${rowHover}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                      <MapPin size={14} className="text-amber-500" />
                    </div>
                    <span className={`text-sm font-semibold truncate ${normal}`}>{s.nombre}</span>
                  </div>
                  <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border whitespace-nowrap ${SECTOR_COLOR[s.sector] || 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                    {s.sector}
                  </span>
                  <div className="flex items-center gap-1">
                    {s.map_url && (
                      <a
                        href={s.map_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg text-sky-500 hover:bg-sky-500/10 transition"
                        aria-label={`Abrir ubicación de ${s.nombre} en el mapa`}
                        title="Abrir enlace de ubicación"
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                    <button
                      onClick={() => abrirEditar(s)}
                      className="p-2 rounded-lg text-amber-500 hover:bg-amber-500/10 transition"
                      aria-label="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleEliminar(s)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition"
                      aria-label="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tarjetas móvil */}
        <div className="md:hidden space-y-2.5">
          {cargando ? (
            <div className={`flex items-center justify-center gap-2 py-14 ${muted}`}>
              <Loader2 size={20} className="animate-spin" /> Cargando...
            </div>
          ) : sucursalesFiltradas.length === 0 ? (
            <div className={`${card} border rounded-2xl py-12 text-center ${muted}`}>
              {busqueda || filtroZona !== 'TODAS' ? 'Sin resultados' : 'Sin sucursales'}
            </div>
          ) : (
            sucursalesFiltradas.map((s) => (
              <div key={s.id} className={`${card} border rounded-2xl p-4 flex items-center gap-3`}>
                <div className={`p-2.5 rounded-xl shrink-0 ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                  <MapPin size={16} className="text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${strong}`}>{s.nombre}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-md border ${SECTOR_COLOR[s.sector] || 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                    {s.sector}
                  </span>
                </div>
                {s.map_url && (
                  <a
                    href={s.map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-xl text-sky-500 hover:bg-sky-500/10 transition"
                    aria-label={`Abrir ubicación de ${s.nombre} en el mapa`}
                    title="Abrir enlace de ubicación"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
                <button
                  onClick={() => abrirEditar(s)}
                  className="p-2.5 rounded-xl text-amber-500 hover:bg-amber-500/10 transition"
                  aria-label="Editar"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleEliminar(s)}
                  className="p-2.5 rounded-xl text-red-500 hover:bg-red-500/10 transition"
                  aria-label="Eliminar"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className={`${card} border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 md:p-6 shadow-2xl`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/15 rounded-xl border border-amber-500/25">
                  <Route size={17} className="text-amber-500" />
                </div>
                <h2 className={`text-lg font-black ${strong}`}>
                  {editandoId ? 'Editar Sucursal' : 'Nueva Sucursal'}
                </h2>
              </div>
              <button onClick={cerrarModal} className={`p-2 rounded-xl transition ${muted} hover:bg-slate-500/10`} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Nombre de la sucursal
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej. Sacaba"
                  autoFocus
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${input}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Zona / ubicación
                </label>
                <input
                  type="text"
                  list="lista-rutas"
                  value={form.sector}
                  onChange={(e) => setForm({ ...form, sector: e.target.value.toUpperCase() })}
                  placeholder="Ej. OESTE"
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition ${input}`}
                />
                <datalist id="lista-rutas">
                  {sectores.map((s) => <option key={s} value={s} />)}
                </datalist>
                <p className={`mt-1.5 text-[11px] ${muted}`}>
                  Indica dónde está la sucursal. Esto no crea ni asigna una ruta de reparto. Se convierte a mayúsculas automáticamente.
                </p>
              </div>

              <div>
                <label className={`mb-2 block text-xs font-semibold uppercase tracking-wider ${label}`}>
                  Ubicación de la sucursal
                </label>
                <MapaUbicacion
                  valor={form.ubicacion}
                  onCambio={(ubicacion) => setForm((actual) => ({ ...actual, ubicacion }))}
                  enlace={form.enlaceMapa}
                  onEnlaceCambio={(enlaceMapa) => setForm((actual) => ({ ...actual, enlaceMapa }))}
                  theme={{
                    borde: input,
                    texto: label,
                    tenue: muted,
                    hoja: card,
                    pin: '#f59e0b',
                    oscuro: darkMode,
                  }}
                  alto={240}
                />
                <p className={`mt-1.5 text-[11px] ${muted}`}>
                  Busca una calle o pega un enlace de Maps para colocar el pin; también puedes tocar el mapa.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={cerrarModal}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${input}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 px-4 py-2.5 rounded-xl text-sm font-bold transition shadow-lg shadow-amber-500/20"
                >
                  {enviando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  {editandoId ? 'Guardar' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
