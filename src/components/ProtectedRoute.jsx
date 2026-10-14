import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, rolesPermitidos }) {
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
    && rolesPermitidos?.includes('administrador');

  if (rolesPermitidos && !rolesPermitidos.includes(rolActual) && !esAdminPermitido) {
    return <Navigate to="/panel" replace />;
  }

  return children;
}