import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from '../modules/auth/Login';
import ProtectedRoute from '../components/ProtectedRoute';
import RecepcionPollo from '../modules/planta/RecepcionPollo';
import DashboardAdmin from '../modules/admin/DashboardAdmin';
import GestionUsuarios from '../modules/admin/GestionUsuarios';
import GestionSucursales from '../modules/admin/GestionSucursales';
import PedidosSucursal from '../modules/sucursal/PedidosSucursal';
import PedidosPlanta from '../modules/planta/PedidosPlanta';
import PedidosDespachador from '../modules/despacho/PedidosDespachador';
import MisSucursalesDueno from '../modules/dueno/MisSucursalesDueno';
import GestionDuenos from '../modules/admin/GestionDuenos';
import GestionRutas from '../modules/admin/GestionRutas';
import BandejaAvisos from '../modules/admin/BandejaAvisos';
import RecuperarContrasena from '../modules/auth/RecuperarContrasena';
import NuevaContrasena from '../modules/auth/NuevaContrasena';
import PanelPrincipal from '../modules/panel/PanelPrincipal';
import PlanillaSemanal from '../modules/superadmin/PlanillaSemanal';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/recuperar-contrasena" element={<RecuperarContrasena />} />
        <Route path="/nueva-contrasena" element={<NuevaContrasena />} />

        <Route
          path="/panel"
          element={
            <ProtectedRoute>
              <PanelPrincipal />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/planta"
          element={
            <ProtectedRoute rolesPermitidos={['operador_planta', 'administrador']}>
              <RecepcionPollo />
            </ProtectedRoute>
          }
        />

        <Route
          path="/despacho"
          element={
            <ProtectedRoute rolesPermitidos={['despachador', 'administrador']}>
              <PedidosDespachador />
            </ProtectedRoute>
          }
        />

        <Route
          path="/despacho/pedidos"
          element={
            <ProtectedRoute rolesPermitidos={['despachador', 'administrador']}>
              <PedidosDespachador />
            </ProtectedRoute>
          }
        />

        <Route
          path="/sucursal"
          element={
            <ProtectedRoute rolesPermitidos={['sucursal', 'administrador']}>
              <PedidosSucursal />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute rolesPermitidos={['administrador']}>
              <DashboardAdmin />
            </ProtectedRoute>
          }
        />

        <Route
          path="/usuarios"
          element={
            <ProtectedRoute rolesPermitidos={['administrador']}>
              <GestionUsuarios />
            </ProtectedRoute>
          }
        />

        <Route
          path="/avisos"
          element={
            <ProtectedRoute rolesPermitidos={['administrador']} excluirSuperadmin>
              <BandejaAvisos />
            </ProtectedRoute>
          }
        />

        <Route
          path="/sucursales"
          element={
            <ProtectedRoute rolesPermitidos={['administrador']}>
              <GestionSucursales />
            </ProtectedRoute>
          }
        />

        <Route
          path="/duenos"
          element={
            <ProtectedRoute rolesPermitidos={['administrador']}>
              <GestionDuenos />
            </ProtectedRoute>
          }
        />

        <Route
          path="/rutas"
          element={
            <ProtectedRoute rolesPermitidos={['administrador']}>
              <GestionRutas />
            </ProtectedRoute>
          }
        />

        <Route
          path="/mis-sucursales"
          element={
            <ProtectedRoute rolesPermitidos={['dueno', 'administrador']}>
              <MisSucursalesDueno />
            </ProtectedRoute>
          }
        />

        <Route path="/sucursal/pedidos" element={<Navigate to="/sucursal" replace />} />

        <Route
          path="/planta/pedidos"
          element={
            <ProtectedRoute rolesPermitidos={['operador_planta', 'administrador']}>
              <PedidosPlanta />
            </ProtectedRoute>
          }
        />

        <Route
          path="/planilla"
          element={
            <ProtectedRoute rolesPermitidos={['superadmin']}>
              <PlanillaSemanal />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Routes>
    </BrowserRouter>
  );
}