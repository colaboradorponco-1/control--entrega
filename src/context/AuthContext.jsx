import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../config/supabaseClient';
import { authRepository } from '../repositories/AuthRepository';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [sesionExpirada, setSesionExpirada] = useState(false);

  useEffect(() => {
    // Este efecto solo sigue la sesion. El perfil se pide aparte, en
    // otro efecto, para no consultar Supabase dentro del callback de
    // auth mientras el cliente tiene bloqueado el almacenamiento.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUsuario(session?.user ?? null);
      if (!session?.user) {
        setPerfil(null);
        setCargando(false);
      }
      // TOKEN_EXPIRED llega cuando el refresh falla (sin conexión, token
      // revocado). En vez de dejar al usuario con errores misteriosos,
      // redirigimos al login con un aviso claro.
      if (event === 'TOKEN_REFRESHED') {
        setSesionExpirada(false);
      }
      if (event === 'SIGNED_OUT' && !session) {
        // Puede ser logout normal o expiración. El estado sesionExpirada
        // se pone solo si fue una expiración real (sin acción del usuario).
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const usuarioId = usuario?.id ?? null;

  // Vuelve a pedir el perfil: se usa despues de editar el nombre o
  // el avatar para que la pantalla se actualice al toque.
  const recargarPerfil = useCallback(async () => {
    if (!usuarioId) return null;
    const perfilData = await authRepository.obtenerPerfilUsuario(usuarioId);
    setPerfil(perfilData);
    return perfilData;
  }, [usuarioId]);

  useEffect(() => {
    // Cada vez que cambia el usuario que inicio sesion se tira el perfil
    // anterior y se pide el nuevo. Asi, al entrar con otra cuenta, nunca
    // queda a la vista el panel del usuario anterior.
    if (!usuarioId) return undefined;

    let activa = true;
    setPerfil(null);
    setCargando(true);

    authRepository
      .obtenerPerfilUsuario(usuarioId)
      .then((perfilData) => {
        if (activa) setPerfil(perfilData);
      })
      .catch((err) => {
        console.error('Error al obtener perfil:', err);
        if (activa) setPerfil(null);
      })
      .finally(() => {
        if (activa) setCargando(false);
      });

    return () => { activa = false; };
  }, [usuarioId]);

  const valor = useMemo(
    () => ({ usuario, perfil, cargando, recargarPerfil, sesionExpirada, setSesionExpirada }),
    [usuario, perfil, cargando, recargarPerfil, sesionExpirada]
  );

  return (
    <AuthContext.Provider value={valor}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
