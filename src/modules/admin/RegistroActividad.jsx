import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { RefreshCw, Search, Calendar, ChevronDown, User, Table } from 'lucide-react';

export default function RegistroActividad() {
  const { darkMode } = useTheme();
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [tablaFiltro, setTablaFiltro] = useState('todas');

  const cargarLogs = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from('auditoria')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(200);
    
    if (data) setLogs(data);
    setCargando(false);
  };

  useEffect(() => {
    cargarLogs();
  }, []);

  const tablas = useMemo(() => [...new Set(logs.map(l => l.tabla))], [logs]);

  const filtrados = logs.filter(l => 
    (tablaFiltro === 'todas' || l.tabla === tablaFiltro) &&
    (busqueda === '' || l.usuario_nombre?.toLowerCase().includes(busqueda.toLowerCase()) || l.tabla.toLowerCase().includes(busqueda.toLowerCase()))
  );

  return (
    <div className={`min-h-screen p-8 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Table className="text-emerald-500" /> Registro de Actividad
        </h1>
        <button onClick={cargarLogs} className="p-2 rounded-lg hover:bg-white/10"><RefreshCw size={20}/></button>
      </div>

      <div className="flex gap-4 mb-6">
        <input 
          className={`px-4 py-2 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}
          placeholder="Buscar usuario o tabla..."
          onChange={e => setBusqueda(e.target.value)}
        />
        <select 
          className={`px-4 py-2 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white'}`}
          onChange={e => setTablaFiltro(e.target.value)}
        >
          <option value="todas">Todas las tablas</option>
          {tablas.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className={`overflow-x-auto rounded-2xl border ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
        <table className="w-full text-sm">
          <thead className={darkMode ? 'bg-slate-900' : 'bg-gray-50'}>
            <tr>
              <th className="p-4 text-left">Fecha</th>
              <th className="p-4 text-left">Usuario</th>
              <th className="p-4 text-left">Acción</th>
              <th className="p-4 text-left">Tabla</th>
              <th className="p-4 text-left">Detalle</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-gray-200'}`}>
            {filtrados.map(l => (
              <tr key={l.id}>
                <td className="p-4">{new Date(l.creado_en).toLocaleString()}</td>
                <td className="p-4 font-medium">{l.usuario_nombre || 'Sistema'}</td>
                <td className="p-4 uppercase font-bold text-xs">{l.accion}</td>
                <td className="p-4">{l.tabla}</td>
                <td className="p-4 text-xs font-mono opacity-70">
                  {l.datos_new ? 'Ver cambios' : 'Eliminado'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
