import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabaseClient';
import { useEffect } from 'react';

/**
 * En las rutas que el superadmin puede abrir (por ejemplo el
 * panel), queda como administrador y asi puede ver lo mismo.
 * Con excluirSuperadmin la ruta es solo del administrador: el
 * superadmin vuelve al panel principal.
 */
export default function ProtectedRoute({ children, rolesPermitidos, excluirSuperadmin }) {
  const { usuario, perfil, cargando, sesionExpirada, setSesionExpirada } = useAuth();

  // Detecta cuando el token de Supabase no se pudo refrescar.
  // En vez de dejar errores 401 por toda la app, mostramos un aviso
  // y redirigimos al login para que el usuario vuelva a entrar.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') setSesionExpirada(false);
      // Supabase emite SIGNED_OUT cuando el refresh falla definitivamente.
      // Si el usuario no hizo logout activo, es una expiración.
      if (event === 'SIGNED_OUT' && usuario) setSesionExpirada(true);
    });
    return () => subscription.unsubscribe();
  }, [usuario, setSesionExpirada]);

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 font-medium">Cargando sesión...</div>
      </div>
    );
  }

  // Sesión expirada: aviso claro antes de redirigir al login.
  if (sesionExpirada || (!usuario && !cargando)) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ aviso: sesionExpirada ? 'Tu sesión expiró. Vuelve a iniciar sesión.' : null }}
      />
    );
  }

  if (!usuario || !perfil) {
    return <Navigate to="/login" replace />;
  }

  const rolActual = perfil.roles?.nombre;
  const esAdminPermitido = rolActual === 'superadmin'
    && !excluirSuperadmin
    && rolesPermitidos?.includes('administrador');

  if (rolesPermitidos && !rolesPermitidos.includes(rolActual) && !esAdminPermitido) {
    return <Navigate to="/panel" replace />;
  }

  return children;
}