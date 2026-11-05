import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { recepcionRepository } from '../../repositories/recepcionRepository';
import { evidenciasRepository } from '../../repositories/evidenciasRepository';
import { authRepository } from '../../repositories/AuthRepository';
import ModalConfirmar from '../../components/ModalConfirmar';
import FirmaCanvas from '../../components/FirmaCanvas';
import SelectorFoto from '../../components/SelectorFoto';
import FotosObservaciones from '../../components/FotosObservaciones';
import { exportarAExcel, exportarAPDF } from '../../utils/exportUtils';
import {
  Archive, ArchiveRestore, ArrowLeft, CalendarDays, CheckCircle, Download,
  AlertCircle, DollarSign, Eye, FileText, Hash, LogOut, Moon, PackagePlus,
  Printer, Scale, Search, ShoppingCart, Sun, User,
} from 'lucide-react';

const fechaLocal = () => {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
};

const escaparHtml = (valor) => String(valor ?? '—').replace(/[&<>"']/g, (caracter) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[caracter]);

const fechaBonita = (valor) => (
  valor ? new Date(`${valor}T12:00:00`).toLocaleDateString('es-BO') : '—'
);

export default function RecepcionPollo() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const [proveedores, setProveedores] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [procesandoArchivoId, setProcesandoArchivoId] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [confirmacionArchivo, setConfirmacionArchivo] = useState(null);
  const [fechaDesde, setFechaDesde] = useState(fechaLocal);
  const [fechaHasta, setFechaHasta] = useState(fechaLocal);
  const [busqueda, setBusqueda] = useState('');
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [archivoDisponible, setArchivoDisponible] = useState(false);

  const [proveedorId, setProveedorId] = useState('');
  const [numeroRecibo, setNumeroRecibo] = useState('');
  const [kilos, setKilos] = useState('');
  const [unidades, setUnidades] = useState('');
  const [precioPorKilo, setPrecioPorKilo] = useState('');
  const [entregadoPor, setEntregadoPor] = useState('');
  const [recibidoPor, setRecibidoPor] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // Evidencia: una foto y dos firmas, la de quien trae y la de quien recibe
  const [foto, setFoto] = useState(null);
  const [firmaEntrega, setFirmaEntrega] = useState(null);
  const [firmaRecepcion, setFirmaRecepcion] = useState(null);
  const [fotosExtra, setFotosExtra] = useState([]);
  const [viendo, setViendo] = useState(null);

  const cargarDatos = useCallback(async () => {
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      setHistorial([]);
      setCargandoHistorial(false);
      setMensaje({ tipo: 'error', texto: 'La fecha inicial no puede ser posterior a la fecha final.' });
      return;
    }

    try {
      setCargandoHistorial(true);
      const [listProveedores, resultadoHistorial] = await Promise.all([
        recepcionRepository.obtenerProveedores(),
        recepcionRepository.obtenerHistorialRecepciones({
          desde: fechaDesde,
          hasta: fechaHasta,
          archivadas: verArchivadas,
        }),
      ]);
      setProveedores(listProveedores);
      setHistorial(resultadoHistorial.recepciones);
      setArchivoDisponible(resultadoHistorial.archivoDisponible);
    } catch (err) {
      console.error('Error al cargar datos:', err);
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudieron cargar proveedores y recepciones.' });
    } finally {
      setCargandoHistorial(false);
    }
  }, [fechaDesde, fechaHasta, verArchivadas]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    if (mensaje?.tipo !== 'exito') return undefined;
    const t = setTimeout(() => setMensaje(null), 5000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const total = useMemo(() => {
    const k = parseFloat(kilos);
    const p = parseFloat(precioPorKilo);
    if (Number.isNaN(k) || Number.isNaN(p)) return null;
    return (k * p).toFixed(2);
  }, [kilos, precioPorKilo]);

  const historialFiltrado = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es-BO');
    if (!termino) return historial;
    return historial.filter((row) => [
      row.numero_recibo,
      row.proveedores?.nombre,
      row.entregado_por_nombre,
      row.recibido_por_nombre,
      row.observaciones,
    ].some((valor) => String(valor || '').toLocaleLowerCase('es-BO').includes(termino)));
  }, [busqueda, historial]);

  const limpiarFormulario = () => {
    setNumeroRecibo('');
    setKilos('');
    setUnidades('');
    setPrecioPorKilo('');
    setEntregadoPor('');
    setRecibidoPor(perfil?.nombre_completo || '');
    setObservaciones('');
    setFoto(null);
    setFirmaEntrega(null);
    setFirmaRecepcion(null);
    setFotosExtra([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje(null);

    // Aviso antes de subir nada: si falta la firma, no tiene
    // sentido gastar datos moviendo archivos al servidor.
    if (!entregadoPor.trim()) {
      setMensaje({ tipo: 'error', texto: 'Escribe quién trae el pollo' });
      return;
    }
    if (!foto) {
      setMensaje({ tipo: 'error', texto: 'Adjunta la foto del lote que está llegando' });
      return;
    }
    if (!firmaEntrega) {
      setMensaje({ tipo: 'error', texto: 'Falta la firma de quien trae el pollo' });
      return;
    }
    if (!firmaRecepcion) {
      setMensaje({ tipo: 'error', texto: 'Falta la firma del encargado que recibe' });
      return;
    }
    if (!recibidoPor.trim()) {
      setMensaje({ tipo: 'error', texto: 'Escribe el nombre de quien recibe en planta' });
      return;
    }

    setCargando(true);

    try {
      await recepcionRepository.registrarLote({
        proveedor_id: proveedorId,
        numero_recibo: numeroRecibo,
        kilos,
        unidades,
        precio_por_kilo: precioPorKilo,
        observaciones,
        entregado_por: entregadoPor,
        recibido_por: recibidoPor,
        fotosExtra,
        foto,
        firmaEntrega: evidenciasRepository.dataUrlABlob(firmaEntrega),
        firmaRecepcion: evidenciasRepository.dataUrlABlob(firmaRecepcion),
      });

      setMensaje({ tipo: 'exito', texto: 'Lote registrado con foto y las dos firmas' });
      limpiarFormulario();
      cargarDatos();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'Error al guardar el registro' });
    } finally {
      setCargando(false);
    }
  };

  const verEvidencia = async (tipo, ruta) => {
    try {
      const url = await recepcionRepository.verEvidencia(ruta);
      if (url) setViendo({ tipo, url });
    } catch (err) {
      console.error('No se pudo abrir la evidencia:', err);
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo abrir la evidencia' });
    }
  };

  const imprimirRecepcion = async (row) => {
    const ventana = window.open('', '_blank', 'width=800,height=700');
    if (!ventana) {
      setMensaje({ tipo: 'error', texto: 'Permite las ventanas emergentes para imprimir el recibo.' });
      return;
    }

    try {
      ventana.document.write('<!doctype html><html lang="es"><head><title>Preparando comprobante...</title></head><body>Preparando comprobante...</body></html>');
      ventana.document.close();

      const [firmaEntregaUrl, firmaRecepcionUrl] = await Promise.all([
        row.firma_entrega_url ? recepcionRepository.verEvidencia(row.firma_entrega_url) : null,
        row.firma_recepcion_url ? recepcionRepository.verEvidencia(row.firma_recepcion_url) : null,
      ]);
      const proveedor = row.proveedores?.nombre || 'Sin proveedor';
      const detalles = [
        ['Recibo', row.numero_recibo],
        ['Fecha', fechaBonita(row.fecha)],
        ['Proveedor', proveedor],
        ['Unidades', `${row.unidades} u`],
        ['Kilos', `${row.kilos} kg`],
        ['Precio por kilo', `Bs ${row.precio_por_kilo}`],
        ['Total', `Bs ${row.total_monto}`],
        ['Traído por', row.entregado_por_nombre],
        ['Recibido por', row.recibido_por_nombre],
        ['Observaciones', row.observaciones],
      ];
      const firmas = [
        ['Firma de quien trae', firmaEntregaUrl],
        ['Firma de quien recibe', firmaRecepcionUrl],
      ];
      ventana.document.open();
      ventana.document.write(`<!doctype html>
        <html lang="es"><head><meta charset="utf-8"><title>Ingreso ${escaparHtml(row.numero_recibo)}</title>
        <style>
          body{font-family:Arial,sans-serif;color:#111827;margin:32px}
          h1{font-size:22px;margin:0 0 6px}p{color:#4b5563;margin:0 0 24px}
          table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #d1d5db}
          th{width:35%;color:#374151}.total{font-weight:bold;font-size:18px}
          .firmas{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px}
          .firma{text-align:center}.firma img{display:block;width:100%;height:100px;object-fit:contain;border-bottom:1px solid #111827}
          .firma span{display:block;margin-top:8px;font-size:12px}
          @media print{body{margin:12mm}}
        </style></head><body><h1>Comprobante de ingreso de pollo</h1>
        <p>Sistema de Control Avícola · Módulo de Planta</p>
        <table>${detalles.map(([etiqueta, valor]) => `<tr><th>${escaparHtml(etiqueta)}</th><td class="${etiqueta === 'Total' ? 'total' : ''}">${escaparHtml(valor)}</td></tr>`).join('')}</table>
        <section class="firmas">${firmas.map(([etiqueta, url]) => `
          <div class="firma">
            ${url ? `<img src="${escaparHtml(url)}" alt="${escaparHtml(etiqueta)}">` : '<div style="height:100px;border-bottom:1px solid #111827"></div>'}
            <span>${escaparHtml(etiqueta)}</span>
          </div>`).join('')}
        </section></body></html>`);
      ventana.document.close();

      const imagenes = [...ventana.document.images];
      await Promise.all(imagenes.map((imagen) => (
        imagen.complete
          ? (imagen.naturalWidth > 0 ? Promise.resolve() : Promise.reject(new Error('No se pudo cargar una firma para imprimir.')))
          : new Promise((resolve, reject) => {
            imagen.onload = resolve;
            imagen.onerror = () => reject(new Error('No se pudo cargar una firma para imprimir.'));
          })
      )));
      ventana.focus();
      ventana.print();
    } catch (err) {
      ventana.close();
      console.error('No se pudo preparar el comprobante para imprimir:', err);
      setMensaje({ tipo: 'error', texto: err.message || 'No se pudo preparar el comprobante para imprimir.' });
    }
  };

  const exportarExcel = () => {
    const filas = historialFiltrado.map((row) => ({
      Fecha: row.fecha,
      Recibo: row.numero_recibo,
      Proveedor: row.proveedores?.nombre || 'Sin proveedor',
      Unidades: Number(row.unidades || 0),
      Kilos: Number(row.kilos || 0),
      'Promedio kg/unidad': Number(row.promedio_kilo_unidad || 0),
      'Precio por kilo (Bs)': Number(row.precio_por_kilo || 0),
      'Total (Bs)': Number(row.total_monto || 0),
      'Traído por': row.entregado_por_nombre || '',
      'Recibido por': row.recibido_por_nombre || '',
      Observaciones: row.observaciones || '',
    }));
    exportarAExcel(filas, 'Ingresos_Planta');
  };

  const exportarPdf = () => {
    const columnas = ['Fecha', 'Recibo', 'Proveedor', 'Unidades', 'Kilos', 'Precio/kg', 'Total'];
    const filas = historialFiltrado.map((row) => [
      fechaBonita(row.fecha),
      row.numero_recibo,
      row.proveedores?.nombre || 'Sin proveedor',
      `${row.unidades} u`,
      `${row.kilos} kg`,
      `Bs ${row.precio_por_kilo}`,
      `Bs ${row.total_monto}`,
    ]);
    exportarAPDF(columnas, filas, 'Ingresos de Planta', 'Ingresos_Planta');
  };

  const cambiarArchivoRecepcion = async (row) => {
    const archivada = !row.archivado;
    const accion = archivada ? 'archivar' : 'restaurar';

    try {
      setProcesandoArchivoId(row.id);
      await recepcionRepository.cambiarArchivoRecepcion({
        recepcionId: row.id,
        archivada,
      });
      setMensaje({
        tipo: 'exito',
        texto: `Recibo ${archivada ? 'archivado' : 'restaurado'}; el inventario no fue modificado.`,
      });
      setConfirmacionArchivo(null);
      await cargarDatos();
    } catch (err) {
      console.error(`No se pudo ${accion} el recibo:`, err);
      setConfirmacionArchivo(null);
      setMensaje({ tipo: 'error', texto: err.message || `No se pudo ${accion} el recibo.` });
    } finally {
      setProcesandoArchivoId(null);
    }
  };

  const card = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200';
  const input = darkMode
    ? 'bg-slate-950/60 border-slate-800 text-white placeholder-slate-500 focus:border-amber-500 focus:ring-amber-500/20'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:ring-amber-500/20';
  const label = darkMode ? 'text-slate-300' : 'text-gray-600';
  const tableHead = darkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-gray-50 text-gray-600 border-gray-200';
  const rowHover = darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50';
  const divider = darkMode ? 'border-slate-800' : 'border-gray-200';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const strong = darkMode ? 'text-white' : 'text-gray-900';
  const normal = darkMode ? 'text-slate-300' : 'text-gray-700';
  const rol = perfil?.roles?.nombre;
  const puedeArchivar = rol === 'operador_planta'
    || rol === 'superadmin'
    || rol === 'superadministrador';
  const totalesHistorial = historialFiltrado.reduce((totales, row) => ({
    unidades: totales.unidades + Number(row.unidades || 0),
    kilos: totales.kilos + Number(row.kilos || 0),
    monto: totales.monto + Number(row.total_monto || 0),
  }), { unidades: 0, kilos: 0, monto: 0 });

  return (
    <div className={`min-h-screen p-4 md:p-6 lg:p-8 transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-gray-100 text-gray-900'}`}>
      {/* Encabezado */}
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-center p-4 md:p-6 rounded-2xl shadow mb-6 md:mb-8 border gap-4 transition-colors duration-300 ${card}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-amber-500 font-semibold text-xs uppercase tracking-wider mb-1">
            <PackagePlus size={16} className="shrink-0" /> Módulo de Planta
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight break-words">Recepción de Pollo</h1>
          <p className={`text-xs sm:text-sm mt-1 ${muted}`}>Operador: <span className={`font-medium ${strong}`}>{perfil?.nombre_completo}</span></p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
          <button
            onClick={() => navigate('/panel')}
            aria-label="Volver al panel"
            className={`p-2.5 rounded-xl border transition ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'}`}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={toggleTheme}
            aria-label="Cambiar modo"
            className={`p-2.5 rounded-xl border transition flex items-center justify-center shrink-0 ${darkMode ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-gray-100 border-gray-300 text-amber-600 hover:bg-gray-200'}`}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={() => navigate('/planta/pedidos')}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-500 px-3 md:px-4 py-2.5 rounded-xl text-sm font-semibold transition md:shrink-0"
          >
            <ShoppingCart size={16} /> <span className="hidden sm:inline">Pedidos</span>
          </button>
          <button
            onClick={() => authRepository.logout()}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-red-950/50 hover:bg-red-900/60 border border-red-800/50 text-red-300 px-3 md:px-4 py-2.5 rounded-xl text-sm font-semibold transition md:shrink-0"
          >
            <LogOut size={16} /> <span className="hidden sm:inline">Cerrar Sesión</span><span className="sm:hidden">Salir</span>
          </button>
        </div>
      </div>

      {mensaje && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 shadow-lg text-sm ${mensaje.tipo === 'exito' ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200' : 'bg-red-950/50 border-red-500/50 text-red-200'}`}>
          {mensaje.tipo === 'exito' ? <CheckCircle size={20} className="text-emerald-400 shrink-0" /> : <AlertCircle size={20} className="text-red-400 shrink-0" />}
          <span>{mensaje.texto}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Formulario */}
        <div className={`p-5 md:p-6 rounded-2xl shadow border transition-colors duration-300 lg:col-span-1 ${card}`}>
          <h2 className={`text-lg font-bold mb-6 border-b pb-3 ${strong} ${divider}`}>Nuevo Ingreso</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Proveedor</label>
              <select
                required
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 transition ${input}`}
              >
                <option value="">Seleccione proveedor...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>N° de Recibo / Nota</label>
              <div className="relative">
                <FileText className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                <input
                  type="text"
                  required
                  value={numeroRecibo}
                  onChange={(e) => setNumeroRecibo(e.target.value)}
                  placeholder="Ej: REC-1024"
                  className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Unidades</label>
                <div className="relative">
                  <Hash className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                  <input
                    type="number"
                    required
                    min="1"
                    value={unidades}
                    onChange={(e) => setUnidades(e.target.value)}
                    placeholder="0"
                    className={`w-full pl-11 pr-2 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Kilos</label>
                <div className="relative">
                  <Scale className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0.1"
                    value={kilos}
                    onChange={(e) => setKilos(e.target.value)}
                    placeholder="0.00"
                    className={`w-full pl-11 pr-2 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${label}`}>Precio por Kilo (Bs)</label>
              <div className="relative">
                <DollarSign className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={precioPorKilo}
                  onChange={(e) => setPrecioPorKilo(e.target.value)}
                  placeholder="0.00"
                  className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                />
              </div>
            </div>

            {/* El total lo calcula la persona, pero la base tambien lo revisa */}
            {total !== null && (
              <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${darkMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                <span className={`text-xs font-bold uppercase tracking-wider ${label}`}>Total a pagar</span>
                <span className="text-xl font-black text-amber-500">{total} Bs</span>
              </div>
            )}

            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${label}`}>
                Quién trae el pollo *
              </label>
              <div className="relative">
                <User className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                <input
                  type="text"
                  required
                  value={entregadoPor}
                  onChange={(e) => setEntregadoPor(e.target.value)}
                  placeholder="Nombre del chofer o representante"
                  className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${label}`}>
                Quién recibe en planta *
              </label>
              <div className="relative">
                <User className={`absolute left-3.5 top-3.5 ${muted}`} size={18} />
                <input
                  type="text"
                  required
                  value={recibidoPor}
                  onChange={(e) => setRecibidoPor(e.target.value)}
                  placeholder="Tu nombre, o el del encargado que recibe"
                  className={`w-full pl-11 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
                />
              </div>
            </div>

            <div>
              <SelectorFoto
                etiqueta="Foto del lote"
                ayuda="Puedes tomarla con la camara o buscarla en la galeria"
                theme={{ borde: input, texto: label, tenue: muted, hoja: card }}
                onSeleccionar={setFoto}
                onError={(texto) => setMensaje({ tipo: 'error', texto })}
              />
            </div>

            <FirmaCanvas
              titulo="Firma de quien trae"
              theme={{ card: 'bg-white', borde: 'border-slate-300', texto: label, tenue: muted }}
              onCambio={(dataUrl) => setFirmaEntrega(dataUrl)}
            />

            <FirmaCanvas
              titulo="Firma de quien recibe"
              theme={{ card: 'bg-white', borde: 'border-slate-300', texto: label, tenue: muted }}
              onCambio={(dataUrl) => setFirmaRecepcion(dataUrl)}
            />
            <p className={`-mt-3 text-[11px] ${muted}`}>
              Arriba firma quien trae el pollo; aquí abajo, vos como responsable de la planta.
            </p>

            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${label}`}>
                Observaciones
              </label>
              <textarea
                rows={2}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej: todo en buen estado / llegó frío / iban 3 cajas menos"
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${input}`}
              />
            </div>

            <FotosObservaciones
              fotos={fotosExtra}
              onCambio={setFotosExtra}
              onError={(texto) => setMensaje({ tipo: 'error', texto })}
              theme={{ borde: input, texto: label, tenue: muted, hoja: card }}
            />

            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-amber-500/25 disabled:opacity-50 text-sm uppercase tracking-wide mt-2"
            >
              {cargando ? 'Guardando...' : 'Registrar Ingreso'}
            </button>
          </form>
        </div>

        {/* Historial */}
        <div className={`p-5 md:p-6 rounded-2xl shadow border transition-colors duration-300 lg:col-span-2 flex flex-col ${card}`}>
          <div className={`mb-4 border-b pb-4 ${divider}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={`text-lg font-bold ${strong}`}>
                {verArchivadas ? 'Ingresos archivados' : 'Historial de ingresos'}
              </h2>
              <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/10 text-amber-500 rounded-lg border border-amber-500/20">
                {historialFiltrado.length} registros
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className={`flex items-center gap-2 text-xs font-semibold ${label}`}>
                <CalendarDays size={15} />
                Desde
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className={`min-w-0 flex-1 border rounded-lg px-2 py-2 ${input}`}
                />
              </label>
              <label className={`flex items-center gap-2 text-xs font-semibold ${label}`}>
                <CalendarDays size={15} />
                Hasta
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className={`min-w-0 flex-1 border rounded-lg px-2 py-2 ${input}`}
                />
              </label>
              <label className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${input}`}>
                <Search size={15} className={muted} />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar recibo o proveedor"
                  aria-label="Buscar recibo, proveedor o persona"
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVerArchivadas((actual) => !actual)}
                  disabled={!archivoDisponible}
                  title={!archivoDisponible ? 'Ejecuta la migración SQL para habilitar el archivado' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:opacity-40 ${input}`}
                >
                  {verArchivadas ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  {verArchivadas ? 'Ver activos' : 'Ver archivados'}
                </button>
                <button
                  type="button"
                  onClick={exportarExcel}
                  disabled={!historialFiltrado.length}
                  title="Exportar resultados a Excel"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  <Download size={14} /> Excel
                </button>
                <button
                  type="button"
                  onClick={exportarPdf}
                  disabled={!historialFiltrado.length}
                  title="Exportar resultados a PDF"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-40"
                >
                  <FileText size={14} /> PDF
                </button>
              </div>
            </div>
            {!archivoDisponible && (
              <p role="status" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                El historial funciona, pero para habilitar archivo y restauración ejecuta
                {' '}supabase/RECEPCIONES_PLANTA_ARCHIVAR.sql en Supabase.
              </p>
            )}
            <p className={`mt-3 text-xs ${muted}`}>
              {totalesHistorial.unidades} unidades · {totalesHistorial.kilos.toFixed(2)} kg · Bs {totalesHistorial.monto.toFixed(2)}
              {' '}en los resultados filtrados. Archivar no modifica el inventario.
            </p>
          </div>
          {cargandoHistorial ? (
            <p className={`text-center py-12 ${muted}`}>Cargando ingresos...</p>
          ) : historialFiltrado.length === 0 ? (
            <p className={`text-center py-12 ${muted}`}>
              No hay ingresos {verArchivadas ? 'archivados' : 'activos'} para las fechas y búsqueda seleccionadas.
            </p>
          ) : (
            <div className={`overflow-x-auto rounded-xl border -mx-5 md:mx-0 ${divider}`}>
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className={`text-xs font-bold uppercase tracking-wider sticky top-0 border-b ${tableHead}`}>
                    <th className="p-3 md:p-3.5">Fecha</th>
                    <th className="p-3 md:p-3.5">Recibo</th>
                    <th className="p-3 md:p-3.5">Proveedor</th>
                    <th className="p-3 md:p-3.5">Unidades</th>
                    <th className="p-3 md:p-3.5">Kilos</th>
                    <th className="p-3 md:p-3.5">Total</th>
                    <th className="p-3 md:p-3.5">Evidencia</th>
                    <th className="p-3 md:p-3.5">Acciones</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-sm ${darkMode ? 'divide-slate-800' : 'divide-gray-200'} ${normal}`}>
                  {historialFiltrado.map((row) => (
                    <tr key={row.id} className={`transition ${rowHover}`}>
                      <td className="p-3 md:p-3.5">{fechaBonita(row.fecha)}</td>
                      <td className={`p-3 md:p-3.5 font-semibold ${strong}`}>{row.numero_recibo}</td>
                      <td className="p-3 md:p-3.5">{row.proveedores?.nombre || 'Sin proveedor'}</td>
                      <td className="p-3 md:p-3.5">{row.unidades} u</td>
                      <td className="p-3 md:p-3.5">{row.kilos} kg</td>
                      <td className="p-3 md:p-3.5 font-bold text-emerald-500">Bs {row.total_monto}</td>
                      <td className="p-3 md:p-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {row.foto_url && (
                            <button
                              onClick={() => verEvidencia('Foto del lote', row.foto_url)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${input}`}
                            >
                              <Eye size={11} /> Foto
                            </button>
                          )}
                          {row.firma_entrega_url && (
                            <button
                              onClick={() => verEvidencia('Firma de quien trae', row.firma_entrega_url)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${input}`}
                            >
                              <Eye size={11} /> Firma entrega
                            </button>
                          )}
                          {row.firma_recepcion_url && (
                            <button
                              onClick={() => verEvidencia('Firma de quien recibe', row.firma_recepcion_url)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${input}`}
                            >
                              <Eye size={11} /> Firma recibe
                            </button>
                          )}
                          {row.fotos_extra?.length > 0 && (
                            <button
                              onClick={() => verEvidencia(`Fotos de apoyo (${row.fotos_extra.length})`, row.fotos_extra[0])}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${input}`}
                            >
                              <Eye size={11} /> +{row.fotos_extra.length} fotos
                            </button>
                          )}
                        </div>
                        {row.entregado_por_nombre && (
                          <p className={`text-[10px] mt-1 ${muted}`}>
                            Trajo: {row.entregado_por_nombre}
                          </p>
                        )}
                      </td>
                      <td className="p-3 md:p-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => imprimirRecepcion(row)}
                            title="Imprimir recibo"
                            aria-label={`Imprimir recibo ${row.numero_recibo}`}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${input}`}
                          >
                            <Printer size={13} /> Imprimir
                          </button>
                          {puedeArchivar && archivoDisponible && (
                            <button
                              type="button"
                              onClick={() => setConfirmacionArchivo({
                                titulo: verArchivadas ? 'Restaurar ingreso' : 'Archivar ingreso',
                                mensaje: verArchivadas
                                  ? `¿Deseas restaurar el recibo ${row.numero_recibo}? Volverá a la lista de ingresos activos. El inventario no cambiará.`
                                  : `¿Deseas archivar el recibo ${row.numero_recibo}? Podrás consultarlo o restaurarlo después. El inventario no cambiará.`,
                                labelConfirmar: verArchivadas ? 'Restaurar recibo' : 'Archivar recibo',
                                variante: 'warning',
                                onConfirmar: () => cambiarArchivoRecepcion(row),
                              })}
                              disabled={procesandoArchivoId === row.id}
                              title={verArchivadas ? 'Restaurar recibo' : 'Archivar recibo'}
                              aria-label={`${verArchivadas ? 'Restaurar' : 'Archivar'} recibo ${row.numero_recibo}`}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold disabled:opacity-50 ${verArchivadas ? 'border-cyan-500/30 text-cyan-600' : 'border-slate-500/30 text-slate-500'}`}
                            >
                              {verArchivadas ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                              {procesandoArchivoId === row.id ? 'Guardando...' : verArchivadas ? 'Restaurar' : 'Archivar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Visor de evidencia del lote */}
      <ModalConfirmar
        config={confirmacionArchivo}
        onCerrar={() => setConfirmacionArchivo(null)}
        cargando={procesandoArchivoId !== null}
      />

      {viendo && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 bg-black/90"
          onClick={() => setViendo(null)}
        >
          <p className="text-white text-sm font-bold mb-3">{viendo.tipo}</p>
          <img
            src={viendo.url}
            alt={viendo.tipo}
            className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl bg-white"
          />
          <button className="mt-5 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-bold">
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
