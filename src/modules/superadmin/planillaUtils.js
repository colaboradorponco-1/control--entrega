export const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function inicioSemana(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const desplazo = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - desplazo);
  return d;
}

export function sumarDias(fecha, dias) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

export function aISO(fecha) {
  const d = new Date(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function diasDeSemana(inicio) {
  return Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));
}

export function formatoBs(valor) {
  return Number(valor || 0).toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatoNumero(valor, decimales = 2) {
  return Number(valor || 0).toLocaleString('es-BO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

export function rangoSemana(inicio) {
  const fin = sumarDias(inicio, 6);
  const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return `${inicio.toLocaleDateString('es-BO', opciones)} - ${fin.toLocaleDateString('es-BO', opciones)}`;
}
