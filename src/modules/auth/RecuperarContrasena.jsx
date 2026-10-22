import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { authRepository } from '../../repositories/AuthRepository';
import { KeyRound, Mail, ArrowLeft, Sun, Moon, AlertCircle, CheckCircle } from 'lucide-react';

export default function RecuperarContrasena() {
  const { darkMode, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  const handleEnviar = async (e) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      await authRepository.solicitarRecuperacion(email);
      setEnviado(true);
    } catch (err) {
      setError(
        err.message === 'Failed to fetch'
          ? 'Sin conexión a internet. Revisá tu señal.'
          : err.message || 'No se pudo enviar el correo. Intentá de nuevo.'
      );
    } finally {
      setCargando(false);
    }
  };

  const clasesInput = `w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition ${
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
        <button
          type="button"
          onClick={() => navigate('/login')}
          className={`inline-flex items-center gap-2 text-sm font-semibold mb-6 transition ${darkMode ? 'text-slate-400 hover:text-amber-400' : 'text-gray-500 hover:text-amber-600'}`}
        >
          <ArrowLeft size={16} />
          Volver al acceso
        </button>

        <div className="text-center mb-8">
          <div className="bg-gradient-to-tr from-amber-500 to-orange-500 text-white p-4 rounded-2xl w-16 h-16 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
            <KeyRound size={30} />
          </div>
          <h2 className={`text-2xl font-extrabold tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>Recuperar contraseña</h2>
          <p className={`text-sm mt-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Escribí tu correo y te enviamos un enlace para crear una contraseña nueva.
          </p>
        </div>

        {error && (
          <div className={`mb-6 p-4 border text-sm flex items-start gap-3 rounded-xl text-left ${darkMode ? 'bg-red-950/50 border-red-500/50 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {enviado ? (
          <div className={`p-5 border text-sm rounded-xl text-left ${darkMode ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            <div className="flex items-start gap-3">
              <CheckCircle size={20} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Si ese correo tiene una cuenta, ya le llegó el enlace.</p>
                <p className="mt-2">
                  Revisá la bandeja de entrada y también la carpeta de spam. El enlace
                  dura 1 hora. Si no aparece, confirmá que escribiste bien el correo.
                </p>
                <button
                  type="button"
                  onClick={() => setEnviado(false)}
                  className="mt-3 underline font-semibold"
                >
                  Probar con otro correo
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleEnviar} className="space-y-5">
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Correo Electrónico</label>
              <div className="relative">
                <Mail className={`absolute left-3.5 top-3.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} size={18} />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  className={clasesInput}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold py-3.5 rounded-xl transition duration-200 shadow-lg shadow-amber-500/25 disabled:opacity-50 text-sm tracking-wide uppercase"
            >
              {cargando ? 'Enviando...' : 'Enviar enlace'}
            </button>
          </form>
        )}

        <p className={`mt-6 text-xs text-center ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
          Si no tenés correo configurado, pedile al administrador que te lo asigne.
        </p>
      </div>
    </div>
  );
}
