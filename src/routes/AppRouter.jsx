import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';

const Login = lazy(() => import('../modules/auth/Login'));
const RecepcionPollo = lazy(() => import('../modules/planta/RecepcionPollo'));
const DashboardAdmin = lazy(() => import('../modules/admin/DashboardAdmin'));
const GestionUsuarios = lazy(() => import('../modules/admin/GestionUsuarios'));
const GestionSucursales = lazy(() => import('../modules/admin/GestionSucursales'));
const PedidosSucursal = lazy(() => import('../modules/sucursal/PedidosSucursal'));
const BandejaAvisosSucursal = lazy(() => import('../modules/sucursal/BandejaAvisosSucursal'));
const PedidosPlanta = lazy(() => import('../modules/planta/PedidosPlanta'));
const PedidosDespachador = lazy(() => import('../modules/despacho/PedidosDespachador'));
const MisSucursalesDueno = lazy(() => import('../modules/dueno/MisSucursalesDueno'));
const BandejaAvisosDueno = lazy(() => import('../modules/dueno/BandejaAvisosDueno'));
const GestionDuenos = lazy(() => import('../modules/admin/GestionDuenos'));
const GestionProveedores = lazy(() => import('../modules/admin/GestionProveedores'));
const GestionRutas = lazy(() => import('../modules/admin/GestionRutas'));
const BandejaAvisos = lazy(() => import('../modules/admin/BandejaAvisos'));
const RecuperarContrasena = lazy(() => import('../modules/auth/RecuperarContrasena'));
const NuevaContrasena = lazy(() => import('../modules/auth/NuevaContrasena'));
const PanelPrincipal = lazy(() => import('../modules/panel/PanelPrincipal'));
const RegistroActividad = lazy(() => import('../modules/admin/RegistroActividad'));
const PlanillaSemanal = lazy(() => import('../modules/superadmin/PlanillaSemanal'));
const CapturaPlanilla = lazy(() => import('../modules/superadmin/CapturaPlanilla'));
const GestionRevisionesDueno = lazy(() => import('../modules/admin/GestionRevisionesDueno'));
const ReporteRosticero = lazy(() => import('../modules/rosticero/ReporteRosticero'));

function CargandoRuta() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
      <div className="animate-pulse text-sm font-semibold">Cargando...</div>
    </div>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<CargandoRuta />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
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
            <ProtectedRoute rolesPermitidos={['sucursal', 'administrador', 'superadministrador']}>
              <PedidosSucursal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sucursal/avisos"
          element={
            <ProtectedRoute rolesPermitidos={['sucursal']}>
              <BandejaAvisosSucursal />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute rolesPermitidos={['administrador', 'superadministrador']}>
              <DashboardAdmin />
            </ProtectedRoute>
          }
        />

        <Route
          path="/usuarios"
          element={
            <ProtectedRoute rolesPermitidos={['administrador', 'superadministrador']}>
              <GestionUsuarios />
            </ProtectedRoute>
          }
        />

        <Route
          path="/avisos"
          element={
            <ProtectedRoute rolesPermitidos={['administrador']}>
              <BandejaAvisos />
            </ProtectedRoute>
          }
        />

        <Route
          path="/sucursales"
          element={
            <ProtectedRoute rolesPermitidos={['administrador', 'superadministrador']}>
              <GestionSucursales />
            </ProtectedRoute>
          }
        />

        <Route
          path="/duenos"
          element={
            <ProtectedRoute rolesPermitidos={['administrador', 'superadministrador']}>
              <GestionDuenos />
            </ProtectedRoute>
          }
        />

        <Route
          path="/proveedores"
          element={
            <ProtectedRoute rolesPermitidos={['administrador', 'superadministrador']}>
              <GestionProveedores />
            </ProtectedRoute>
          }
        />

        <Route
          path="/rutas"
          element={
            <ProtectedRoute rolesPermitidos={['superadministrador']}>
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
        <Route
          path="/mis-sucursales/avisos"
          element={
            <ProtectedRoute rolesPermitidos={['dueno', 'administrador']}>
              <BandejaAvisosDueno />
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
          path="/auditoria"
          element={
            <ProtectedRoute rolesPermitidos={['administrador', 'superadministrador']}>
              <RegistroActividad />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/planilla"
          element={
            <ProtectedRoute rolesPermitidos={['superadministrador']}>
              <PlanillaSemanal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/planilla/captura"
          element={
            <ProtectedRoute rolesPermitidos={['superadministrador']}>
              <CapturaPlanilla />
            </ProtectedRoute>
          }
        />

        <Route
          path="/revisiones-dueno"
          element={
            <ProtectedRoute rolesPermitidos={['superadministrador']}>
              <GestionRevisionesDueno />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rosticero"
          element={
            <ProtectedRoute rolesPermitidos={['rosticero', 'administrador', 'superadministrador']}>
              <ReporteRosticero />
            </ProtectedRoute>
          }
        />

      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}