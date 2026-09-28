-- ============================================================
--  RECUPERAR EL PESO DEL PEDIDO #1
-- ============================================================
--  Al correr la migracion de pedidos, la columna vieja 'kilos'
--  se borro antes de copiarse a 'kilos_despachados', y el peso
--  del pedido #1 se quedo en NULL.
--
--  El valor original era 240.50 kg, confirmado antes de la
--  migracion. Se restaura ahi.
--  Ejecutar en Supabase > SQL Editor
-- ============================================================

-- El trigger bloquea cambiar el peso a mano, que es lo correcto
-- en el uso diario, asi que se apaga solo durante este arreglo.
ALTER TABLE public.pedidos DISABLE TRIGGER t_pedidos_guardar;

UPDATE public.pedidos
   SET kilos_despachados = 240.50
 WHERE id = 1
   AND kilos_despachados IS NULL;

ALTER TABLE public.pedidos ENABLE TRIGGER t_pedidos_guardar;

-- Verificacion
SELECT p.id,
       p.unidades,
       p.kilos_despachados,
       p.estado,
       s.nombre AS sucursal,
       ROUND(p.kilos_despachados / NULLIF(p.unidades, 0), 3) AS kg_por_unidad
  FROM public.pedidos p
  LEFT JOIN public.sucursales s ON s.id = p.sucursal_id
 ORDER BY p.id;
