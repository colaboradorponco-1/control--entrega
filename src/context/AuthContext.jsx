import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../config/supabaseClient';
import {
  authRepository,
  consumirLogoutSolicitado,
  limpiarLogoutSolicitado,
} from '../repositories/AuthRepository';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [perfilError, setPerfilError] = useState(null);
  const [sesionExpirada, setSesionExpirada] = useState(false);
  const habiaUsuarioRef = useRef(false);

  useEffect(() => {
    // Este efecto solo sigue la sesion. El perfil se pide aparte, en
    // otro efecto, para no consultar Supabase dentro del callback de
    // auth mientras el cliente tiene bloqueado el almacenamiento.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUsuario(session?.user ?? null);

      // Con sesion activa (login nuevo, token renovado) la sesion deja
      // de estar expirada. Sin esto, despues de un "Salir" la marca
      // quedaba encendida para siempre y cada login rebotaba al inicio.
      if (session?.user) {
        habiaUsuarioRef.current = true;
        limpiarLogoutSolicitado();
        setSesionExpirada(false);
        return;
      }

      setPerfil(null);
      setPerfilError(null);
      setCargando(false);

      // Solo es una expiracion si habia una sesion y el usuario no
      // apreto "Salir".
      if (event === 'SIGNED_OUT') {
        const logoutManual = consumirLogoutSolicitado();
        setSesionExpirada(!logoutManual && habiaUsuarioRef.current);
        habiaUsuarioRef.current = false;
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
    setPerfilError(null);
    setCargando(true);

    authRepository
      .obtenerPerfilUsuario(usuarioId)
      .then((perfilData) => {
        if (activa) setPerfil(perfilData);
      })
      .catch((err) => {
        console.error('Error al obtener perfil:', err);
        if (activa) {
          setPerfil(null);
          setPerfilError(err.message || 'No se pudo cargar el perfil');
        }
      })
      .finally(() => {
        if (activa) setCargando(false);
      });

    return () => { activa = false; };
  }, [usuarioId]);

  const valor = useMemo(
    () => ({ usuario, perfil, perfilError, cargando, recargarPerfil, sesionExpirada, setSesionExpirada }),
    [usuario, perfil, perfilError, cargando, recargarPerfil, sesionExpirada]
  );

  return (
    <AuthContext.Provider value={valor}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
