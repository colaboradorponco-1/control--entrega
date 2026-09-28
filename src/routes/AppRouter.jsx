import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from '../modules/auth/Login';
import ProtectedRoute from '../components/ProtectedRoute';
import RecepcionPollo from '../modules/planta/RecepcionPollo';
import MisEntregas from '../modules/sucursal/MisEntregas';
import DashboardAdmin from '../modules/admin/DashboardAdmin';
import GestionUsuarios from '../modules/admin/GestionUsuarios';
import GestionSucursales from '../modules/admin/GestionSucursales';
import PedidosSucursal from '../modules/sucursal/PedidosSucursal';
import PedidosPlanta from '../modules/planta/PedidosPlanta';
import PedidosDespachador from '../modules/despacho/PedidosDespachador';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route
          path="/planta"
          element={
            <ProtectedRoute rolesPermitidos={['operador_planta', 'administrador']}>
              <RecepcionPollo />
            </ProtectedRoute>
          }
        />

        {/* El despachador entra directo al formulario de carga.
            /despacho/pedidos queda como alias por si alguien lo guardo. */}
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
              <MisEntregas />
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
          path="/sucursales"
          element={
            <ProtectedRoute rolesPermitidos={['administrador']}>
              <GestionSucursales />
            </ProtectedRoute>
          }
        />

        <Route
          path="/sucursal/pedidos"
          element={
            <ProtectedRoute rolesPermitidos={['sucursal', 'administrador']}>
              <PedidosSucursal />
            </ProtectedRoute>
          }
        />

        <Route
          path="/planta/pedidos"
          element={
            <ProtectedRoute rolesPermitidos={['operador_planta', 'administrador']}>
              <PedidosPlanta />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}