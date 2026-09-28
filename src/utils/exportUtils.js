import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Exportar datos a Excel
export const exportarAExcel = (datos, nombreArchivo) => {
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');
  XLSX.writeFile(libro, `${nombreArchivo}.xlsx`);
};

// Exportar datos a PDF
export const exportarAPDF = (columnas, filas, titulo, nombreArchivo) => {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(titulo, 14, 15);
  
  doc.autoTable({
    startY: 20,
    head: [columnas],
    body: filas,
  });

  doc.save(`${nombreArchivo}.pdf`);
};