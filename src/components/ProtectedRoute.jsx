import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authRepository } from '../repositories/AuthRepository';
import { useMemo } from 'react';

/**
 * En las rutas que el superadmin puede abrir (por ejemplo el
 * panel), queda como administrador y asi puede ver lo mismo.
 * Con excluirSuperadmin la ruta es solo del administrador: el
 * superadmin vuelve al panel principal.
 */
export default function ProtectedRoute({ children, rolesPermitidos, excluirSuperadmin }) {
  const { usuario, perfil, perfilError, cargando, sesionExpirada } = useAuth();

  // El aviso viaja en el state de la navegacion. Se memoiza para que
  // <Navigate> no vuelva a navegar en cada render (su efecto depende
  // del state y un objeto nuevo lo disparaba de nuevo).
  const avisoState = useMemo(
    () => ({ aviso: sesionExpirada ? 'Tu sesión expiró. Vuelve a iniciar sesión.' : null }),
    [sesionExpirada]
  );

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 font-medium">Cargando sesión...</div>
      </div>
    );
  }

  // Sesión expirada o sin sesión: al login.
  if (sesionExpirada || !usuario) {
    return (
      <Navigate to="/login" replace state={avisoState} />
    );
  }

  // Hay sesión pero el perfil todavía no llegó: mostramos carga,
  // sin redirigir (redirigir aquí provocaba rebotes /panel → /login).
  if (!perfil && !perfilError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 font-medium">Cargando sesión...</div>
      </div>
    );
  }

  // El perfil falló: avisamos sin entrar en un bucle de redirecciones.
  if (!perfil) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center text-slate-300">
        <p className="text-sm font-semibold">No se pudo cargar tu perfil.</p>
        <p className="max-w-sm text-xs text-slate-500">
          {perfilError || 'Revisá tu conexión e intentá de nuevo.'}
        </p>
        <button
          type="button"
          onClick={() => authRepository.logout()}
          className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          Volver a iniciar sesión
        </button>
      </div>
    );
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