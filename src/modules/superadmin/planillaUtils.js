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

export function construirReporteCompras(compras, proveedores, dias) {
  const movimientos = new Map();

  for (const compra of compras) {
    const proveedorId = compra.proveedor_id ?? 'sin-proveedor';
    const fechas = movimientos.get(proveedorId) || new Map();
    const movimiento = fechas.get(compra.fecha) || {
      kilos: 0,
      unidades: 0,
      total: 0,
      recibos: [],
    };
    movimiento.kilos += Number(compra.kilos || 0);
    movimiento.unidades += Number(compra.unidades || 0);
    movimiento.total += Number(compra.total_monto || 0);
    if (compra.numero_recibo) movimiento.recibos.push(compra.numero_recibo);
    fechas.set(compra.fecha, movimiento);
    movimientos.set(proveedorId, fechas);
  }

  const listaProveedores = [
    ...proveedores,
    ...(movimientos.has('sin-proveedor')
      ? [{ id: 'sin-proveedor', nombre: 'Sin proveedor asignado' }]
      : []),
  ];

  const resumir = (movimiento) => ({
    kilos: movimiento.kilos,
    precio: movimiento.kilos ? movimiento.total / movimiento.kilos : 0,
    unidades: movimiento.unidades,
    total: movimiento.total,
    promedio: movimiento.unidades ? movimiento.kilos / movimiento.unidades : 0,
    recibos: movimiento.recibos,
  });

  const filas = listaProveedores.map((proveedor) => {
    const porFecha = movimientos.get(proveedor.id) || new Map();
    const valoresPorDia = dias.map((dia) => {
      const fecha = aISO(dia);
      return {
        fecha,
        ...resumir(porFecha.get(fecha) || { kilos: 0, unidades: 0, total: 0, recibos: [] }),
      };
    });
    const totalProveedor = valoresPorDia.reduce(
      (total, dia) => ({
        kilos: total.kilos + dia.kilos,
        unidades: total.unidades + dia.unidades,
        total: total.total + dia.total,
      }),
      { kilos: 0, unidades: 0, total: 0 },
    );

    return {
      id: proveedor.id,
      nombre: proveedor.nombre,
      dias: valoresPorDia,
      total: resumir({ ...totalProveedor, recibos: [] }),
    };
  });

  const totalSemana = filas.reduce(
    (total, proveedor) => ({
      kilos: total.kilos + proveedor.total.kilos,
      unidades: total.unidades + proveedor.total.unidades,
      total: total.total + proveedor.total.total,
    }),
    { kilos: 0, unidades: 0, total: 0 },
  );
  const totalesPorDia = dias.map((dia, indice) => {
    const total = filas.reduce(
      (suma, proveedor) => ({
        kilos: suma.kilos + proveedor.dias[indice].kilos,
        unidades: suma.unidades + proveedor.dias[indice].unidades,
        total: suma.total + proveedor.dias[indice].total,
      }),
      { kilos: 0, unidades: 0, total: 0 },
    );
    return { fecha: aISO(dia), ...resumir({ ...total, recibos: [] }) };
  });

  return {
    filas,
    totalesPorDia,
    totalSemana: resumir({ ...totalSemana, recibos: [] }),
  };
}
