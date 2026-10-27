import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usuariosRepository } from '../../repositories/usuariosRepository';
import { authRepository } from '../../repositories/AuthRepository';
import { duenosRepository } from '../../repositories/duenosRepository';
import {
  LogOut, Users, Sun, Moon, Plus, Pencil, Trash2, KeyRound, X,
  Search, ArrowLeft, CheckCircle, AlertCircle, ShieldCheck, Store, UserCog, Loader2, Route, Crown,
  UserX, UserCheck
} from 'lucide-react';

const ROL_COLOR = {
  administrador: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  operador_planta: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  despachador: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  sucursal: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  dueno: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
};

const ROL_LABEL = {
  administrador: 'Administrador',
  operador_planta: 'Operador Planta',
  despachador: 'Despachador',
  sucursal: 'Sucursal',
  dueno: 'Dueño',
};

const RUTA_COLOR = {
  ESTE: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  OESTE: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  NORTE: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  CENTRO: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  SUR: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  PARTICULAR: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};

const EMPTY_FORM = { nombre_completo: '', email: '', password: '', rol_id: '', nombre_sucursal: '', ruta: '', dueno_id: '' };

const obtenerDatosUsuarios = async () => {
  const [usuariosData, roles, sucursales] = await Promise.all([
    usuariosRepository.listarUsuarios(),
    usuariosRepository.listarRoles(),
    usuariosRepository.listarSucursales(),
  ]);
  const correos = await usuariosRepository.listarCorreos();
  const correoPorId = new Map(correos.map((cuenta) => [cuenta.id, cuenta.email]));
  const usuarios = usuariosData.map((u) => ({
    ...u,
    email: correoPorId.get(u.usuario_id) || '',
  }));

  const duenos = await duenosRepository.disponible()
    ? await duenosRepository.listar()
    : [];

  return { usuarios, roles, sucursales, duenos };
};

export default function GestionUsuarios() {
  const { usuario } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [duenos, setDuenos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState(null);

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editandoId, setEditandoId] = useState(null);
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [enviando, setEnviando] = useState(false);

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500 focus:ring-amber-500/20'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-amber-500/20';
  const label = darkMode ? 'text-slate-300' : 'text-gray-600';
  const divider = darkMode ? 'border-slate-800' : 'border-gray-200';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';
  const tableHead = darkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-gray-50 text-gray-600 border-gray-200';
  const rowHover = darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50';

  const cargarDatos = useCallback(async (mostrarCarga = false) => {
    try {
      if (mostrarCarga) setCargando(true);
      const datos = await obtenerDatosUsuarios();
      setUsuarios(datos.usuarios);
      setRoles(datos.roles);
      setSucursales(datos.sucursales);
      setDuenos(datos.duenos);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'Error al cargar los usuarios' });
    } finally {
      setCargando(false);
    }
  }, []);

  // Auto-cierre del mensaje de éxito a los 5 segundos.
  useEffect(() => {
    if (mensaje?.tipo !== 'ok') return;
    const t = setTimeout(() => setMensaje(null), 5000);
    return () => clearTimeout(t);
  }, [mensaje]);

  useEffect(() => {
    let vigente = true;
    obtenerDatosUsuarios()
      .then((datos) => {
        if (!vigente) return;
        setUsuarios(datos.usuarios);
        setRoles(datos.roles);
        setSucursales(datos.sucursales);
        setDuenos(datos.duenos);
      })
      .catch((err) => {
        if (vigente) setMensaje({ tipo: 'error', texto: err.message || 'Error al cargar los usuarios' });
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, []);

  const rolActual = roles.find((r) => String(r.id) === String(form.rol_id))?.nombre || '';
  const esRolSucursal = rolActual === 'sucursal';
  const esRolDueno = rolActual === 'dueno';
  const rutasDisponibles = [...new Set(sucursales.map((s) => s.sector).filter(Boolean))].sort();
  const sucursalesDeRuta = form.ruta
    ? sucursales.filter((s) => s.sector === form.ruta)
    : sucursales;

  const usuariosFiltrados = usuarios.filter((u) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      u.nombre_completo?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.roles?.nombre?.toLowerCase().includes(q) ||
      u.sucursales?.nombre?.toLowerCase().includes(q) ||
      u.sucursales?.sector?.toLowerCase().includes(q)
    );
  });

  const abrirCrear = () => {
    setForm(EMPTY_FORM);
    setEditandoId(null);
    setModal('crear');
  };

  const abrirEditar = (u) => {
    setForm({
      nombre_completo: u.nombre_completo || '',
      email: u.email || '',
      password: '',
      rol_id: u.rol_id || '',
      nombre_sucursal: u.sucursales?.nombre || '',
      ruta: u.sucursales?.sector || '',
      // Para que aparezca ya elegido el dueño que tiene asignado
      dueno_id: u.dueno_id || '',
    });
    setEditandoId(u.id);
    setModal('editar');
  };

  const abrirResetear = (u) => {
    setForm({ nombre_completo: u.nombre_completo, email: '', password: '', rol_id: '', nombre_sucursal: '', ruta: '' });
    setNuevaPassword('');
    setEditandoId(u.id);
    setModal('resetear');
  };

  const cerrarModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setEditandoId(null);
    setNuevaPassword('');
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setMensaje(null);

    if (rolActual === 'sucursal' && !form.ruta) {
      setMensaje({ tipo: 'error', texto: 'Selecciona la ruta a la que pertenece el usuario' });
      return;
    }

    setEnviando(true);

    try {
      // La sucursal puede no existir: si es nueva, se crea sola en esa ruta
      const sucursal = esRolSucursal && form.ruta
        ? await usuariosRepository.resolverSucursal(form.nombre_sucursal, form.ruta)
        : null;

      if (modal === 'crear') {
        await usuariosRepository.crearUsuario({
          email: form.email,
          password: form.password,
          nombre_completo: form.nombre_completo,
          rol_id: form.rol_id,
          sucursal_id: sucursal?.id || null,
          dueno_id: esRolDueno && form.dueno_id ? Number(form.dueno_id) : null,
        });

        const extra = sucursal?.creada
          ? ` La sucursal "${sucursal.nombre}" se creó en la ruta ${form.ruta}.`
          : '';
        setMensaje({ tipo: 'exito', texto: `Usuario "${form.nombre_completo}" creado correctamente.${extra}` });
      } else {
        await usuariosRepository.actualizarPerfil(editandoId, {
          nombre_completo: form.nombre_completo,
          rol_id: form.rol_id,
          sucursal_id: sucursal?.id || null,
          dueno_id: esRolDueno && form.dueno_id ? Number(form.dueno_id) : null,
        });
        const usuarioEditado = usuarios.find((u) => u.id === editandoId);
        let mensajeCorreo = '';
        if (form.email.trim() !== (usuarioEditado?.email || '')) {
          if (!usuarioEditado) {
            throw new Error('No se encontró el usuario para actualizar su correo');
          }
          try {
            const respuestaCorreo = await usuariosRepository.actualizarCorreo(
              usuarioEditado.usuario_id,
              form.email
            );
            mensajeCorreo = respuestaCorreo.mensaje || '';
          } catch (errorCorreo) {
            throw new Error(
              `El perfil se guardó, pero no se pudo cambiar el correo: ${errorCorreo.message}`,
              { cause: errorCorreo }
            );
          }
        }

        const extra = sucursal?.creada
          ? ` La sucursal "${sucursal.nombre}" se creó en la ruta ${form.ruta}.`
          : '';
        setMensaje({
          tipo: 'exito',
          texto: `Usuario actualizado correctamente.${extra} ${mensajeCorreo}`.trim(),
        });
      }
      cerrarModal();
      cargarDatos(true);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'Error al guardar' });
    } finally {
      setEnviando(false);
    }
  };

  const handleResetear = async (e) => {
    e.preventDefault();
    setMensaje(null);
    setEnviando(true);

    const objetivo = usuarios.find((u) => u.id === editandoId);

    try {
      await usuariosRepository.resetearPassword(objetivo.usuario_id, nuevaPassword);
      setMensaje({ tipo: 'exito', texto: `Contraseña de "${objetivo.nombre_completo}" restablecida` });
      cerrarModal();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'Error al restablecer la contraseña' });
    } finally {
      setEnviando(false);
    }
  };

  const handleEliminar = async (u) => {
    const confirmado = window.confirm(
      `¿Eliminar a "${u.nombre_completo}"?\n\nEsta acción quitará su acceso al sistema de forma permanente.`
    );
    if (!confirmado) return;

    setMensaje(null);
    try {
      await usuariosRepository.eliminarUsuario(u.usuario_id);
      setMensaje({ tipo: 'exito', texto: `Usuario "${u.nombre_completo}" eliminado` });
      cargarDatos(true);
    } catch (err) {
      // La Edge Function responde con tiene_historial cuando el
      // usuario tiene pedidos o despachos. Borrar a alguien con
      // operaciones registradas rompería la trazabilidad, así que
      // en ese caso se ofrece desactivar, que es lo correcto.
      if (err.tiene_historial) {
        const desactivar = window.confirm(
          `${err.message}\n\n¿Desactivarlo ahora? Podés reactivarlo después.`
        );

        if (desactivar) {
          setMensaje(null);
          try {
            await usuariosRepository.cambiarEstadoUsuario(u.usuario_id, false);
            setMensaje({
              tipo: 'exito',
              texto: `"${u.nombre_completo}" quedó desactivado. Ya no puede entrar, y sus pedidos y firmas quedan intactos.`,
            });
            cargarDatos(true);
          } catch (errDesact) {
            setMensaje({
              tipo: 'error',
              texto: errDesact.message || 'No se pudo desactivar',
            });
          }
        }
        return;
      }

      setMensaje({ tipo: 'error', texto: err.message || 'Error al eliminar' });
    }
  };

  // Desactivar o reactivar sin pasar por el borrado. Un usuario
  // desactivado conserva su historial y no puede iniciar sesión.
  const handleCambiarEstado = async (u) => {
    const activar = u.activo === false;
    const confirmado = window.confirm(
      activar
        ? `¿Reactivar a "${u.nombre_completo}"? Va a poder volver a entrar al sistema.`
        : `¿Desactivar a "${u.nombre_completo}"?\n\nVa a dejar de poder entrar, pero sus pedidos, despachos y firmas quedan como estaban.`
    );
    if (!confirmado) return;

    setMensaje(null);
    try {
      await usuariosRepository.cambiarEstadoUsuario(u.usuario_id, activar);
      setMensaje({
        tipo: 'exito',
        texto: activar
          ? `"${u.nombre_completo}" quedó reactivado`
          : `"${u.nombre_completo}" quedó desactivado`,
      });
      cargarDatos(true);
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err.message || 'No se pudo cambiar el estado',
      });
    }
  };

  return (
    <div className={`min-h-screen p-4 md:p-6 lg:p-8 transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      {/* Encabezado */}
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center p-4 md:p-6 rounded-2xl shadow mb-6 border gap-4 transition-colors duration-300 ${card}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-amber-500 font-semibold text-xs uppercase tracking-wider mb-1">
            <Users size={16} className="shrink-0" /> Administración de Usuarios
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight break-words">Gestión de Usuarios</h1>
          <p className={`text-xs sm:text-sm mt-1 ${muted}`}>
            {usuarios.length} usuario{usuarios.length === 1 ? '' : 's'} registrado{usuarios.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto shrink-0 flex-wrap">
          <button
            onClick={toggleTheme}
            aria-label="Cambiar modo"
            className={`p-2.5 rounded-xl border transition shrink-0 ${darkMode ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-gray-100 border-gray-300 text-amber-600 hover:bg-gray-200'}`}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={() => navigate('/admin')}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border transition ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'}`}
          >
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Volver al Panel</span>
          </button>
          <button
            onClick={() => authRepository.logout()}
            className="flex items-center gap-2 bg-red-950/50 hover:bg-red-900/60 border border-red-800/50 text-red-300 px-3 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            <LogOut size={16} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>

      {mensaje && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 shadow-lg text-sm ${mensaje.tipo === 'exito' ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200' : 'bg-red-950/50 border-red-500/50 text-red-200'}`}>
          {mensaje.tipo === 'exito' ? <CheckCircle size={20} className="text-emerald-400 shrink-0" /> : <AlertCircle size={20} className="text-red-400 shrink-0" />}
          <span className="flex-1">{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="shrink-0 opacity-70 hover:opacity-100">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Barra de herramientas */}
      <div className={`flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-6 ${card} p-4 rounded-2xl border`}>
        <div className="relative flex-1">
          <Search className={`absolute left-3.5 top-3 pointer-events-none ${muted}`} size={18} />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, rol o sucursal..."
            className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
          />
        </div>
        <button
          onClick={abrirCrear}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold px-4 py-3 rounded-xl text-sm uppercase tracking-wide transition shadow-lg shadow-amber-500/25 shrink-0"
        >
          <Plus size={18} /> Nuevo Usuario
        </button>
      </div>

      {/* Lista de usuarios */}
      <div className={`p-4 md:p-6 rounded-2xl shadow border ${card}`}>
        <h2 className={`text-lg font-bold mb-5 border-b pb-3 flex flex-wrap items-center justify-between gap-2 ${strong} ${divider}`}>
          <span className="flex items-center gap-2"><UserCog size={20} className="text-amber-500" /> Usuarios del Sistema</span>
          <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/10 text-amber-500 rounded-lg border border-amber-500/20">
            {usuariosFiltrados.length} visibles
          </span>
        </h2>

        {cargando ? (
          <div className={`flex items-center justify-center gap-3 py-16 ${muted}`}>
            <Loader2 size={20} className="animate-spin" /> Cargando usuarios...
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <p className={`text-center py-16 ${muted}`}>
            {busqueda ? 'Ningún usuario coincide con tu búsqueda.' : 'Aún no hay usuarios registrados.'}
          </p>
        ) : (
          <>
            {/* Vista tabla para escritorio */}
            <div className={`hidden md:block overflow-x-auto rounded-xl border ${divider}`}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`text-xs font-bold uppercase tracking-wider border-b ${tableHead}`}>
                    <th className="p-3.5">Usuario</th>
                    <th className="p-3.5">Rol</th>
                    <th className="p-3.5">Sucursal</th>
                    <th className="p-3.5">Alta</th>
                    <th className="p-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-sm ${darkMode ? 'divide-slate-800' : 'divide-gray-200'} ${normal}`}>
                  {usuariosFiltrados.map((u) => {
                    const esYo = u.usuario_id === usuario?.id;
                    const rol = u.roles?.nombre || 'administrador';
                    return (
                      <tr key={u.id} className={`transition ${rowHover}`}>
                        <td className="p-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center font-bold text-sm shrink-0">
                              {u.nombre_completo?.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className={`font-semibold truncate ${strong}`}>{u.nombre_completo}</div>
                              <div className={`truncate text-xs ${muted}`}>{u.email || 'Correo no disponible'}</div>
                              {esYo && <div className="text-xs text-amber-500">Tu cuenta</div>}
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border inline-block ${ROL_COLOR[rol] || ROL_COLOR.administrador}`}>
                            {ROL_LABEL[rol] || rol}
                          </span>
                        </td>
                        <td className={`p-3.5 ${muted}`}>
                          {u.sucursales?.sector && (
                            <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-md border mr-1.5 whitespace-nowrap ${RUTA_COLOR[u.sucursales.sector] || 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                              {u.sucursales.sector}
                            </span>
                          )}
                          {u.sucursales?.nombre ? (
                            <span className="flex items-center gap-1.5">
                              <Store size={14} className="shrink-0" /> {u.sucursales.nombre}
                            </span>
                          ) : '—'}
                        </td>
                        <td className={`p-3.5 text-xs ${muted}`}>
                          {u.creado_en ? new Date(u.creado_en).toLocaleDateString('es-BO') : '—'}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => abrirEditar(u)}
                              title="Editar"
                              className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 transition"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => abrirResetear(u)}
                              title="Restablecer contraseña"
                              className="p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 transition"
                            >
                              <KeyRound size={15} />
                            </button>
                            <button
                              onClick={() => handleCambiarEstado(u)}
                              disabled={esYo && u.activo !== false}
                              title={
                                esYo && u.activo !== false
                                  ? 'No podés desactivar tu propia cuenta'
                                  : esYo
                                    ? 'Reactivar tu cuenta'
                                  : u.activo === false
                                    ? 'Reactivar: volver a habilitar el acceso'
                                    : 'Desactivar: quitar el acceso sin borrar su historial'
                              }
                              className={`p-2 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed ${
                                u.activo === false
                                  ? 'bg-green-500/10 hover:bg-green-500/20 text-green-500'
                                  : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-500'
                              }`}
                            >
                              {u.activo === false ? <UserCheck size={15} /> : <UserX size={15} />}
                            </button>
                            <button
                              onClick={() => handleEliminar(u)}
                              disabled={esYo}
                              title={
                                esYo
                                  ? 'No puedes eliminar tu propia cuenta'
                                  : 'Eliminar de forma permanente'
                              }
                              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 transition disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Vista tarjetas para móvil */}
            <div className="md:hidden space-y-3">
              {usuariosFiltrados.map((u) => {
                const esYo = u.usuario_id === usuario?.id;
                const rol = u.roles?.nombre || 'administrador';
                return (
                  <div key={u.id} className={`p-4 rounded-xl border ${divider}`}>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center font-bold shrink-0">
                        {u.nombre_completo?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`font-semibold ${strong} break-words`}>{u.nombre_completo}</div>
                        <div className={`mt-0.5 break-all text-xs ${muted}`}>{u.email || 'Correo no disponible'}</div>
                        <span className={`mt-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border inline-block ${ROL_COLOR[rol] || ROL_COLOR.administrador}`}>
                          {ROL_LABEL[rol] || rol}
                        </span>
                      </div>
                    </div>

                    {(u.sucursales?.nombre || u.sucursales?.sector) && (
                      <div className={`flex items-center gap-1.5 flex-wrap text-xs mb-3 ${muted}`}>
                        {u.sucursales?.sector && (
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${RUTA_COLOR[u.sucursales.sector] || 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                            {u.sucursales.sector}
                          </span>
                        )}
                        {u.sucursales?.nombre && (
                          <span className="flex items-center gap-1.5">
                            <Store size={13} /> {u.sucursales.nombre}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => abrirEditar(u)}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-semibold transition"
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      <button
                        onClick={() => abrirResetear(u)}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 text-xs font-semibold transition"
                      >
                        <KeyRound size={14} /> Clave
                      </button>
                      <button
                        onClick={() => handleCambiarEstado(u)}
                        disabled={esYo && u.activo !== false}
                        className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-30 disabled:cursor-not-allowed ${
                          u.activo === false
                            ? 'bg-green-500/10 hover:bg-green-500/20 text-green-500'
                            : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-500'
                        }`}
                      >
                        {u.activo === false ? <UserCheck size={14} /> : <UserX size={14} />}
                        {u.activo === false ? 'Activar' : 'Desactivar'}
                      </button>
                      <button
                        onClick={() => handleEliminar(u)}
                        disabled={esYo}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-semibold transition disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={14} /> Borrar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className={`w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-gray-200'}`}>
            <div className={`flex items-center justify-between p-5 border-b ${divider}`}>
              <h3 className={`text-lg font-bold flex items-center gap-2 ${strong}`}>
                {modal === 'crear' && <><Plus size={20} className="text-amber-500" /> Nuevo Usuario</>}
                {modal === 'editar' && <><Pencil size={20} className="text-amber-500" /> Editar Usuario</>}
                {modal === 'resetear' && <><KeyRound size={20} className="text-blue-500" /> Restablecer Contraseña</>}
              </h3>
              <button onClick={cerrarModal} className={`p-1.5 rounded-lg transition ${muted} hover:bg-gray-500/10`}>
                <X size={20} />
              </button>
            </div>

            {modal === 'resetear' ? (
              <form onSubmit={handleResetear} className="p-5 space-y-4">
                <div className={`p-3 rounded-xl text-sm flex items-start gap-2 ${darkMode ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                  <ShieldCheck size={18} className="shrink-0 mt-0.5" />
                  <span>Se cambiaré la contraseña de <strong>{form.nombre_completo}</strong>. Comunícale la nueva clave de forma segura.</span>
                </div>
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Nueva Contraseña</label>
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={nuevaPassword}
                    onChange={(e) => setNuevaPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold py-3 rounded-xl text-sm uppercase tracking-wide transition shadow-lg shadow-blue-600/25 disabled:opacity-50"
                >
                  {enviando ? 'Actualizando...' : 'Restablecer Contraseña'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleGuardar} className="p-5 space-y-4">
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    value={form.nombre_completo}
                    onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
                    placeholder="Ej: Juan Pérez"
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                  />
                </div>

                {(modal === 'crear' || modal === 'editar') && (
                  <>
                    <div>
                      <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                        {modal === 'crear' ? 'Correo Electrónico *' : 'Correo Electrónico'}
                      </label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="usuario@empresa.com"
                        className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                      />
                      {modal === 'editar' && (
                        <p className={`mt-1.5 text-xs ${muted}`}>
                          Supabase podría enviar un correo de confirmación a la nueva dirección.
                        </p>
                      )}
                    </div>
                    {modal === 'crear' && (
                    <div>
                      <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Contraseña *</label>
                      <input
                        type="text"
                        required
                        minLength={6}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder="Mínimo 6 caracteres"
                        className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                      />
                    </div>
                    )}
                  </>
                )}

                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Rol *</label>
                  <select
                    required
                    value={form.rol_id}
                    onChange={(e) => setForm({ ...form, rol_id: e.target.value, nombre_sucursal: '' })}
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                  >
                    <option value="">Seleccione un rol...</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{ROL_LABEL[r.nombre] || r.nombre}</option>
                    ))}
                  </select>
                </div>

                {esRolDueno && (
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${label}`}>
                      <Crown size={14} className="text-rose-500 shrink-0" /> Dueño *
                    </label>
                    {duenos.length ? (
                      <select
                        required
                        value={form.dueno_id}
                        onChange={(e) => setForm({ ...form, dueno_id: e.target.value })}
                        className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                      >
                        <option value="">Seleccione el dueño</option>
                        {duenos.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nombre}
                            {d.sucursales?.length ? '' : ' (sin sucursales)'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className={`p-4 border rounded-xl text-sm ${darkMode ? 'bg-amber-950/30 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                        Todavía no hay dueños registrados. Creá uno primero en el apartado
                        <strong> Dueños</strong> del panel de administración, o corré
                        <code className="mx-1">supabase/DUENOS-PARTE1.sql</code> a{' '}
                        <code className="mx-1">PARTE3</code> en Supabase.
                      </div>
                    )}
                    <p className={`text-xs mt-2 ${muted}`}>
                      El dueño ve los pedidos de todas sus sucursales, pero solo puede mirar:
                      no registra ni modifica nada.
                    </p>
                  </div>
                )}

                {esRolSucursal && (
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${label}`}>
                      <Route size={14} className="text-purple-500 shrink-0" /> Ruta *
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {rutasDisponibles.map((ruta) => (
                        <button
                          key={ruta}
                          type="button"
                          onClick={() => setForm({ ...form, ruta, nombre_sucursal: '' })}
                          className={`py-2.5 px-2 text-xs font-bold rounded-xl border transition ${
                            form.ruta === ruta
                              ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-600/25'
                              : darkMode
                                ? 'bg-slate-950/60 text-slate-400 border-slate-800 hover:bg-slate-800'
                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {ruta}
                        </button>
                      ))}
                    </div>
                    <p className={`mt-1.5 text-[11px] ${muted}`}>
                      Define a qué ruta pertenece el usuario. Solo se mostrarán las sucursales de esa ruta.
                    </p>
                  </div>
                )}

                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>
                    Sucursal {esRolSucursal && form.ruta ? `de la ruta ${form.ruta}` : ''}
                  </label>
                  <input
                    type="text"
                    list="lista-sucursales"
                    value={form.nombre_sucursal}
                    onChange={(e) => setForm({ ...form, nombre_sucursal: e.target.value })}
                    placeholder={esRolSucursal && form.ruta ? 'Escribe o elige una sucursal...' : 'Sin asignar'}
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                  />
                  <datalist id="lista-sucursales">
                    {sucursalesDeRuta.map((s) => (
                      <option key={s.id} value={s.nombre} />
                    ))}
                  </datalist>
                  <p className={`mt-1.5 text-[11px] ${muted}`}>
                    {esRolSucursal && !form.ruta ? (
                      <span className="text-amber-500">Elige primero la ruta para ver las sucursales.</span>
                    ) : (
                      'Si escribes una sucursal que no existe, se creará automáticamente en esa ruta.'
                    )}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold py-3 rounded-xl text-sm uppercase tracking-wide transition shadow-lg shadow-amber-500/25 disabled:opacity-50"
                >
                  {enviando ? 'Guardando...' : modal === 'crear' ? 'Crear Usuario' : 'Guardar Cambios'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
