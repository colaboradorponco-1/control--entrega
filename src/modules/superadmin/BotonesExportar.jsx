import { Download, FileText } from 'lucide-react';

export default function BotonesExportar({ onExcel, onPDF, oscuro = false }) {
  const base = oscuro
    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
    : 'border-gray-300 text-gray-600 hover:bg-gray-100';
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onExcel} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${base}`}>
        <Download size={14} /> Excel
      </button>
      <button type="button" onClick={onPDF} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${base}`}>
        <FileText size={14} /> PDF
      </button>
    </div>
  );
}
