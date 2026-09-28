// Cuando falta una columna nueva en la base, PostgREST no siempre
// contesta "column does not exist": si el problema esta en un select
// anidado puede devolver un 400 generico. Con esta comprobacion los
// repositorios reintentan la consulta sin las columnas nuevas para que
// la pantalla no quede en blanco mientras se corre el SQL.
export function esColumnaFaltante(mensaje = '') {
  return (
    /column .* does not exist/i.test(mensaje) ||
    /PGRST/i.test(mensaje) ||
    /Failed to parse/i.test(mensaje) ||
    /schema cache/i.test(mensaje)
  );
}
