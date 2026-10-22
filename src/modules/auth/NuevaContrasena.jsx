import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../config/supabaseClient';
import { authRepository } from '../../repositories/AuthRepository';
import { Lock, Sun, Moon, AlertCircle, CheckCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';

const MINIMO = 6;

export default function NuevaContrasena() {
  const { darkMode, toggleTheme } = useTheme();
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState(null);
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const navigate = useNavigate();

  // El enlace del correo deja una sesion temporal. Si el usuario abrio
  // esta pagina directamente, no hay sesion y no puede cambiar la clave.
  useEffect(() => {
    const revisar = async () => {
      const { data } = await supabase.auth.getSession();
      setVerificando(false);
      if (!data?.session) {
        setError(
          'Este enlace no sirve o venció. Pedí uno nuevo desde la pantalla de acceso.'
        );
      }
    };
    revisar();
  }, []);

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < MINIMO) {
      setError(`La contraseña necesita al menos ${MINIMO} caracteres.`);
      return;
    }
    if (password !== repetir) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    try {
      await authRepository.actualizarPassword(password);
      setListo(true);
      // Por seguridad se cierra la sesion: que entre de nuevo con la nueva.
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la contraseña. Pedí un enlace nuevo.');
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
            <ShieldCheck size={30} />
          </div>
          <h2 className={`text-2xl font-extrabold tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>Nueva contraseña</h2>
        </div>

        {verificando ? (
          <p className={`text-center text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Verificando el enlace...
          </p>
        ) : listo ? (
          <div className={`p-5 border text-sm rounded-xl text-left ${darkMode ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            <div className="flex items-start gap-3">
              <CheckCircle size={20} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Contraseña guardada.</p>
                <p className="mt-2">Te llevamos al acceso para que entrants con la nueva.</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className={`mb-6 p-4 border text-sm flex items-start gap-3 rounded-xl text-left ${darkMode ? 'bg-red-950/50 border-red-500/50 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <div>
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => navigate('/recuperar-contrasena')}
                    className="block mt-2 underline font-semibold"
                  >
                    Pedir un enlace nuevo
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleGuardar} className="space-y-5">
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Contraseña nueva</label>
                <div className="relative">
                  <Lock className={`absolute left-3.5 top-3.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} size={18} />
                  <input
                    type={verPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className={clasesInput}
                  />
                  <button
                    type="button"
                    onClick={() => setVerPassword((v) => !v)}
                    aria-label={verPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    className={`absolute right-3 top-3 p-1 rounded-lg transition ${darkMode ? 'text-slate-400 hover:text-amber-400 hover:bg-slate-800' : 'text-gray-400 hover:text-amber-600 hover:bg-gray-100'}`}
                  >
                    {verPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>Repetir contraseña</label>
                <div className="relative">
                  <Lock className={`absolute left-3.5 top-3.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} size={18} />
                  <input
                    type={verPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={repetir}
                    onChange={(e) => setRepetir(e.target.value)}
                    placeholder="Repetila para confirmar"
                    className={clasesInput}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={cargando}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold py-3.5 rounded-xl transition duration-200 shadow-lg shadow-amber-500/25 disabled:opacity-50 text-sm tracking-wide uppercase"
              >
                {cargando ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
