import { useEffect, useRef, useState } from 'react';
import {
  Camera, Check, KeyRound, Loader2, Mail, Save, Trash2, User, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { authRepository } from '../../repositories/AuthRepository';
import AvatarUsuario, { ESTILOS_AVATAR, urlAvatarSvg } from '../../components/AvatarUsuario';

const MAX_FOTO_MB = 3;

// Semilla nueva para que el avatar generado cambie de cara.
const semillaNueva = () => Math.random().toString(36).slice(2, 10);

export default function EditarPerfil({ abierto, onCerrar }) {
  const { perfil, usuario, recargarPerfil } = useAuth();
  const { darkMode } = useTheme();

  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveRepetida, setClaveRepetida] = useState('');
  const [estiloElegido, setEstiloElegido] = useState('');
  const [semilla, setSemilla] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [trabajando, setTrabajando] = useState('');
  const inputFoto = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    setNombre(perfil?.nombre_completo || '');
    setCorreo(usuario?.email || '');
    setClaveNueva('');
    setClaveRepetida('');
    setEstiloElegido(perfil?.avatar_estilo || 'funEmoji');
    setSemilla(perfil?.avatar_semilla || 'usuario');
    setMensaje(null);
  }, [abierto, perfil?.nombre_completo, perfil?.avatar_estilo, perfil?.avatar_semilla, usuario?.email]);

  useEffect(() => {
    if (!mensaje) return undefined;
    const t = setTimeout(() => setMensaje(null), 6000);
    return () => clearTimeout(t);
  }, [mensaje]);

  if (!abierto) return null;

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500 focus:ring-amber-500/20'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-amber-500/20';
  const label = darkMode ? 'text-slate-300' : 'text-gray-600';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';

  const avisar = (tipo, texto) => setMensaje({ tipo, texto });

  const guardarNombre = async () => {
    const limpio = nombre.trim();
    if (limpio.length < 3) {
      avisar('error', 'El nombre necesita al menos 3 letras.');
      return;
    }
    setTrabajando('nombre');
    try {
      await authRepository.actualizarMiPerfil({ nombre: limpio });
      await recargarPerfil();
      avisar('exito', 'Nombre guardado.');
    } catch (err) {
      avisar('error', err.message || 'No se pudo guardar el nombre.');
    } finally {
      setTrabajando('');
    }
  };

  const elegirAvatar = async (clave) => {
    const nuevaSemilla = semillaNueva();
    setEstiloElegido(clave);
    setSemilla(nuevaSemilla);
    setTrabajando('avatar');
    try {
      await authRepository.actualizarMiPerfil({
        avatar_estilo: clave,
        avatar_semilla: nuevaSemilla,
        foto_url: '',
      });
      await recargarPerfil();
      avisar('exito', 'Avatar actualizado.');
    } catch (err) {
      avisar('error', err.message || 'No se pudo cambiar el avatar.');
    } finally {
      setTrabajando('');
    }
  };

  const subirFoto = async (evento) => {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;

    if (!archivo.type.startsWith('image/')) {
      avisar('error', 'El archivo tiene que ser una imagen.');
      return;
    }
    if (archivo.size > MAX_FOTO_MB * 1024 * 1024) {
      avisar('error', `La foto no puede pesar más de ${MAX_FOTO_MB} MB.`);
      return;
    }

    setTrabajando('foto');
    try {
      const ruta = await authRepository.subirAvatar(archivo);
      await authRepository.actualizarMiPerfil({ foto_url: ruta });
      await recargarPerfil();
      avisar('exito', 'Foto de perfil actualizada.');
    } catch (err) {
      avisar('error', err.message || 'No se pudo subir la foto.');
    } finally {
      setTrabajando('');
    }
  };

  const quitarFoto = async () => {
    setTrabajando('foto');
    try {
      await authRepository.actualizarMiPerfil({ foto_url: '' });
      await recargarPerfil();
      avisar('exito', 'Foto quitada. Vuelve tu avatar.');
    } catch (err) {
      avisar('error', err.message || 'No se pudo quitar la foto.');
    } finally {
      setTrabajando('');
    }
  };

  const cambiarCorreo = async () => {
    const nuevo = correo.trim();
    if (!nuevo) {
      avisar('error', 'Escribe el correo nuevo.');
      return;
    }
    if (nuevo === usuario?.email) {
      avisar('error', 'Ese es el mismo correo que ya tenés.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(nuevo)) {
      avisar('error', 'Ese correo no parece válido.');
      return;
    }

    setTrabajando('correo');
    try {
      await authRepository.cambiarEmail(nuevo);
      avisar(
        'exito',
        `Se pidió el cambio a ${nuevo}. Si no entra al toque, abrí la bandeja de ese correo y confirmá el enlace que te enviamos.`
      );
    } catch (err) {
      avisar('error', err.message || 'No se pudo cambiar el correo.');
    } finally {
      setTrabajando('');
    }
  };

  const cambiarClave = async () => {
    if (claveNueva.length < 8) {
      avisar('error', 'La contraseña nueva necesita al menos 8 caracteres.');
      return;
    }
    if (claveNueva !== claveRepetida) {
      avisar('error', 'Las dos contraseñas no son iguales.');
      return;
    }

    setTrabajando('clave');
    try {
      await authRepository.cambiarPassword(claveNueva);
      setClaveNueva('');
      setClaveRepetida('');
      avisar('exito', 'Contraseña cambiada. Usá la nueva la próxima vez.');
    } catch (err) {
      avisar('error', err.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setTrabajando('');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-2xl rounded-2xl border p-5 shadow-2xl ${card}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-500">
              <User size={17} />
            </span>
            <div>
              <h2 className={`text-lg font-black ${strong}`}>Editar perfil</h2>
              <p className={`mt-0.5 text-xs ${muted}`}>
                Tu foto, tu avatar y tu acceso. El rol y la sucursal los maneja el administrador.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className={`rounded-xl border p-2 ${darkMode ? 'border-slate-800 text-slate-400' : 'border-gray-300 text-gray-500'}`}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {mensaje && (
          <div
            className={`mt-4 rounded-xl border px-3 py-2 text-xs font-semibold ${
              mensaje.tipo === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-400'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        {/* Avatar y foto */}
        <section className="mt-5">
          <h3 className={`text-xs font-bold uppercase tracking-wider ${label}`}>Tu avatar</h3>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <AvatarUsuario perfil={perfil} size={72} />
              <span className={`text-[11px] ${muted}`}>Así te ven</span>
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputFoto.current?.click()}
                disabled={trabajando === 'foto'}
                className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-500 transition hover:bg-amber-500/20 disabled:opacity-60"
              >
                {trabajando === 'foto'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Camera size={14} />}
                Subir foto
              </button>
              {perfil?.foto_url && (
                <button
                  type="button"
                  onClick={quitarFoto}
                  disabled={trabajando === 'foto'}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition disabled:opacity-60 ${
                    darkMode
                      ? 'border-slate-800 text-slate-400 hover:bg-slate-800'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Trash2 size={14} /> Quitar foto
                </button>
              )}
            </div>
            <input
              ref={inputFoto}
              type="file"
              accept="image/*"
              onChange={subirFoto}
              className="hidden"
            />
          </div>

          <p className={`mt-4 text-xs font-semibold ${label}`}>Elegí un avatar de la galería</p>
          <div className="mt-2 grid grid-cols-8 gap-2">
            {ESTILOS_AVATAR.map((opcion) => {
              const activo = estiloElegido === opcion.clave && !perfil?.foto_url;
              return (
                <button
                  key={opcion.clave}
                  type="button"
                  title={opcion.label}
                  onClick={() => elegirAvatar(opcion.clave)}
                  disabled={trabajando === 'avatar'}
                  className={`relative overflow-hidden rounded-xl border transition disabled:opacity-60 ${
                    activo
                      ? 'border-amber-500 ring-2 ring-amber-500/40'
                      : darkMode
                        ? 'border-slate-800 hover:border-slate-600'
                        : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <img
                    src={urlAvatarSvg(opcion.clave, semilla, 64)}
                    alt={opcion.label}
                    className="block h-10 w-10"
                  />
                  {activo && (
                    <span className="absolute right-0.5 top-0.5 rounded-full bg-amber-500 p-0.5 text-white">
                      <Check size={10} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Nombre */}
        <section className="mt-6 border-t border-slate-200/40 pt-5">
          <h3 className={`text-xs font-bold uppercase tracking-wider ${label}`}>Nombre</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={120}
              className={`w-full px-4 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 transition sm:w-64 ${input}`}
            />
            <button
              type="button"
              onClick={guardarNombre}
              disabled={trabajando === 'nombre'}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
            >
              {trabajando === 'nombre'
                ? <Loader2 size={16} className="animate-spin" />
                : <Save size={16} />}
              Guardar
            </button>
          </div>
        </section>

        {/* Correo */}
        <section className="mt-6 border-t border-slate-200/40 pt-5">
          <h3 className={`text-xs font-bold uppercase tracking-wider ${label}`}>Correo de acceso</h3>
          <p className={`mt-1 text-[11px] ${muted}`}>
            Con este correo entrás al sistema. Si lo cambiás, te enviamos un enlace al correo
            nuevo para confirmarlo.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <div className="relative w-full sm:w-64">
              <Mail size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${muted}`} />
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
              />
            </div>
            <button
              type="button"
              onClick={cambiarCorreo}
              disabled={trabajando === 'correo'}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition disabled:opacity-60 ${
                darkMode
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {trabajando === 'correo'
                ? <Loader2 size={16} className="animate-spin" />
                : <Mail size={16} />}
              Cambiar correo
            </button>
          </div>
        </section>

        {/* Contraseña */}
        <section className="mt-6 border-t border-slate-200/40 pt-5">
          <h3 className={`text-xs font-bold uppercase tracking-wider ${label}`}>Contraseña</h3>
          <p className={`mt-1 text-[11px] ${muted}`}>
            Mínimo 8 caracteres. Cambiarla saca la sesión de los otros dispositivos.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <div className="relative w-full sm:w-64">
              <KeyRound size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${muted}`} />
              <input
                type="password"
                value={claveNueva}
                onChange={(e) => setClaveNueva(e.target.value)}
                placeholder="Contraseña nueva"
                className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
              />
            </div>
            <div className="relative w-full sm:w-64">
              <KeyRound size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${muted}`} />
              <input
                type="password"
                value={claveRepetida}
                onChange={(e) => setClaveRepetida(e.target.value)}
                placeholder="Repetí la contraseña"
                className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 transition ${input}`}
              />
            </div>
            <button
              type="button"
              onClick={cambiarClave}
              disabled={trabajando === 'clave'}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition disabled:opacity-60 ${
                darkMode
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {trabajando === 'clave'
                ? <Loader2 size={16} className="animate-spin" />
                : <KeyRound size={16} />}
              Cambiar contraseña
            </button>
          </div>
        </section>

        <div className="mt-6 flex justify-end border-t border-slate-200/40 pt-4">
          <button
            type="button"
            onClick={onCerrar}
            className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
              darkMode
                ? 'border-slate-800 text-slate-400 hover:bg-slate-800'
                : 'border-gray-300 text-gray-600 hover:bg-gray-100'
            }`}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
