import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { rutasRepository } from '../../repositories/rutasRepository';
import { authRepository } from '../../repositories/AuthRepository';
import MapaRuta from '../../components/MapaRuta';
import {
  ArrowDown, ArrowLeft, ArrowUp, AlertCircle, CheckCircle, Loader2,
  ChevronDown, LogOut, Map, MapPinned, Moon, Plus, Route, Save, Sun, Truck, X,
} from 'lucide-react';

const FORM_VACIO = { id: null, nombre: '', repartidor_id: '', sucursal_ids: [] };

export default function GestionRutas() {
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [rutas, setRutas] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [form, setForm] = useState(null);
  const [mapaAbierto, setMapaAbierto] = useState({});

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950 border-slate-700 text-white'
    : 'bg-gray-50 border-gray-300 text-gray-900';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';

  const cargar = useCallback(() => rutasRepository.listar(), []);

  useEffect(() => {
    let vigente = true;
    cargar()
      .then((datos) => {
        if (!vigente) return;
        setRutas(datos.rutas);
        setSucursales(datos.sucursales);
        setRepartidores(datos.repartidores);
      })
      .catch((error) => {
        if (vigente) setMensaje({ tipo: 'error', texto: error.message || 'No se pudieron cargar las rutas' });
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [cargar]);

  // Auto-cierre del mensaje de éxito a los 5 segundos.
  useEffect(() => {
    if (mensaje?.tipo !== 'ok') return;
    const t = setTimeout(() => setMensaje(null), 5000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const cargarDatos = async () => {
    const datos = await cargar();
    setRutas(datos.rutas);
    setSucursales(datos.sucursales);
    setRepartidores(datos.repartidores);
  };

  const editar = (ruta) => setForm({
    id: ruta.id,
    nombre: ruta.nombre,
    repartidor_id: ruta.repartidor_id || '',
    sucursal_ids: ruta.sucursales.map((s) => s.id),
  });

  const moverParada = (indice, desplazamiento) => {
    setForm((actual) => {
      const sucursal_ids = [...actual.sucursal_ids];
      const destino = indice + desplazamiento;
      [sucursal_ids[indice], sucursal_ids[destino]] = [sucursal_ids[destino], sucursal_ids[indice]];
      return { ...actual, sucursal_ids };
    });
  };

  const alternarSucursal = (id) => {
    setForm((actual) => ({
      ...actual,
      sucursal_ids: actual.sucursal_ids.includes(id)
        ? actual.sucursal_ids.filter((sucursalId) => sucursalId !== id)
        : [...actual.sucursal_ids, id],
    }));
  };

  const guardar = async (event) => {
    event.preventDefault();
    if (!form.nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'Escribe el nombre de la ruta' });
      return;
    }

    try {
      setGuardando(true);
      setMensaje(null);
      await rutasRepository.guardar({
        ...form,
        sucursal_ids: form.sucursal_ids,
      });
      setForm(null);
      setMensaje({ tipo: 'ok', texto: 'Ruta guardada correctamente' });
      await cargarDatos();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo guardar la ruta' });
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (ruta) => {
    try {
      await rutasRepository.cambiarEstado(ruta.id, !ruta.activo);
      await cargarDatos();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo actualizar la ruta' });
    }
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <header className={`sticky top-0 z-20 border-b backdrop-blur-xl ${darkMode ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-gray-200'}`}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/panel')} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${input}`} aria-label="Volver al panel">
            <ArrowLeft size={18} />
            <span className="hidden sm:inline">Panel principal</span>
          </button>
          <div className="flex-1">
            <h1 className="font-black text-lg flex items-center gap-2"><Route size={20} className="text-amber-500" /> Rutas de reparto</h1>
            <p className={`text-xs ${muted}`}>Ordena las sucursales y asigna un repartidor a cada ruta</p>
          </div>
          <button onClick={toggleTheme} className={`p-2.5 rounded-xl border ${input}`} aria-label="Cambiar tema">
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => authRepository.logout()} className={`p-2.5 rounded-xl border ${input}`} aria-label="Salir">
            <LogOut size={18} />
          </button>
          <button
            onClick={() => setForm({ ...FORM_VACIO, sucursal_ids: [] })}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400"
          >
            <Plus size={17} /> Nueva ruta
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {mensaje && (
          <div className={`mb-5 flex items-center gap-3 rounded-xl border p-4 text-sm ${
            mensaje.tipo === 'ok'
              ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
              : 'border-red-500/40 bg-red-950/30 text-red-300'
          }`}>
            {mensaje.tipo === 'ok' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span className="flex-1">{mensaje.texto}</span>
            <button onClick={() => setMensaje(null)} aria-label="Cerrar mensaje"><X size={16} /></button>
          </div>
        )}

        {cargando ? (
          <div className={`flex items-center justify-center gap-3 rounded-2xl border p-12 ${card}`}>
            <Loader2 className="animate-spin text-amber-500" /> Cargando rutas...
          </div>
        ) : rutas.length === 0 ? (
          <div className={`rounded-2xl border p-10 text-center ${card}`}>
            <MapPinned className="mx-auto mb-3 text-amber-500" size={32} />
            <p className="font-bold">Todavía no hay rutas</p>
            <p className={`mt-1 text-sm ${muted}`}>Crea una ruta y añade sus sucursales en el orden de visita.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rutas.map((ruta) => (
              <article key={ruta.id} className={`rounded-2xl border p-5 ${card}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black">{ruta.nombre}</h2>
                    <p className={`mt-1 flex items-center gap-2 text-sm ${muted}`}>
                      <Truck size={15} />
                      {ruta.repartidor?.nombre_completo || 'Sin repartidor asignado'}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ruta.activo ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
                    {ruta.activo ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <ol className="mt-4 space-y-2">
                  {ruta.sucursales.map((sucursal, index) => (
                    <li key={sucursal.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${darkMode ? 'bg-slate-950' : 'bg-gray-50'}`}>
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-500">{index + 1}</span>
                      <span className="font-medium">{sucursal.nombre}</span>
                      <span className={`ml-auto text-xs ${muted}`}>Zona: {sucursal.sector}</span>
                    </li>
                  ))}
                  {!ruta.sucursales.length && <li className={`text-sm ${muted}`}>Sin sucursales asignadas</li>}
                </ol>
                {ruta.sucursales.length > 0 && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setMapaAbierto((actual) => ({
                        ...actual,
                        [ruta.id]: !actual[ruta.id],
                      }))}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold ${input}`}
                    >
                      <span className="flex items-center gap-2"><Map size={16} /> Ver mapa de paradas</span>
                      <ChevronDown size={16} className={mapaAbierto[ruta.id] ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    </button>
                    {mapaAbierto[ruta.id] && (
                      <div className={`mt-2 overflow-hidden rounded-xl border ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                        <MapaRuta
                          paradas={ruta.sucursales}
                        />
                        {ruta.sucursales.some((sucursal) => sucursal.latitude == null || sucursal.longitude == null) && (
                          <p className={`border-t px-3 py-2 text-xs ${muted} ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                            Algunas sucursales no tienen ubicación. Edítalas en Sucursales y marca su punto en el mapa.
                          </p>
                        )}
                        {!ruta.sucursales.some((sucursal) => sucursal.latitude != null && sucursal.longitude != null) && (
                          <p className={`border-t px-3 py-2 text-xs text-amber-500 ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                            Marca la ubicación de al menos una sucursal para verla en el mapa.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className={`mt-4 flex justify-end gap-2 border-t pt-4 ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                  <button onClick={() => cambiarEstado(ruta)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${input}`}>
                    {ruta.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => editar(ruta)} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">
                    Editar ruta
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {form && (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <form onSubmit={guardar} className={`my-auto max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-2xl ${card}`}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-black">{form.id ? 'Editar ruta' : 'Crear ruta'}</h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Cerrar"><X size={20} /></button>
            </div>
            <label className="mb-4 block text-sm font-semibold">
              Nombre de la ruta
              <input
                required
                value={form.nombre}
                onChange={(event) => setForm({ ...form, nombre: event.target.value })}
                className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 ${input}`}
                placeholder="Ej. Ruta Centro"
              />
            </label>
            <label className="mb-5 block text-sm font-semibold">
              Repartidor
              <select
                value={form.repartidor_id}
                onChange={(event) => setForm({ ...form, repartidor_id: event.target.value })}
                className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 ${input}`}
              >
                <option value="">Sin asignar</option>
                {repartidores.map((repartidor) => (
                  <option key={repartidor.id} value={repartidor.id}>{repartidor.nombre_completo}</option>
                ))}
              </select>
              {!repartidores.length && <span className={`mt-1 block text-xs ${muted}`}>Crea primero un usuario con rol Despachador.</span>}
            </label>
            <div className="mb-5">
              <h3 className="mb-2 text-sm font-semibold">Paradas en orden de visita</h3>
              {form.sucursal_ids.length > 0 && (
                <ol className="mb-3 space-y-2">
                  {form.sucursal_ids.map((id, index) => {
                    const sucursal = sucursales.find((s) => s.id === id);
                    return (
                      <li key={id} className={`flex items-center gap-2 rounded-lg border p-2 ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-gray-200 bg-gray-50'}`}>
                        <span className="w-6 text-center text-xs font-bold text-amber-500">{index + 1}</span>
                        <span className="flex-1 text-sm">{sucursal?.nombre} <span className={muted}>(Zona: {sucursal?.sector})</span></span>
                        <button type="button" disabled={index === 0} onClick={() => moverParada(index, -1)} className="rounded p-1 disabled:opacity-30" aria-label="Subir parada"><ArrowUp size={16} /></button>
                        <button type="button" disabled={index === form.sucursal_ids.length - 1} onClick={() => moverParada(index, 1)} className="rounded p-1 disabled:opacity-30" aria-label="Bajar parada"><ArrowDown size={16} /></button>
                        <button type="button" onClick={() => alternarSucursal(id)} className="rounded p-1 text-red-400" aria-label="Quitar sucursal"><X size={16} /></button>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className={`max-h-48 space-y-1 overflow-y-auto rounded-xl border p-2 ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
                {sucursales.map((sucursal) => (
                  <label key={sucursal.id} className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`}>
                    <input
                      type="checkbox"
                      checked={form.sucursal_ids.includes(sucursal.id)}
                      onChange={() => alternarSucursal(sucursal.id)}
                      className="accent-amber-500"
                    />
                    <span>{sucursal.nombre}</span>
                    <span className={`ml-auto text-xs ${muted}`}>Zona: {sucursal.sector}</span>
                  </label>
                ))}
                {!sucursales.length && <p className={`p-2 text-sm ${muted}`}>No hay sucursales creadas.</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${input}`}>Cancelar</button>
              <button disabled={guardando} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60">
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar ruta
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
