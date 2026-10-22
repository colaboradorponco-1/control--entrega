import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * En las rutas que el superadmin puede abrir (por ejemplo el
 * panel), queda como administrador y asi puede ver lo mismo.
 * Con excluirSuperadmin la ruta es solo del administrador: el
 * superadmin vuelve al panel principal.
 */
export default function ProtectedRoute({ children, rolesPermitidos, excluirSuperadmin }) {
  const { usuario, perfil, cargando } = useAuth();

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 font-medium">Cargando sesión...</div>
      </div>
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