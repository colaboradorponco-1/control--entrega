import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabaseClient';
import { authRepository } from '../repositories/AuthRepository';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    // Verificar sesión activa al cargar la app
    const obtenerSesion = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (session?.user) {
          setUsuario(session.user);
          try {
            const perfilData = await authRepository.obtenerPerfilUsuario(session.user.id);
            setPerfil(perfilData);
          } catch (err) {
            console.error("Error al obtener perfil:", err);
          }
        }
      } catch (err) {
        console.warn("Sesión expirada o inválida, limpiando token anterior:", err.message);
        await supabase.auth.signOut().catch(() => {});
        setUsuario(null);
        setPerfil(null);
      } finally {
        setCargando(false);
      }
    };

    obtenerSesion();

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUsuario(session.user);
        const perfilData = await authRepository.obtenerPerfilUsuario(session.user.id);
        setPerfil(perfilData);
      } else {
        setUsuario(null);
        setPerfil(null);
      }
      setCargando(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, perfil, cargando }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);