import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { adminRepository } from '../../repositories/AdminRepository';
import { authRepository } from '../../repositories/AuthRepository';
import { pedidosRepository } from '../../repositories/pedidosRepository';
import { supabase } from '../../config/supabaseClient';
import { exportarAExcel, exportarAPDF } from '../../utils/exportUtils';
import { ArrowLeft, LogOut, ShieldCheck, TrendingUp, Package, Truck, DollarSign, RefreshCw, FileSpreadsheet, FileText, Filter, Sun, Moon, Users, MapPin, MapPinned, Crown, Route, ShoppingCart, AlertCircle, Search, X } from 'lucide-react';
import MapaGeneral from '../../components/MapaGeneral';
import MapaFlota from '../../components/MapaFlota';
import SeguimientoRepartidor from '../../components/SeguimientoRepartidor';
import PanelNotificaciones from '../../components/PanelNotificaciones';

export default function DashboardAdmin() {
  const { perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [recepciones, setRecepciones] = useState([]);
  const [despachos, setDespachos] = useState([]);
  const [inventario, setInventario] = useState(null);
  const [puntos, setPuntos] = useState([]);
  const [cargandoPuntos, setCargandoPuntos] = useState(true);
  const [errorPuntos, setErrorPuntos] = useState('');
  const [cargando, setCargando] = useState(true);
  const [filtroFecha, setFiltroFecha] = useState('');
  const [busquedaMapa, setBusquedaMapa] = useState('');
  const [filtroMapaSucursal, setFiltroMapaSucursal] = useState('todas');
  const [filtroMapaUsuario, setFiltroMapaUsuario] = useState('todos');
  const [pedidosEnCamino, setPedidosEnCamino] = useState([]);
  const [cargandoSeguimiento, setCargandoSeguimiento] = useState(true);
  const [errorSeguimiento, setErrorSeguimiento] = useState('');

  const cargarPedidosEnCamino = useCallback(async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setCargandoSeguimiento(true);
      const pedidos = await pedidosRepository.listar({ estados: ['RECOGIDO'] });
      setPedidosEnCamino(pedidos);
      setErrorSeguimiento('');
    } catch (err) {
      setErrorSeguimiento(err.message || 'No se pudieron cargar los pedidos en camino.');
    } finally {
      if (!silencioso) setCargandoSeguimiento(false);
    }
  }, []);

  const cargarMétricas = useCallback(async () => {
    try {
      setCargando(true);
      const [resRecepciones, resDespachos, resInv] = await Promise.all([
        adminRepository.obtenerResumenRecepciones(),
        adminRepository.obtenerResumenDespachos(),
        adminRepository.obtenerInventarioPlanta(),
      ]);

      setRecepciones(resRecepciones || []);
      setDespachos(resDespachos || []);
      setInventario(resInv);
    } catch (err) {
      console.error('Error al cargar métricas de administración:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarMétricas();
  }, [cargarMétricas]);

  const cargarPuntosMapa = useCallback(async () => {
    try {
      setCargandoPuntos(true);
      setErrorPuntos('');
      setPuntos(await adminRepository.obtenerPuntosMapa());
    } catch (err) {
      console.error('No se pudieron cargar los puntos del mapa:', err);
      setErrorPuntos(err.message || 'No se pudieron cargar las ubicaciones registradas.');
    } finally {
      setCargandoPuntos(false);
    }
  }, []);

  useEffect(() => {
    cargarPuntosMapa();
  }, [cargarPuntosMapa]);

  useEffect(() => {
    cargarPedidosEnCamino();

    const canal = supabase
      .channel('admin-pedidos-en-camino')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        () => cargarPedidosEnCamino({ silencioso: true })
      )
      .subscribe();
    const intervalo = window.setInterval(
      () => cargarPedidosEnCamino({ silencioso: true }),
      20000
    );

    return () => {
      window.clearInterval(intervalo);
      supabase.removeChannel(canal);
    };
  }, [cargarPedidosEnCamino]);

  const recepcionesFiltradas = filtroFecha 
    ? recepciones.filter(r => r.fecha === filtroFecha) 
    : recepciones;

  const despachosFiltrados = filtroFecha 
    ? despachos.filter(d => d.fecha === filtroFecha) 
    : despachos;

  const filtrosMapaActivos =
    busquedaMapa.trim() !== '' ||
    filtroMapaSucursal !== 'todas' ||
    filtroMapaUsuario !== 'todos';

  const limpiarFiltrosMapa = () => {
    setBusquedaMapa('');
    setFiltroMapaSucursal('todas');
    setFiltroMapaUsuario('todos');
  };

  const sucursalesMapa = useMemo(
    () => [...new Set(puntos.map((p) => p.sucursal).filter(Boolean))].sort(),
    [puntos]
  );

  const usuariosMapa = useMemo(
    () => [...new Set(puntos.map((p) => p.usuario).filter(Boolean))].sort(),
    [puntos]
  );

  const puntosMapaFiltrados = useMemo(() => {
    const q = busquedaMapa.trim().toLowerCase();
    return puntos.filter((p) => {
      if (filtroMapaSucursal !== 'todas' && p.sucursal !== filtroMapaSucursal) return false;
      if (filtroMapaUsuario !== 'todos' && p.usuario !== filtroMapaUsuario) return false;
      if (!q) return true;
      return (
        p.titulo?.toLowerCase().includes(q) ||
        p.detalle?.toLowerCase().includes(q) ||
        p.usuario?.toLowerCase().includes(q) ||
        p.sucursal?.toLowerCase().includes(q)
      );
    });
  }, [puntos, filtroMapaSucursal, filtroMapaUsuario, busquedaMapa]);

  const totalKilosComprados = recepcionesFiltradas.reduce((acc, r) => acc + Number(r.kilos || 0), 0);
  const totalUnidadesCompradas = recepcionesFiltradas.reduce((acc, r) => acc + Number(r.unidades || 0), 0);
  const totalMontoGasto = recepcionesFiltradas.reduce((acc, r) => acc + Number(r.total_monto || 0), 0);

  const totalKilosDespachados = despachosFiltrados.reduce((acc, d) => acc + Number(d.kilos || 0), 0);
  const totalUnidadesDespachadas = despachosFiltrados.reduce((acc, d) => acc + Number(d.unidades || 0), 0);

  const exportarRecepcionesExcel = () => {
    const datos = recepcionesFiltradas.map(r => ({
      Fecha: r.fecha,
      Proveedor: r.proveedores?.nombre || 'N/D',
      Unidades: r.unidades,
      Kilos: r.kilos,
      'Total (Bs)': r.total_monto
    }));
    exportarAExcel(datos, 'Reporte_Recepciones');
  };

  const exportarRecepcionesPDF = () => {
    const columnas = ['Fecha', 'Proveedor', 'Unidades', 'Kilos', 'Total (Bs)'];
    const filas = recepcionesFiltradas.map(r => [
      r.fecha,
      r.proveedores?.nombre || 'N/D',
      r.unidades,
      `${r.kilos} kg`,
      `Bs ${r.total_monto}`
    ]);
    exportarAPDF(columnas, filas, 'Reporte General de Recepciones', 'Reporte_Recepciones');
  };

  const exportarDespachosExcel = () => {
    const datos = despachosFiltrados.map(d => ({
      Fecha: d.fecha,
      Sucursal: d.sucursales?.nombre || 'N/D',
      Sector: d.sucursales?.sector || 'N/D',
      Unidades: d.unidades,
      Kilos: d.kilos
    }));
    exportarAExcel(datos, 'Reporte_Despachos');
  };

  const exportarDespachosPDF = () => {
    const columnas = ['Fecha', 'Sucursal', 'Sector', 'Unidades', 'Kilos'];
    const filas = despachosFiltrados.map(d => [
      d.fecha,
      d.sucursales?.nombre || 'N/D',
      d.sucursales?.sector || 'N/D',
      `${d.unidades} u`,
      `${d.kilos} kg`
    ]);
    exportarAPDF(columnas, filas, 'Reporte General de Despachos', 'Reporte_Despachos');
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      {/* Encabezado */}
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center p-6 rounded-2xl shadow-xl mb-8 gap-4 border transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
        <div>
          <div className="flex items-center gap-2 text-amber-500 font-semibold text-xs uppercase tracking-wider mb-1">
            {perfil?.roles?.nombre === 'superadmin' ? <Crown size={16} /> : <ShieldCheck size={16} />}
            {perfil?.roles?.nombre === 'superadmin'
              ? 'Panel exclusivo de Superadmin'
              : 'Panel de Control Administrativo'}
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Sistema de Control Avícola</h1>
          <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Bienvenido, <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>{perfil?.nombre_completo || 'Administrador'}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          <button
            onClick={() => navigate('/panel')}
            className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm font-semibold text-amber-500 transition hover:bg-amber-500/20"
          >
            <ArrowLeft size={16} /> <span className="hidden sm:inline">Panel principal</span>
          </button>
          {/* Botón Tema */}
          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl border transition flex items-center justify-center ${darkMode ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-gray-100 border-gray-300 text-amber-600 hover:bg-gray-200'}`}
            title="Cambiar Modo Oscuro / Claro"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Avisos de las sucursales: solo el administrador los recibe */}
          {perfil?.roles?.nombre === 'administrador' && <PanelNotificaciones />}

          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-gray-50 border-gray-300 text-gray-800'}`}>
            <Filter size={16} className="text-amber-500" />
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="bg-transparent text-xs outline-none cursor-pointer"
            />
            {filtroFecha && (
              <button onClick={() => setFiltroFecha('')} className="text-xs text-gray-400 hover:text-white ml-1 font-bold">×</button>
            )}
          </div>
          <button
            onClick={() => navigate('/sucursales')}
            className="flex items-center gap-2 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-500 px-3 md:px-4 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            <MapPin size={16} /> <span className="hidden lg:inline">Sucursales</span>
          </button>
          <button
            onClick={() => navigate('/sucursal')}
            className="flex items-center gap-2 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-600 px-3 md:px-4 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            <ShoppingCart size={16} /> <span className="hidden lg:inline">Pedidos</span>
          </button>
          <button
            onClick={() => navigate('/duenos')}
            className="flex items-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-500 px-3 md:px-4 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            <Crown size={16} /> <span className="hidden lg:inline">Dueños</span>
          </button>
          <button
            onClick={() => navigate('/rutas')}
            className="flex items-center gap-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-500 px-3 md:px-4 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            <Route size={16} /> <span className="hidden lg:inline">Rutas</span>
          </button>
          <button
            onClick={() => navigate('/usuarios')}
            className="flex items-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-500 px-3 md:px-4 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            <Users size={16} /> <span className="hidden sm:inline">Usuarios</span>
          </button>
          <button
            onClick={cargarMétricas}
            disabled={cargando}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-gray-200 border-gray-300 text-gray-800 hover:bg-gray-300'}`}
          >
            <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button
            onClick={() => authRepository.logout()}
            className="flex items-center gap-2 bg-red-950/50 hover:bg-red-900/60 border border-red-800/50 text-red-300 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
          >
            <LogOut size={16} /> Salir
          </button>
        </div>
      </div>

      <section className={`mb-8 rounded-2xl border p-6 shadow-xl ${
        darkMode ? 'border-cyan-900/60 bg-slate-900' : 'border-cyan-200 bg-white'
      }`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-700/20 pb-4">
          <div>
            <h2 className={`flex items-center gap-2 text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <Truck className="text-cyan-500" size={20} />
              Seguimiento en vivo
              <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-bold text-cyan-600">
                {pedidosEnCamino.length}
              </span>
            </h2>
            <p className={`mt-1 text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              Pedidos en camino con ubicación del repartidor, recorrido vial y ETA aproximada.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => cargarPedidosEnCamino()}
              disabled={cargandoSeguimiento}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                darkMode
                  ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <RefreshCw size={14} className={cargandoSeguimiento ? 'animate-spin' : ''} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => navigate('/sucursal')}
              className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-600 transition hover:bg-cyan-500/20"
            >
              Ver todos los pedidos
            </button>
          </div>
        </div>

        {errorSeguimiento ? (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span>No se pudo cargar el seguimiento en vivo: {errorSeguimiento}</span>
          </div>
        ) : cargandoSeguimiento && pedidosEnCamino.length === 0 ? (
          <p className={`py-8 text-center text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Cargando pedidos en camino...
          </p>
        ) : pedidosEnCamino.length === 0 ? (
          <p className={`rounded-xl border border-dashed p-8 text-center text-sm ${
            darkMode ? 'border-slate-700 text-slate-400' : 'border-gray-300 text-gray-500'
          }`}>
            No hay pedidos en camino en este momento.
          </p>
        ) : (
          <div className="space-y-4">
            <MapaFlota
              pedidos={pedidosEnCamino}
              theme={{
                borde: darkMode ? 'border-slate-800' : 'border-gray-200',
                texto: darkMode ? 'text-slate-300' : 'text-gray-700',
                oscuro: darkMode,
              }}
            />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {pedidosEnCamino.map((pedido) => (
                <article
                  key={pedido.id}
                  className={`min-w-0 rounded-xl border p-4 ${
                    darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <h3 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Pedido #{pedido.id} · {pedido.sucursales?.nombre || 'Sucursal'}
                    </h3>
                    <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-cyan-600">
                      En camino
                    </span>
                  </div>
                  <p className={`mb-2 text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    {pedido.unidades} unidades
                    {pedido.sucursales?.sector ? ` · Zona ${pedido.sucursales.sector}` : ''}
                  </p>
                  <SeguimientoRepartidor pedido={pedido} darkMode={darkMode} sinMapa />
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className={`p-6 rounded-2xl shadow-xl border relative overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className="flex justify-between items-center mb-3">
            <span className={`text-xs uppercase tracking-wider font-bold ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Pollo Ingresado</span>
            <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl"><Package size={22} /></div>
          </div>
          <div className={`text-3xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>{totalKilosComprados.toLocaleString()} <span className="text-lg font-bold text-amber-500">kg</span></div>
          <div className={`text-xs mt-1 font-medium ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{totalUnidadesCompradas.toLocaleString()} unidades</div>
        </div>

        <div className={`p-6 rounded-2xl shadow-xl border relative overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className="flex justify-between items-center mb-3">
            <span className={`text-xs uppercase tracking-wider font-bold ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Pollo Despachado</span>
            <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl"><Truck size={22} /></div>
          </div>
          <div className={`text-3xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>{totalKilosDespachados.toLocaleString()} <span className="text-lg font-bold text-blue-500">kg</span></div>
          <div className={`text-xs mt-1 font-medium ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{totalUnidadesDespachadas.toLocaleString()} unidades</div>
        </div>

        <div className={`p-6 rounded-2xl shadow-xl border relative overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className="flex justify-between items-center mb-3">
            <span className={`text-xs uppercase tracking-wider font-bold ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Inversión Total</span>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl"><DollarSign size={22} /></div>
          </div>
          <div className="text-3xl font-black text-emerald-500 tracking-tight">Bs {totalMontoGasto.toLocaleString()}</div>
          <div className={`text-xs mt-1 font-medium ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Acumulado compras</div>
        </div>

        <div className={`p-6 rounded-2xl shadow-xl border relative overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className="flex justify-between items-center mb-3">
            <span className={`text-xs uppercase tracking-wider font-bold ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Stock Planta</span>
            <div className="p-2.5 bg-purple-500/10 text-purple-500 rounded-xl"><TrendingUp size={22} /></div>
          </div>
          <div className={`text-3xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {inventario ? `${Number(inventario.kilos_saldo || 0).toLocaleString()} ` : '0 '}
            <span className="text-lg font-bold text-purple-500">kg</span>
          </div>
          <div className={`text-xs mt-1 font-medium ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            {inventario ? `${inventario.unidades_saldo} unidades` : 'Sin stock'}
          </div>
        </div>
      </div>

      {/* Tablas y Exportaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recepciones */}
        <div className={`rounded-2xl shadow-xl p-6 border flex flex-col transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 pb-4 border-b border-gray-700/30 gap-3">
            <h2 className={`text-lg font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <Package className="text-amber-500" size={20} /> Recepciones ({recepcionesFiltradas.length})
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={exportarRecepcionesExcel} className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-bold transition">
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button onClick={exportarRecepcionesPDF} className="flex items-center gap-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-xl text-xs font-bold transition">
                <FileText size={14} /> PDF
              </button>
            </div>
          </div>
          <div className={`overflow-x-auto flex-1 max-h-96 rounded-xl border ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`text-xs font-bold uppercase tracking-wider sticky top-0 border-b ${darkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  <th className="p-3.5">Fecha</th>
                  <th className="p-3.5">Proveedor</th>
                  <th className="p-3.5">Unidades</th>
                  <th className="p-3.5">Kilos</th>
                  <th className="p-3.5">Total</th>
                </tr>
              </thead>
              <tbody className={`divide-y text-sm ${darkMode ? 'divide-slate-800 text-slate-300' : 'divide-gray-200 text-gray-700'}`}>
                {recepcionesFiltradas.length === 0 ? (
                  <tr><td colSpan="5" className="p-6 text-center text-gray-400">No hay registros</td></tr>
                ) : (
                  recepcionesFiltradas.map((r) => (
                    <tr key={r.id} className={`transition ${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                      <td className={`p-3.5 font-medium ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{r.fecha}</td>
                      <td className={`p-3.5 font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{r.proveedores?.nombre || 'N/D'}</td>
                      <td className="p-3.5">{r.unidades} u</td>
                      <td className="p-3.5">{r.kilos} kg</td>
                      <td className="p-3.5 font-bold text-emerald-500">Bs {r.total_monto}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Despachos */}
        <div className={`rounded-2xl shadow-xl p-6 border flex flex-col transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 pb-4 border-b border-gray-700/30 gap-3">
            <h2 className={`text-lg font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <Truck className="text-blue-500" size={20} /> Despachos ({despachosFiltrados.length})
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={exportarDespachosExcel} className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-bold transition">
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button onClick={exportarDespachosPDF} className="flex items-center gap-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-xl text-xs font-bold transition">
                <FileText size={14} /> PDF
              </button>
            </div>
          </div>
          <div className={`overflow-x-auto flex-1 max-h-96 rounded-xl border ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`text-xs font-bold uppercase tracking-wider sticky top-0 border-b ${darkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  <th className="p-3.5">Fecha</th>
                  <th className="p-3.5">Sucursal</th>
                  <th className="p-3.5">Sector</th>
                  <th className="p-3.5">Unidades</th>
                  <th className="p-3.5">Kilos</th>
                </tr>
              </thead>
              <tbody className={`divide-y text-sm ${darkMode ? 'divide-slate-800 text-slate-300' : 'divide-gray-200 text-gray-700'}`}>
                {despachosFiltrados.length === 0 ? (
                  <tr><td colSpan="5" className="p-6 text-center text-gray-400">No hay registros</td></tr>
                ) : (
                  despachosFiltrados.map((d) => (
                    <tr key={d.id} className={`transition ${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                      <td className={`p-3.5 font-medium ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{d.fecha}</td>
                      <td className={`p-3.5 font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{d.sucursales?.nombre || 'N/D'}</td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {d.sucursales?.sector || 'N/D'}
                        </span>
                      </td>
                      <td className="p-3.5">{d.unidades} u</td>
                      <td className="p-3.5 font-bold text-blue-500">{d.kilos} kg</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mapa general: donde se marco cada movimiento */}
      <div className={`mt-8 rounded-2xl shadow-xl p-6 border transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 pb-4 border-b border-gray-700/30 gap-3">
          <h2 className={`text-lg font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            <MapPinned className="text-emerald-500" size={20} /> Donde se registran las entregas
          </h2>
          <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Cada punto requiere que se guarde una ubicación desde su formulario.
          </p>
        </div>

        <div className="mb-4 flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className={`absolute left-3.5 top-2.5 pointer-events-none ${darkMode ? 'text-slate-500' : 'text-gray-400'}`} size={16} />
            <input
              type="text"
              value={busquedaMapa}
              onChange={(e) => setBusquedaMapa(e.target.value)}
              placeholder="Buscar por sucursal, usuario, proveedor o tipo..."
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 transition ${
                darkMode
                  ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20'
                  : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:ring-emerald-500/20'
              }`}
            />
          </div>
          <select
            value={filtroMapaSucursal}
            onChange={(e) => setFiltroMapaSucursal(e.target.value)}
            className={`px-3 py-2 rounded-xl text-sm font-medium border focus:outline-none focus:ring-2 transition ${
              darkMode
                ? 'bg-slate-950/60 border-slate-800 text-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                : 'bg-gray-50 border-gray-300 text-gray-700 focus:border-emerald-500 focus:ring-emerald-500/20'
            }`}
          >
            <option value="todas">Todas las sucursales</option>
            {sucursalesMapa.map((sucursal) => (
              <option key={sucursal} value={sucursal}>{sucursal}</option>
            ))}
          </select>
          <select
            value={filtroMapaUsuario}
            onChange={(e) => setFiltroMapaUsuario(e.target.value)}
            className={`px-3 py-2 rounded-xl text-sm font-medium border focus:outline-none focus:ring-2 transition ${
              darkMode
                ? 'bg-slate-950/60 border-slate-800 text-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20'
                : 'bg-gray-50 border-gray-300 text-gray-700 focus:border-emerald-500 focus:ring-emerald-500/20'
            }`}
          >
            <option value="todos">Todos los usuarios</option>
            {usuariosMapa.map((nombre) => (
              <option key={nombre} value={nombre}>{nombre}</option>
            ))}
          </select>
          {filtrosMapaActivos && (
            <button
              type="button"
              onClick={limpiarFiltrosMapa}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition"
            >
              <X size={14} /> Limpiar
            </button>
          )}
        </div>

        {errorPuntos && (
          <div role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
            No se pudieron cargar las ubicaciones: {errorPuntos}
            <button
              type="button"
              onClick={cargarPuntosMapa}
              disabled={cargandoPuntos}
              className="ml-3 font-bold underline disabled:opacity-60"
            >
              Reintentar
            </button>
          </div>
        )}
        {!errorPuntos && puntos.length === 0 && !cargandoPuntos && (
          <div className={`mb-4 rounded-xl border p-4 text-sm ${
            darkMode
              ? 'border-slate-700 bg-slate-950/60 text-slate-300'
              : 'border-gray-200 bg-gray-50 text-gray-700'
          }`}>
            El mapa está disponible, pero todavía no hay formularios con coordenadas guardadas.
            Al registrar una recepción, despacho o entrega, marca la ubicación en el mapa del formulario
            o usa el botón de ubicación del dispositivo. Los registros anteriores sin coordenadas no
            se pueden ubicar automáticamente.
          </div>
        )}

        <MapaGeneral
          puntos={puntosMapaFiltrados}
          cargando={cargandoPuntos}
          error={errorPuntos}
          theme={{
            borde: darkMode ? 'border-slate-800' : 'border-gray-200',
            texto: darkMode ? 'text-slate-300' : 'text-gray-700',
            tenue: darkMode ? 'text-slate-500' : 'text-gray-400',
            hoja: darkMode ? 'bg-slate-900' : 'bg-white',
          }}
        />
      </div>
    </div>
  );
}
