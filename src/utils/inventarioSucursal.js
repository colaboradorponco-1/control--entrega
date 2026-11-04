export const stockCrudoActualSucursal = (inventario) => {
  if (!inventario) return null;
  const registrado = Number(inventario.pollos_crudos) || 0;
  if (inventario.cerrado_en) return registrado;

  const recibidos = Number(inventario.pollos_recibidos) || 0;
  return (Number(inventario.pollos_crudos_iniciales) || 0) + recibidos;
};
