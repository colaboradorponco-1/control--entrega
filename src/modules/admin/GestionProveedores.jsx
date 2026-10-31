import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { proveedoresRepository } from '../../repositories/proveedoresRepository';
import {
  ArrowLeft, CheckCircle, CircleOff, Loader2, Pencil, Plus, Search, Trash2, Truck, X,
} from 'lucide-react';

export default function GestionProveedores() {
  const navigate = useNavigate();
  const { darkMode } = useTheme();
  const [proveedores, setProveedores] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [modal, setModal] = useState(null);
  const [nombre, setNombre] = useState('');
  const [editandoId, setEditandoId] = useState(null);

  const card = darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-white';
  const input = darkMode
    ? 'border-slate-700 bg-slate-950 text-white placeholder-slate-500'
    : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setProveedores(await proveedoresRepository.listar());
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudieron cargar los proveedores.' });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = proveedores.filter((proveedor) =>
    proveedor.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  );

  const abrirCrear = () => {
    setNombre('');
    setEditandoId(null);
    setModal('crear');
  };

  const abrirEditar = (proveedor) => {
    setNombre(proveedor.nombre);
    setEditandoId(proveedor.id);
    setModal('editar');
  };

  const cerrarModal = () => {
    if (guardando) return;
    setModal(null);
    setNombre('');
    setEditandoId(null);
  };

  const guardar = async (evento) => {
    evento.preventDefault();
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      setMensaje({ tipo: 'error', texto: 'Escribe el nombre del proveedor.' });
      return;
    }
    if (proveedores.some((proveedor) =>
      proveedor.nombre.toLocaleLowerCase() === nombreLimpio.toLocaleLowerCase()
      && proveedor.id !== editandoId
    )) {
      setMensaje({ tipo: 'error', texto: 'Ya existe un proveedor con ese nombre.' });
      return;
    }

    setGuardando(true);
    try {
      if (modal === 'crear') {
        await proveedoresRepository.crear(nombreLimpio);
        setMensaje({ tipo: 'ok', texto: `Proveedor "${nombreLimpio}" creado.` });
      } else {
        await proveedoresRepository.actualizar(editandoId, nombreLimpio);
        setMensaje({ tipo: 'ok', texto: `Proveedor "${nombreLimpio}" actualizado.` });
      }
      setModal(null);
      setNombre('');
      setEditandoId(null);
      await cargar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo guardar el proveedor.' });
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (proveedor) => {
    const activo = proveedor.activo === false;
    try {
      await proveedoresRepository.cambiarEstado(proveedor.id, activo);
      setMensaje({
        tipo: 'ok',
        texto: activo ? `"${proveedor.nombre}" quedó activo.` : `"${proveedor.nombre}" quedó inactivo.`,
      });
      await cargar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo cambiar el estado.' });
    }
  };

  const eliminar = async (proveedor) => {
    if (!window.confirm(`¿Eliminar al proveedor "${proveedor.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await proveedoresRepository.eliminar(proveedor.id);
      setMensaje({ tipo: 'ok', texto: `Proveedor "${proveedor.nombre}" eliminado.` });
      await cargar();
    } catch (error) {
      setMensaje({
        tipo: 'error',
        texto: error.code === '23503'
          ? 'No se puede eliminar porque tiene compras o inventario asociado. Desactívalo para conservar el historial.'
          : error.message || 'No se pudo eliminar el proveedor.',
      });
    }
  };

  return (
    <main className={`min-h-screen p-4 md:p-8 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <div className="mx-auto max-w-5xl">
        <header className={`mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${card}`}>
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-cyan-500/10 p-3 text-cyan-500"><Truck size={22} /></span>
            <div>
              <h1 className={`text-2xl font-black ${strong}`}>Gestión de Proveedores</h1>
              <p className={`mt-1 text-sm ${muted}`}>Crea, edita, activa o desactiva proveedores de planta.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/panel')}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${input}`}
          >
            <ArrowLeft size={16} /> Volver al panel
          </button>
        </header>

        {mensaje && (
          <div className={`mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            mensaje.tipo === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-500'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
          }`}>
            <span>{mensaje.texto}</span>
            <button type="button" onClick={() => setMensaje(null)} aria-label="Cerrar mensaje"><X size={16} /></button>
          </div>
        )}

        <section className={`overflow-hidden rounded-2xl border ${card}`}>
          <div className={`flex flex-wrap items-center justify-between gap-3 border-b p-4 ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${muted}`} />
              <input
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder="Buscar proveedor..."
                className={`w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-cyan-500 ${input}`}
              />
            </div>
            <button
              type="button"
              onClick={abrirCrear}
              className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-700"
            >
              <Plus size={17} /> Nuevo proveedor
            </button>
          </div>

          {cargando ? (
            <div className={`flex items-center justify-center gap-2 p-12 ${muted}`}><Loader2 size={18} className="animate-spin" /> Cargando proveedores...</div>
          ) : visibles.length === 0 ? (
            <p className={`p-10 text-center text-sm ${muted}`}>
              {busqueda ? 'No hay proveedores que coincidan con la búsqueda.' : 'Todavía no hay proveedores registrados.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {visibles.map((proveedor) => {
                const activo = proveedor.activo !== false;
                return (
                  <article key={proveedor.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div className="min-w-[180px] flex-1">
                      <p className={`font-bold ${strong}`}>{proveedor.nombre}</p>
                      <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        activo ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-400'
                      }`}>
                        {activo ? <CheckCircle size={13} /> : <CircleOff size={13} />}
                        {activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => cambiarEstado(proveedor)}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                          activo
                            ? 'border-amber-500/30 text-amber-600 hover:bg-amber-500/10'
                            : 'border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10'
                        }`}
                      >
                        {activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button type="button" onClick={() => abrirEditar(proveedor)} className={`rounded-lg border p-2 ${input}`} aria-label={`Editar ${proveedor.nombre}`} title="Editar">
                        <Pencil size={16} />
                      </button>
                      <button type="button" onClick={() => eliminar(proveedor)} className="rounded-lg border border-red-500/20 p-2 text-red-500 transition hover:bg-red-500/10" aria-label={`Eliminar ${proveedor.nombre}`} title="Eliminar">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={guardar} className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${card}`}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className={`text-lg font-black ${strong}`}>{modal === 'crear' ? 'Nuevo proveedor' : 'Editar proveedor'}</h2>
              <button type="button" onClick={cerrarModal} className={`rounded-lg border p-2 ${input}`} aria-label="Cerrar modal"><X size={17} /></button>
            </div>
            <label className={`mb-5 block text-sm font-semibold ${muted}`}>
              Nombre del proveedor
              <input
                autoFocus
                required
                maxLength={120}
                value={nombre}
                onChange={(evento) => setNombre(evento.target.value)}
                className={`mt-2 w-full rounded-xl border px-3 py-2.5 outline-none focus:border-cyan-500 ${input}`}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={cerrarModal} disabled={guardando} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${input}`}>Cancelar</button>
              <button type="submit" disabled={guardando} className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {guardando && <Loader2 size={16} className="animate-spin" />}
                {modal === 'crear' ? 'Crear proveedor' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
