import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { authRepository } from '../../repositories/AuthRepository';
import AvatarUsuario from '../../components/AvatarUsuario';
import EditarPerfil from '../perfil/EditarPerfil';
import {
  ArrowRight, Bell, Crown, FileSpreadsheet, FileText, LogOut, MapPin, Moon, PackageCheck, Route,
  ShieldCheck, ShoppingCart, Sun, Truck, UserCog, Users, Warehouse,
} from 'lucide-react';

const PANELES_POR_ROL = {
  superadmin: {
    titulo: 'Panel de Superadmin',
    responsabilidad: 'Supervisa el sistema y administra exclusivamente las cuentas de administradores y Superadmin. Puede consultar pedidos, pero no aprobarlos.',
    accesos: [
      { titulo: 'Resumen administrativo', detalle: 'Indicadores, inventario y seguimiento general.', ruta: '/admin', icono: ShieldCheck },
      { titulo: 'Planilla de ventas', detalle: 'Ventas por sucursal, inventario y costos de la semana.', ruta: '/planilla', icono: FileSpreadsheet },
      { titulo: 'Administrar usuarios', detalle: 'Gestiona usuarios y asigna roles administrativos.', ruta: '/usuarios', icono: Users },
      { titulo: 'Ver pedidos', detalle: 'Consulta pedidos y su avance sin aprobarlos.', ruta: '/sucursal', icono: ShoppingCart },
      { titulo: 'Sucursales', detalle: 'Consulta y organiza sucursales.', ruta: '/sucursales', icono: MapPin },
      { titulo: 'Rutas de reparto', detalle: 'Organiza rutas y repartidores.', ruta: '/rutas', icono: Route },
      { titulo: 'Dueños', detalle: 'Administra dueños y sus sucursales.', ruta: '/duenos', icono: Crown },
      { titulo: 'Revisiones y Multas', detalle: 'Crea revisiones y multas para dueños.', ruta: '/revisiones-dueno', icono: FileText },
    ],
  },
  administrador: {
    titulo: 'Panel de Administrador',
    responsabilidad: 'Administra la operación general, aprueba pedidos y gestiona sucursales, rutas, dueños y usuarios no administrativos.',
    accesos: [
      { titulo: 'Resumen administrativo', detalle: 'Indicadores, inventario y seguimiento general.', ruta: '/admin', icono: ShieldCheck },
      { titulo: 'Bandeja de avisos', detalle: 'Reportes de entrega y faltantes de las sucursales.', ruta: '/avisos', icono: Bell },
      { titulo: 'Pedidos', detalle: 'Consulta y aprueba solicitudes de las sucursales.', ruta: '/sucursal', icono: ShoppingCart },
      { titulo: 'Usuarios', detalle: 'Gestiona usuarios operativos y de sucursal.', ruta: '/usuarios', icono: Users },
      { titulo: 'Sucursales', detalle: 'Consulta y organiza sucursales.', ruta: '/sucursales', icono: MapPin },
      { titulo: 'Rutas de reparto', detalle: 'Organiza rutas y repartidores.', ruta: '/rutas', icono: Route },
      { titulo: 'Dueños', detalle: 'Administra dueños y sus sucursales.', ruta: '/duenos', icono: Crown },
      { titulo: 'Revisiones y Multas', detalle: 'Crea revisiones y multas para dueños.', ruta: '/revisiones-dueno', icono: FileText },
    ],
  },
  operador_planta: {
    titulo: 'Panel de Planta',
    responsabilidad: 'Registra la recepción de pollo y prepara los pedidos aprobados; marca cuándo están listos para despacho.',
    accesos: [
      { titulo: 'Recepción de pollo', detalle: 'Registra el ingreso de producto e inventario.', ruta: '/planta', icono: Warehouse },
      { titulo: 'Preparar pedidos', detalle: 'Inicia la preparación y marca pedidos listos.', ruta: '/planta/pedidos', icono: PackageCheck },
    ],
  },
  despachador: {
    titulo: 'Panel de Despacho',
    responsabilidad: 'Revisa los pedidos listos asignados, los recoge y comparte el seguimiento GPS durante la entrega.',
    accesos: [
      { titulo: 'Pedidos para recoger', detalle: 'Marca la recogida e inicia el seguimiento del recorrido.', ruta: '/despacho', icono: Truck },
    ],
  },
  sucursal: {
    titulo: 'Panel de Sucursal',
    responsabilidad: 'Consulta el avance de los pedidos de su sucursal, confirma la recepción de las entregas y reporta novedades.',
    accesos: [
      { titulo: 'Pedidos y entregas', detalle: 'Sigue el avance de los pedidos, confirma las recepciones y reporta novedades.', ruta: '/sucursal', icono: ShoppingCart },
    ],
  },
  dueno: {
    titulo: 'Panel de Dueño',
    responsabilidad: 'Consulta sus sucursales, crea pedidos para ellas y revisa el avance; no modifica el trabajo de planta ni despacho.',
    accesos: [
      { titulo: 'Mis sucursales y pedidos', detalle: 'Consulta sucursales, solicita pedidos y sigue su avance.', ruta: '/mis-sucursales', icono: Crown },
    ],
  },
};

export default function PanelPrincipal() {
  const { perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const panel = PANELES_POR_ROL[perfil?.roles?.nombre];
  const rolLabel = perfil?.roles?.nombre?.replaceAll('_', ' ') || 'Usuario';

  const card = darkMode ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-white';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';

  return (
    <main className={`min-h-screen px-4 py-6 md:px-8 md:py-10 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <div className="mx-auto max-w-6xl">
        <header className={`mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 shadow ${card}`}>
          <div className="flex items-center gap-4">
            <AvatarUsuario perfil={perfil} size={56} />
            <div>
              <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-500">
                {perfil?.roles?.nombre === 'superadmin' ? <Crown size={16} /> : <ShieldCheck size={16} />}
                {rolLabel}
              </p>
              <h1 className={`text-2xl font-black md:text-3xl ${strong}`}>
                {panel?.titulo || 'Panel principal'}
              </h1>
              <p className={`mt-1 text-sm ${muted}`}>Bienvenido, {perfil?.nombre_completo || 'usuario'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditandoPerfil(true)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                darkMode
                  ? 'border-slate-700 text-amber-400 hover:bg-slate-800'
                  : 'border-gray-300 text-amber-600 hover:bg-gray-50'
              }`}
            >
              <UserCog size={16} /> Editar perfil
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className={`rounded-xl border p-2.5 ${darkMode ? 'border-slate-700 text-amber-400' : 'border-gray-300 text-amber-600'}`}
              aria-label="Cambiar tema"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              type="button"
              onClick={() => authRepository.logout()}
              className="flex items-center gap-2 rounded-xl border border-red-800/50 bg-red-950/50 px-3 py-2.5 text-sm font-semibold text-red-300"
            >
              <LogOut size={16} /> Salir
            </button>
          </div>
        </header>

        <section className={`mb-6 rounded-2xl border p-5 ${card}`}>
          <h2 className={`font-bold ${strong}`}>Responsabilidades de tu panel</h2>
          <p className={`mt-2 text-sm leading-6 ${muted}`}>
            {panel?.responsabilidad || 'No se encontró una configuración de panel para este rol. Contacta al administrador.'}
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(panel?.accesos || []).map(({ titulo, detalle, ruta, icono: Icono }) => (
            <button
              key={ruta}
              type="button"
              onClick={() => navigate(ruta)}
              className={`group flex min-h-40 flex-col items-start rounded-2xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-500/50 hover:shadow-lg ${card}`}
            >
              <span className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-500">
                <Icono size={20} />
              </span>
              <span className={`flex w-full items-center justify-between gap-2 font-bold ${strong}`}>
                {titulo}
                <ArrowRight size={16} className="shrink-0 text-amber-500 transition group-hover:translate-x-1" />
              </span>
              <span className={`mt-1 text-sm ${muted}`}>{detalle}</span>
            </button>
          ))}
        </section>
      </div>

      <EditarPerfil abierto={editandoPerfil} onCerrar={() => setEditandoPerfil(false)} />
    </main>
  );
}
