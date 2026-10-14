SELECT p.id              AS pedido,
       p.fecha,
       s.nombre          AS sucursal,
       p.unidades,
       p.estado,
       p.kilos_despachados,
       (SELECT count(*) FROM public.pedido_recepciones pr
         WHERE pr.pedido_id = p.id)          AS received,
       (SELECT count(*) FROM public.despacho_pollo d
         WHERE d.pedido_id = p.id)           AS despachos
  FROM public.pedidos p
  LEFT JOIN public.sucursales s ON s.id = p.sucursal_id
 WHERE p.fecha < DATE '2026-10-01'
 ORDER BY p.fecha, p.id;

SELECT 'pedidos' AS tipo, count(*) AS TOTAL
  FROM public.pedidos WHERE fecha < DATE '2026-10-01'
UNION ALL
SELECT 'despacho_pollo', count(*) FROM public.despacho_pollo WHERE fecha < DATE '2026-10-01'
UNION ALL
SELECT 'recepcion_pollo', count(*) FROM public.recepcion_pollo WHERE fecha < DATE '2026-10-01'
UNION ALL
SELECT 'auditoria', count(*) FROM public.auditoria
 WHERE creado_en < TIMESTAMPTZ '2026-10-01 00:00:00';


SELECT count(*) AS despachos_sin_pedido
  FROM public.despacho_pollo d
  LEFT JOIN public.pedidos p ON p.id = d.pedido_id
 WHERE p.id IS NULL;

SELECT s.id, s.nombre, s.sector,
       (SELECT count(*) FROM public.pedidos p
         WHERE p.sucursal_id = s.id) AS pedidos,
       (SELECT count(*) FROM public.despacho_pollo d
         WHERE d.sucursal_id = s.id) AS despachos
  FROM public.sucursales s
 WHERE EXISTS (SELECT 1 FROM public.pedidos p WHERE p.sucursal_id = s.id)
    OR EXISTS (SELECT 1 FROM public.despacho_pollo d WHERE d.sucursal_id = s.id)
 ORDER BY s.sector, s.nombre;

NOTIFY pgrst, 'reload schema';
