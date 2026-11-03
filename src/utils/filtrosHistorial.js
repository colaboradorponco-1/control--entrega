export const POR_PAGINA = 25;

export function rangoUltimos30Dias() {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - 29);
  return {
    desde: fechaLocal(desde),
    hasta: fechaLocal(hoy),
  };
}

export function inicioDiaISO(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toISOString();
}

export function inicioDiaSiguienteISO(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia + 1).toISOString();
}

export function normalizarBusqueda(valor) {
  return String(valor || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ');
}

function fechaLocal(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}
