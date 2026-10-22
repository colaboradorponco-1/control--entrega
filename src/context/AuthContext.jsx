import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../config/supabaseClient';
import { authRepository } from '../repositories/AuthRepository';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    // Este efecto solo sigue la sesion. El perfil se pide aparte, en
    // otro efecto, para no consultar Supabase dentro del callback de
    // auth mientras el cliente tiene bloqueado el almacenamiento.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUsuario(session?.user ?? null);
      if (!session?.user) {
        setPerfil(null);
        setCargando(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const usuarioId = usuario?.id ?? null;

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

  const valor = useMemo(() => ({ usuario, perfil, cargando }), [usuario, perfil, cargando]);

  return (
    <AuthContext.Provider value={valor}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
