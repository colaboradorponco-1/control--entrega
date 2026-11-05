BEGIN;

CREATE OR REPLACE FUNCTION public.aplicar_ingreso_stock_sucursal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido_recepcion_id BIGINT;
  v_despacho_id BIGINT;
  v_sucursal_id BIGINT;
  v_fecha DATE;
  v_unidades INTEGER;
  v_origen TEXT;
  v_movimiento_id BIGINT;
  v_actualizado_por UUID;
  v_inventario_id BIGINT;
  v_crudos_iniciales INTEGER := 0;
BEGIN
  IF TG_TABLE_NAME = 'pedido_recepciones' THEN
    v_pedido_recepcion_id := NEW.id;
    v_unidades := COALESCE(NEW.unidades_recibidas, 0);
    v_origen := 'PEDIDO';
    v_actualizado_por := NEW.recibido_por;

    SELECT p.sucursal_id
      INTO v_sucursal_id
      FROM public.pedidos p
     WHERE p.id = NEW.pedido_id;

    v_fecha := COALESCE(
      (NEW.recibido_en AT TIME ZONE 'America/La_Paz')::DATE,
      (now() AT TIME ZONE 'America/La_Paz')::DATE
    );
  ELSE
    IF TG_OP <> 'UPDATE'
       OR OLD.estado_recepcion IS DISTINCT FROM 'PENDIENTE'
       OR NEW.estado_recepcion IS DISTINCT FROM 'RECIBIDO'
       OR NEW.pedido_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    v_despacho_id := NEW.id;
    v_sucursal_id := NEW.sucursal_id;
    v_fecha := (COALESCE(NEW.fecha::TIMESTAMPTZ, now()) AT TIME ZONE 'America/La_Paz')::DATE;
    v_unidades := COALESCE(NEW.unidades, 0);
    v_origen := 'ENTREGA_DIRECTA';
    v_actualizado_por := auth.uid();
  END IF;

  IF v_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro la sucursal para aplicar el ingreso de stock.';
  END IF;
  IF v_unidades < 0 THEN
    RAISE EXCEPTION 'Las unidades recibidas no pueden ser negativas.';
  END IF;

  INSERT INTO public.movimientos_stock_sucursal (
    pedido_recepcion_id, despacho_id, sucursal_id, fecha, unidades, origen
  )
  VALUES (
    v_pedido_recepcion_id, v_despacho_id, v_sucursal_id, v_fecha, v_unidades, v_origen
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_movimiento_id;

  IF v_movimiento_id IS NULL OR v_unidades = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('stock-sucursal-' || v_sucursal_id || '-' || v_fecha, 0)
  );

  SELECT COALESCE(i.pollos_crudos, 0)
    INTO v_crudos_iniciales
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = v_sucursal_id
     AND i.fecha < v_fecha
   ORDER BY i.fecha DESC
   LIMIT 1;

  INSERT INTO public.inventario_sucursal (
    sucursal_id,
    fecha,
    pollos_crudos,
    pollos_rostizados,
    pollos_crudos_iniciales,
    pollos_rostizados_iniciales,
    pollos_recibidos,
    actualizado_por,
    actualizado_por_nombre,
    actualizado_en
  )
  VALUES (
    v_sucursal_id,
    v_fecha,
    v_crudos_iniciales,
    0,
    v_crudos_iniciales,
    0,
    0,
    v_actualizado_por,
    NULL,
    now()
  )
  ON CONFLICT (sucursal_id, fecha) DO NOTHING
  RETURNING id INTO v_inventario_id;

  SELECT i.id
    INTO v_inventario_id
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = v_sucursal_id
     AND i.fecha = v_fecha
   FOR UPDATE;

  UPDATE public.inventario_sucursal
     SET pollos_recibidos = COALESCE(pollos_recibidos, 0) + v_unidades,
         pollos_recibidos_en_conteo =
           CASE
             WHEN conteo_guardado_en IS NULL THEN COALESCE(pollos_recibidos_en_conteo, 0) + v_unidades
             ELSE pollos_recibidos_en_conteo
           END,
         pollos_crudos =
           CASE
             WHEN cerrado_en IS NOT NULL THEN COALESCE(pollos_crudos, 0) + v_unidades
             ELSE pollos_crudos
           END,
         actualizado_por = v_actualizado_por,
         actualizado_en = now()
   WHERE id = v_inventario_id;

  RETURN NEW;
END;
$$;

INSERT INTO public.movimientos_stock_sucursal (
  pedido_recepcion_id, despacho_id, sucursal_id, fecha, unidades, origen
)
SELECT
  pr.id,
  NULL,
  p.sucursal_id,
  (pr.recibido_en AT TIME ZONE 'America/La_Paz')::DATE,
  pr.unidades_recibidas,
  'PEDIDO'
FROM public.pedido_recepciones pr
JOIN public.pedidos p ON p.id = pr.pedido_id
WHERE pr.unidades_recibidas > 0
ON CONFLICT DO NOTHING;

WITH movimientos AS (
  SELECT sucursal_id, fecha, SUM(unidades)::INTEGER AS automatico
  FROM public.movimientos_stock_sucursal
  WHERE origen = 'PEDIDO'
  GROUP BY sucursal_id, fecha
),
manuales AS (
  SELECT sucursal_id, fecha, SUM(unidades)::INTEGER AS manual
  FROM public.inventario_sucursal_ingresos_manuales
  WHERE anulado_en IS NULL
  GROUP BY sucursal_id, fecha
)
UPDATE public.inventario_sucursal i
SET
  pollos_ingreso_manual = COALESCE(m.manual, 0),
  pollos_recibidos = COALESCE(a.automatico, 0) + COALESCE(m.manual, 0),
  pollos_recibidos_en_conteo =
    CASE
      WHEN i.conteo_guardado_en IS NULL
        THEN COALESCE(a.automatico, 0) + COALESCE(m.manual, 0)
      ELSE i.pollos_recibidos_en_conteo
    END
FROM movimientos a
FULL JOIN manuales m ON m.sucursal_id = a.sucursal_id AND m.fecha = a.fecha
WHERE i.sucursal_id = COALESCE(a.sucursal_id, m.sucursal_id)
  AND i.fecha = COALESCE(a.fecha, m.fecha);

NOTIFY pgrst, 'reload schema';

COMMIT;
