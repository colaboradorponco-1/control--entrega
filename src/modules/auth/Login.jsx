import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { authRepository } from '../../repositories/AuthRepository';
import { LogIn, Lock, Mail, AlertCircle, Sun, Moon } from 'lucide-react';

export default function Login() {
  const { darkMode, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const data = await authRepository.login(email, password);
      const perfil = await authRepository.obtenerPerfilUsuario(data.user.id);
      const rol = perfil.roles?.nombre;

      switch (rol) {
        case 'administrador':
          navigate('/admin');
          break;
        case 'operador_planta':
          navigate('/planta');
          break;
        case 'despachador':
          navigate('/despacho');
          break;
        case 'sucursal':
          navigate('/sucursal');
          break;
        case 'sin_perfil':
          setError('Tu cuenta no tiene un rol asignado. Contacta al administrador.');
          setCargando(false);
          await authRepository.logout().catch(() => {});
          return;
        default:
          setError('Rol de usuario no reconocido.');
      }
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión. Verifique sus credenciales.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-gradient-to-br from-slate-950 via-zinc-900 to-amber-950' : 'bg-gradient-to-br from-amber-50 via-white to-orange-100'}`}>
      {/* Elementos decorativos */}
      {darkMode && (
        <>
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-600/20 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-orange-600/20 rounded-full blur-3xl pointer-events-none"></div>
        </>
      )}

      {/* Botón de tema */}
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

        {error && (
          <div className={`mb-6 p-4 border text-sm flex items-start gap-3 rounded-xl text-left ${darkMode ? 'bg-red-950/50 border-red-500/50 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Correo Electrónico</label>
            <div className="relative">
              <Mail className={`absolute left-3.5 top-3.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} size={18} />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition ${darkMode ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Contraseña</label>
            <div className="relative">
              <Lock className={`absolute left-3.5 top-3.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} size={18} />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition ${darkMode ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold py-3.5 rounded-xl transition duration-200 shadow-lg shadow-amber-500/25 disabled:opacity-50 text-sm tracking-wide uppercase"
          >
            {cargando ? 'Iniciando sesión...' : 'Entrar al Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
}
