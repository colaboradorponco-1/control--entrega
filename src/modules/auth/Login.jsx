import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { authRepository } from '../../repositories/AuthRepository';
import {
  LogIn, Lock, Mail, AlertCircle, Sun, Moon,
  Eye, EyeOff, KeyRound, ShieldAlert,
} from 'lucide-react';

// 4 intentos fallidos bloquean la cuenta 1 minuto. El bloqueo vive en
// localStorage para que siga vigente si alguien recarga la pagina.
const CLAVE_INTENTOS = 'pollo:login:intentos';
const CLAVE_BLOQUEO = 'pollo:login:bloqueado';
const MAX_INTENTOS = 4;
const SEGUNDOS_BLOQUEO = 60;

const ROLES_VALIDOS = ['administrador', 'superadmin', 'operador_planta', 'despachador', 'sucursal', 'dueno'];

const leer = (clave) => {
  try {
    return JSON.parse(localStorage.getItem(clave));
  } catch {
    return null;
  }
};

const guardar = (clave, valor) => {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // si el navegador bloquea el almacenamiento, el bloqueo vale
    // solo mientras la pagina quede abierta
  }
};

export default function Login() {
  const { usuario, perfil, sesionExpirada } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [cargando, setCargando] = useState(false);

  const [intentos, setIntentos] = useState(() => leer(CLAVE_INTENTOS) || 0);
  const [restante, setRestante] = useState(() => Math.max(0, (leer(CLAVE_BLOQUEO) || 0) - Date.now()));
  const navigate = useNavigate();
  const location = useLocation();
  const refEmail = useRef(null);

  // Aviso de sesión expirada proveniente de ProtectedRoute. Se muestra
  // una sola vez y se limpia con React Router: usar
  // window.history.replaceState a mano dejaba el historial del router
  // desincronizado (y era el origen del aviso de "throttling").
  useEffect(() => {
    if (!location.state?.aviso) return;

    setAviso(location.state.aviso);
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: null }
    );
  }, [location.state?.aviso, location.pathname, location.search, location.hash, navigate]);

  // Cuenta regresiva del bloqueo
  useEffect(() => {
    if (restante <= 0) return;
    const t = setTimeout(() => {
      const nuevo = Math.max(0, (leer(CLAVE_BLOQUEO) || 0) - Date.now());
      setRestante(nuevo);
      if (nuevo === 0) {
        guardar(CLAVE_BLOQUEO, null);
        guardar(CLAVE_INTENTOS, 0);
        setIntentos(0);
        refEmail.current?.focus();
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [restante]);

  // Recordar el correo, pero nunca la contraseña
  useEffect(() => {
    const guardado = localStorage.getItem('pollo:login:email');
    if (guardado) setEmail(guardado);
  }, []);

  // Si ya hay una sesión válida (por ejemplo, entró bien y el estado
  // tardó en reflejarse), se manda al panel en vez de dejarlo en el
  // login. Evita quedarse trabado en "no me deja entrar".
  useEffect(() => {
    const rol = perfil?.roles?.nombre;
    if (sesionExpirada) return;
    if (usuario && perfil && perfil.activo !== false && ROLES_VALIDOS.includes(rol)) {
      navigate('/panel', { replace: true });
    }
  }, [usuario, perfil, sesionExpirada, navigate]);

  const bloqueado = restante > 0;
  const minutos = Math.floor(restante / 60);
  const segundos = String(restante % 60).padStart(2, '0');

  const registrarFallo = () => {
    const nuevos = intentos + 1;
    guardar(CLAVE_INTENTOS, nuevos);
    setIntentos(nuevos);

    if (nuevos >= MAX_INTENTOS) {
      guardar(CLAVE_BLOQUEO, Date.now() + SEGUNDOS_BLOQUEO * 1000);
      setRestante(SEGUNDOS_BLOQUEO);
      guardar(CLAVE_INTENTOS, 0);
      setIntentos(0);
      return true;
    }
    return false;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (bloqueado) return;

    setError(null);
    setAviso(null);
    setCargando(true);

    let data;
    try {
      data = await authRepository.login(email.trim(), password);
    } catch {
      const seBloqueo = registrarFallo();

      if (seBloqueo) {
        setError(
          `Demasiados intentos. La cuenta queda bloqueada 1 minuto por seguridad.`
        );
        setPassword('');
        setCargando(false);
        return;
      }

      const faltan = MAX_INTENTOS - intentos - 1;
      setError(
        `Correo o contraseña incorrectos. Te ${faltan === 1 ? 'queda' : 'quedan'} ${faltan} ${
          faltan === 1 ? 'intento' : 'intentos'
        } antes del bloqueo.`
      );
      setPassword('');
      setCargando(false);
      return;
    }

    try {
      const perfilData = await authRepository.obtenerPerfilUsuario(data.user.id);
      const rol = perfilData.roles?.nombre;

      // Usuario desactivado por el administrador. Se cierra la
      // sesion recien creada y se avisa sin contar un intento fallido.
      if (perfilData.activo === false) {
        setError('Tu cuenta está desactivada. Contacta al administrador.');
        setPassword('');
        await authRepository.logout();
        return;
      }

      if (!ROLES_VALIDOS.includes(rol)) {
        setError(
          rol === 'sin_perfil'
            ? 'Tu cuenta no tiene un rol asignado. Contacta al administrador.'
            : 'El rol de tu cuenta no está reconocido. Contacta al administrador.'
        );
        await authRepository.logout();
        return;
      }

      guardar(CLAVE_INTENTOS, 0);
      guardar(CLAVE_BLOQUEO, null);
      localStorage.setItem('pollo:login:email', email.trim());
      navigate('/panel');
    } catch (err) {
      console.error('No se pudo completar el inicio de sesión:', err);
      await authRepository.logout().catch((errorLogout) => {
        console.error('No se pudo cerrar la sesión después del error:', errorLogout);
      });
      setError(`No se pudo cargar el perfil de tu cuenta. Intenta de nuevo. ${err.message || ''}`.trim());
      setPassword('');
    } finally {
      setCargando(false);
    }
  };

  const clasesInput = `w-full pl-11 pr-11 py-3 border rounded-xl text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition ${
    darkMode
      ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500'
      : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'
  }`;

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-gradient-to-br from-slate-950 via-zinc-900 to-amber-950' : 'bg-gradient-to-br from-amber-50 via-white to-orange-100'}`}>
      {darkMode && (
        <>
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-600/20 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl pointer-events-none"></div>
        </>
      )}

      <button
        onClick={toggleTheme}
        aria-label="Cambiar modo"
        className={`absolute top-5 right-5 z-20 p-3 rounded-xl border transition shadow-lg ${darkMode ? 'bg-slate-900/80 border-slate-700 text-amber-400 hover:bg-slate-800' : 'bg-white/80 border-gray-200 text-amber-600 hover:bg-white'}`}
      >
        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <div className={`w-full max-w-md rounded-2xl shadow-2xl p-6 sm:p-8 relative z-10 transition-colors duration-300 ${darkMode ? 'bg-slate-900/80 backdrop-blur-xl border border-slate-800' : 'bg-white/90 backdrop-blur-xl border border-gray-200'}`}>
        <div className="text-center mb-8">
          <div className="bg-gradient-to-tr from-amber-500 to-orange-500 text-white p-4 rounded-2xl w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
            <LogIn size={30} />
          </div>
          <h2 className={`text-2xl font-extrabold tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>Sistema Control Pollo</h2>
          <p className="text-xs uppercase tracking-widest text-amber-500 font-semibold mt-1">Gestión Avícola Profesional</p>
        </div>

        {bloqueado && (
          <div className={`mb-6 p-4 border text-sm flex items-start gap-3 rounded-xl text-left ${darkMode ? 'bg-orange-950/50 border-orange-500/50 text-orange-200' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
            <ShieldAlert size={20} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Cuenta bloqueada por seguridad</p>
              <p className="mt-1">
                Hubo {MAX_INTENTOS} intentos fallidos. Intentá de nuevo en{' '}
                <span className="font-bold tabular-nums">
                  {minutos}:{segundos}
                </span>
                .
              </p>
              {restante < 20 && (
                <button
                  type="button"
                  onClick={() => navigate('/recuperar-contrasena')}
                  className="mt-2 underline font-semibold"
                >
                  ¿Olvidaste la contraseña?
                </button>
              )}
            </div>
          </div>
        )}

        {error && !bloqueado && (
          <div className={`mb-6 p-4 border text-sm flex items-start gap-3 rounded-xl text-left ${darkMode ? 'bg-red-950/50 border-red-500/50 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {aviso && (
          <div className={`mb-6 p-4 border text-sm rounded-xl text-left ${darkMode ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            {aviso}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Correo Electrónico</label>
            <div className="relative">
              <Mail className={`absolute left-3.5 top-3.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} size={18} />
              <input
                ref={refEmail}
                type="email"
                required
                disabled={bloqueado}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                className={`${clasesInput} disabled:opacity-60`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Contraseña</label>
            <div className="relative">
              <Lock className={`absolute left-3.5 top-3.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} size={18} />
              <input
                type={verPassword ? 'text' : 'password'}
                required
                disabled={bloqueado}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${clasesInput} disabled:opacity-60`}
              />
              <button
                type="button"
                onClick={() => setVerPassword((v) => !v)}
                disabled={bloqueado}
                aria-label={verPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                className={`absolute right-3 top-3 p-1 rounded-lg transition disabled:opacity-50 ${darkMode ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-800' : 'text-gray-400 hover:text-amber-600 hover:bg-gray-100'}`}
              >
                {verPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando || bloqueado}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold py-3.5 rounded-xl transition duration-200 shadow-lg shadow-amber-500/25 disabled:opacity-50 text-sm tracking-wide uppercase"
          >
            {cargando ? 'Iniciando sesión...' : bloqueado ? `Bloqueado ${minutos}:${segundos}` : 'Entrar al Sistema'}
          </button>
        </form>

        <div className={`mt-6 pt-5 border-t text-center ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
          <button
            type="button"
            onClick={() => navigate('/recuperar-contrasena')}
            className={`inline-flex items-center gap-2 text-sm font-semibold transition ${darkMode ? 'text-amber-400 hover:text-amber-300' : 'text-amber-600 hover:text-amber-700'}`}
          >
            <KeyRound size={16} />
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>
    </div>
  );
}
