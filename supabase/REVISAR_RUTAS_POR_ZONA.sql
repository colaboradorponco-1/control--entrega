-- Diagnostico de rutas que pudieron crearse por error desde sucursales.sector.
-- Este archivo solo consulta datos: no modifica ni elimina registros.
--
-- Revisar especialmente las rutas sin repartidor cuyas paradas pertenecen
-- todas a una zona con el mismo nombre. No borrar una ruta sin confirmar
-- que no fue creada manualmente como ruta real.

SELECT
  r.id AS ruta_id,
  r.nombre AS nombre_ruta,
  r.activo,
  r.repartidor_id,
  COUNT(rs.sucursal_id) AS total_paradas,
  COUNT(rs.sucursal_id) FILTER (
    WHERE lower(btrim(s.sector)) = lower(btrim(r.nombre))
  ) AS paradas_en_zona_del_mismo_nombre,
  ARRAY_AGG(s.nombre ORDER BY rs.orden)
    FILTER (WHERE s.id IS NOT NULL) AS sucursales_asignadas,
  ARRAY_AGG(DISTINCT s.sector)
    FILTER (WHERE s.sector IS NOT NULL) AS zonas_de_las_paradas
FROM public.rutas r
JOIN public.ruta_sucursales rs ON rs.ruta_id = r.id
JOIN public.sucursales s ON s.id = rs.sucursal_id
WHERE EXISTS (
  SELECT 1
  FROM public.sucursales zona
  WHERE NULLIF(btrim(zona.sector), '') IS NOT NULL
    AND lower(btrim(zona.sector)) = lower(btrim(r.nombre))
)
GROUP BY r.id, r.nombre, r.activo, r.repartidor_id
ORDER BY lower(r.nombre), r.id;
