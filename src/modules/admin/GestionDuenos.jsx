import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { authRepository } from '../../repositories/AuthRepository';
import { duenosRepository } from '../../repositories/duenosRepository';
import { sucursalesRepository } from '../../repositories/sucursalesRepository';
import ModalConfirmar from '../../components/ModalConfirmar';
import {
  LogOut, Sun, Moon, Plus, Pencil, Trash2, X, ArrowLeft,
  CheckCircle, AlertCircle, Users, MapPin, Loader2, Crown,
} from 'lucide-react';

const EMPTY_FORM = { nombre: '', documento: '', telefono: '', email: '', notas: '', activo: true };

export default function GestionDuenos() {
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [duenos, setDuenos] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [sqlFalta, setSqlFalta] = useState(false);

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editandoId, setEditandoId] = useState(null);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [procesandoConfirm, setProcesandoConfirm] = useState(false);

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500 focus:ring-amber-500/20'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-amber-500/20';
  const label = darkMode ? 'text-slate-300' : 'text-gray-600';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';
  const rowHover = darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50';

  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);
      setMensaje(null);

      // Primero se pregunta si el SQL ya esta aplicado, para no
      // mostrar una pantalla de errores al admin.
      const listo = await duenosRepository.disponible();
      if (!listo) {
        setSqlFalta(true);
        setDuenos([]);
        setSucursales([]);
        return;
      }
      setSqlFalta(false);

      // Las sucursales se piden primero porque listarConSucursales
      // las necesita para resolver los nombres de cada dueño.
      const sucursalesListas = await sucursalesRepository.listar();
      const conNombres = await duenosRepository.listarConSucursales(sucursalesListas);

      setSucursales(sucursalesListas);
      setDuenos(conNombres);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudieron cargar los dueños' });
    } finally {
      setCargando(false);
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

  // Que sucursales todavia no son de nadie
  const libres = useMemo(() => {
    const tomadas = new Set();
    for (const d of duenos) for (const id of d.sucursal_ids) tomadas.add(id);
    return sucursales.filter((s) => !tomadas.has(s.id));
  }, [duenos, sucursales]);

  const abrirNuevo = () => {
    setForm(EMPTY_FORM);
    setSeleccionadas([]);
    setEditandoId(null);
    setModal('dueño');
  };

  const abrirEditar = (d) => {
    setForm({
      nombre: d.nombre,
      documento: d.documento || '',
      telefono: d.telefono || '',
      email: d.email || '',
      notas: d.notas || '',
      activo: d.activo,
    });
    setSeleccionadas(d.sucursal_ids);
    setEditandoId(d.id);
    setModal('dueño');
  };

  const abrirSucursales = (d) => {
    setSeleccionadas(d.sucursal_ids);
    setEditandoId(d.id);
    setForm({ ...EMPTY_FORM, nombre: d.nombre });
    setModal('sucursales');
  };

  const alternarSucursal = (id) => {
    setSeleccionadas((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id]
    );
  };

  const guardarDueño = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);

    try {
      let id = editandoId;
      if (id) {
        await duenosRepository.actualizar(id, form);
      } else {
        const creado = await duenosRepository.crear(form);
        id = creado.id;
      }

      if (seleccionadas.length) {
        await duenosRepository.guardarSucursales(id, seleccionadas);
      } else if (!editandoId) {
        await duenosRepository.guardarSucursales(id, []);
      }

      setMensaje({
        tipo: 'ok',
        texto: editandoId ? 'Dueño actualizado' : 'Dueño creado',
      });
      setModal(null);
      await cargarDatos();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo guardar el dueño' });
    } finally {
      setEnviando(false);
    }
  };

  const guardarSoloSucursales = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setMensaje(null);

    try {
      await duenosRepository.guardarSucursales(editandoId, seleccionadas);
      setMensaje({ tipo: 'ok', texto: 'Sucursales actualizadas' });
      setModal(null);
      await cargarDatos();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudieron guardar las sucursales' });
    } finally {
      setEnviando(false);
    }
  };

  const eliminarDueño = async (d) => {
    const usos = await duenosRepository.contarUsos(d.id);
    const tieneUsos = usos.sucursales > 0 || usos.usuarios > 0;

    if (tieneUsos) {
      const detalle = [];
      if (usos.sucursales) detalle.push(`${usos.sucursales} sucursal(es)`);
      if (usos.usuarios) detalle.push(`${usos.usuarios} usuario(s)`);
      setConfirmar({
        titulo: `No se puede eliminar a "${d.nombre}"`,
        mensaje: `Tiene ${detalle.join(' y ')}. ¿Marcarlo como inactivo en su lugar? Así deja de ser dueño de esas sucursales, pero no se pierde el historial.`,
        labelConfirmar: 'Marcar inactivo',
        variante: 'warning',
        onConfirmar: async () => {
          try {
            setProcesandoConfirm(true);
            await duenosRepository.desactivar(d.id, false);
            setMensaje({ tipo: 'ok', texto: `${d.nombre} quedó inactivo` });
            await cargarDatos();
          } catch (err) {
            setMensaje({ tipo: 'error', texto: err.message || 'No se pudo desactivar' });
          } finally {
            setProcesandoConfirm(false);
            setConfirmar(null);
          }
        },
      });
    } else {
      setConfirmar({
        titulo: `Eliminar a "${d.nombre}"`,
        mensaje: 'Esta acción no se puede deshacer.',
        labelConfirmar: 'Eliminar',
        variante: 'danger',
        onConfirmar: async () => {
          try {
            setProcesandoConfirm(true);
            await duenosRepository.eliminar(d.id);
            setMensaje({ tipo: 'ok', texto: 'Dueño eliminado' });
            await cargarDatos();
          } catch (err) {
            setMensaje({ tipo: 'error', texto: err.message || 'No se pudo eliminar' });
          } finally {
            setProcesandoConfirm(false);
            setConfirmar(null);
          }
        },
      });
    }
  };

  if (sqlFalta) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-800'}`}>
        <div className="max-w-2xl mx-auto px-4 py-16">
          <button onClick={() => navigate('/panel')} className="inline-flex items-center gap-2 text-sm font-semibold mb-8 opacity-70 hover:opacity-100">
            <ArrowLeft size={16} /> Volver al panel
          </button>
          <div className={`${card} border rounded-2xl p-8 text-center`}>
            <AlertCircle size={40} className="mx-auto mb-4 text-amber-500" />
            <h1 className={`text-xl font-black mb-3 ${strong}`}>Falta aplicar el SQL de dueños</h1>
            <p className={`text-sm ${muted} mb-6`}>
              Todavía no existe la tabla <code className="text-amber-500">duenos</code> en la base.
              Corré <code className="text-amber-500">DUENOS-PARTE1</code>,{' '}
              <code className="text-amber-500">DUENOS-PARTE2</code> y{' '}
              <code className="text-amber-500">DUENOS-PARTE3</code> de la carpeta{' '}
              <code className="text-amber-500">supabase</code>, en ese orden, y volvé a cargar
              esta pantalla.
            </p>
            <button
              onClick={() => {
                // Se olvida el resultado cacheado para volver a preguntar
                // a la base: capaz recien se corrio el SQL.
                duenosRepository.olvidarCache();
                cargarDatos();
              }}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm"
            >
              Volver a intentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-200' : 'bg-gray-50 text-gray-800'}`}>
      {/* Barra superior */}
      <header className={`${card} border-b sticky top-0 z-30`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <button onClick={() => navigate('/panel')} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Volver al panel">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Crown size={20} className="text-amber-500" />
            <h1 className={`font-black tracking-tight ${strong}`}>Dueños de Sucursales</h1>
          </div>
          <button onClick={toggleTheme} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Cambiar modo">
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={() => authRepository.logout()} className={`p-2.5 rounded-xl border transition ${input}`} aria-label="Salir">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {mensaje && (
          <div className={`mb-6 p-4 border text-sm flex items-center gap-3 rounded-xl ${mensaje.tipo === 'ok'
            ? darkMode ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : darkMode ? 'bg-red-950/50 border-red-500/50 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {mensaje.tipo === 'ok' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{mensaje.texto}</span>
          </div>
        )}

        {cargando ? (
          <div className="flex items-center justify-center gap-3 py-20">
            <Loader2 size={24} className="animate-spin text-amber-500" />
            <span className={muted}>Cargando...</span>
          </div>
        ) : (
          <>
            {/* Tarjetas de resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className={`${card} border rounded-2xl p-4`}>
                <p className={`text-xs uppercase tracking-wider ${muted} mb-1`}>Dueños</p>
                <p className={`text-3xl font-black ${strong}`}>{duenos.length}</p>
              </div>
              <div className={`${card} border rounded-2xl p-4`}>
                <p className={`text-xs uppercase tracking-wider ${muted} mb-1`}>Sucursales</p>
                <p className={`text-3xl font-black ${strong}`}>{sucursales.length}</p>
              </div>
              <div className={`${card} border rounded-2xl p-4`}>
                <p className={`text-xs uppercase tracking-wider ${muted} mb-1`}>Sin dueño</p>
                <p className={`text-3xl font-black ${libres.length ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {libres.length}
                </p>
              </div>
              <div className={`${card} border rounded-2xl p-4`}>
                <p className={`text-xs uppercase tracking-wider ${muted} mb-1`}>Inactivos</p>
                <p className={`text-3xl font-black ${strong}`}>{duenos.filter((d) => !d.activo).length}</p>
              </div>
            </div>

            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-lg font-black ${strong}`}>Listado</h2>
              <button
                onClick={abrirNuevo}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition"
              >
                <Plus size={18} /> Nuevo dueño
              </button>
            </div>

            {duenos.length === 0 ? (
              <div className={`${card} border rounded-2xl p-10 text-center`}>
                <Users size={40} className={`mx-auto mb-4 ${muted}`} />
                <p className={`font-bold mb-2 ${strong}`}>Todavía no hay dueños</p>
                <p className={`text-sm ${muted}`}>Creá el primero y asignale sus sucursales.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {duenos.map((d) => (
                  <div key={d.id} className={`${card} border rounded-2xl p-4 flex flex-wrap items-center gap-4`}>
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <Crown size={16} className="text-amber-500" />
                        <p className={`font-black ${strong}`}>{d.nombre}</p>
                        {!d.activo && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-500/20 text-slate-400">
                            Inactivo
                          </span>
                        )}
                      </div>
                      {d.telefono || d.email ? (
                        <p className={`text-xs mt-1 ${muted}`}>
                          {[d.telefono, d.email].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {d.sucursales.length ? (
                        d.sucursales.map((s) => (
                          <span
                            key={s.id}
                            className="px-2 py-1 rounded-lg text-xs font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20"
                          >
                            {s.nombre}
                          </span>
                        ))
                      ) : (
                        <span className={`text-xs ${muted}`}>Sin sucursales</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => abrirSucursales(d)}
                        className={`p-2 rounded-xl border transition ${input}`}
                        aria-label="Asignar sucursales"
                        title="Asignar sucursales"
                      >
                        <MapPin size={16} />
                      </button>
                      <button
                        onClick={() => abrirEditar(d)}
                        className={`p-2 rounded-xl border transition ${input}`}
                        aria-label="Editar"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => eliminarDueño(d)}
                        className="p-2 rounded-xl border transition hover:border-red-500 hover:text-red-500"
                        aria-label="Eliminar"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {libres.length > 0 && (
              <div className={`mt-8 p-4 border rounded-2xl ${darkMode ? 'bg-amber-950/30 border-amber-500/30' : 'bg-amber-50 border-amber-200'}`}>
                <p className={`text-sm font-bold mb-2 ${strong}`}>
                  Sucursales todavía sin dueño ({libres.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {libres.map((s) => (
                    <span key={s.id} className={`px-2 py-1 rounded-lg text-xs font-semibold ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-white text-gray-600 border border-gray-200'}`}>
                      {s.nombre}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className={`${card} border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between p-5 border-b border-inherit">
              <h2 className={`text-lg font-black ${strong}`}>
                {modal === 'sucursales'
                  ? `Sucursales de ${form.nombre}`
                  : editandoId ? 'Editar dueño' : 'Nuevo dueño'}
              </h2>
              <button onClick={() => setModal(null)} className={`p-2 rounded-xl ${input}`} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={modal === 'sucursales' ? guardarSoloSucursales : guardarDueño} className="p-5 space-y-4">
              {modal === 'dueño' && (
                <>
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Nombre *</label>
                    <input
                      required
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      className={`w-full px-3.5 py-2.5 border rounded-xl text-sm ${input}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Documento</label>
                      <input
                        value={form.documento}
                        onChange={(e) => setForm({ ...form, documento: e.target.value })}
                        className={`w-full px-3.5 py-2.5 border rounded-xl text-sm ${input}`}
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Teléfono</label>
                      <input
                        value={form.telefono}
                        onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                        className={`w-full px-3.5 py-2.5 border rounded-xl text-sm ${input}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Correo</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={`w-full px-3.5 py-2.5 border rounded-xl text-sm ${input}`}
                    />
                  </div>

                  {editandoId && (
                    <label className={`flex items-center gap-2 text-sm ${normal} cursor-pointer`}>
                      <input
                        type="checkbox"
                        checked={form.activo}
                        onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                        className="w-4 h-4 rounded accent-amber-500"
                      />
                      Dueño activo
                    </label>
                  )}
                </>
              )}

              <div>
                <p className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                  Sucursales ({seleccionadas.length} de {sucursales.length})
                </p>
                <div className={`border rounded-xl max-h-64 overflow-y-auto ${input.split(' ').slice(0, 2).join(' ')}`}>
                  {sucursales.map((s) => (
                    <label
                      key={s.id}
                      className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer border-b last:border-0 transition ${rowHover}`}
                    >
                      <input
                        type="checkbox"
                        checked={seleccionadas.includes(s.id)}
                        onChange={() => alternarSucursal(s.id)}
                        className="w-4 h-4 rounded accent-amber-500"
                      />
                      <span className={`text-sm flex-1 ${normal}`}>{s.nombre}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${muted}`}>{s.sector}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className={`flex-1 py-3 border rounded-xl font-bold text-sm transition ${input}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm transition disabled:opacity-50"
                >
                  {enviando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ModalConfirmar
        config={confirmar}
        onCerrar={() => { if (!procesandoConfirm) setConfirmar(null); }}
        cargando={procesandoConfirm}
      />
    </div>
  );
}
