import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { adminRepository } from '../../repositories/AdminRepository';
import { authRepository } from '../../repositories/AuthRepository';
import { exportarAExcel, exportarAPDF } from '../../utils/exportUtils';
import { LogOut, ShieldCheck, TrendingUp, Package, Truck, DollarSign, RefreshCw, FileSpreadsheet, FileText, Filter, Sun, Moon, Users, MapPin } from 'lucide-react';

export default function DashboardAdmin() {
  const { perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [recepciones, setRecepciones] = useState([]);
  const [despachos, setDespachos] = useState([]);
  const [inventario, setInventario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtroFecha, setFiltroFecha] = useState('');

  useEffect(() => {
    cargarMétricas();
  }, []);

  const cargarMétricas = async () => {
    try {
      setCargando(true);
      const [resRecepciones, resDespachos, resInv] = await Promise.all([
        adminRepository.obtenerResumenRecepciones(),
        adminRepository.obtenerResumenDespachos(),
        adminRepository.obtenerInventarioPlanta()
      ]);

      setRecepciones(resRecepciones || []);
      setDespachos(resDespachos || []);
      setInventario(resInv);
    } catch (err) {
      console.error('Error al cargar métricas de administración:', err);
    } finally {
      setCargando(false);
    }
  };

  const recepcionesFiltradas = filtroFecha 
    ? recepciones.filter(r => r.fecha === filtroFecha) 
    : recepciones;

  const despachosFiltrados = filtroFecha 
    ? despachos.filter(d => d.fecha === filtroFecha) 
    : despachos;

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
            <ShieldCheck size={16} /> Panel de Control Administrativo
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Sistema de Control Avícola</h1>
          <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            Bienvenido, <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>{perfil?.nombre_completo || 'Administrador'}</span>
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          {/* Botón Tema */}
          <button
            onClick={toggleTheme}
            className={`p-2.5 rounded-xl border transition flex items-center justify-center ${darkMode ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-gray-100 border-gray-300 text-amber-600 hover:bg-gray-200'}`}
            title="Cambiar Modo Oscuro / Claro"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

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
    </div>
  );
}
