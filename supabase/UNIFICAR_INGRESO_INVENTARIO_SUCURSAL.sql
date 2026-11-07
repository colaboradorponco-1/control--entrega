BEGIN;

CREATE OR REPLACE FUNCTION public.guardar_conteo_inventario_crudo_sucursal(
  p_pollos_crudos INTEGER,
  p_ingreso_manual INTEGER,
  p_observaciones_producto TEXT,
  p_cerrar BOOLEAN,
  p_observaciones TEXT
)
RETURNS public.inventario_sucursal
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sucursal_id BIGINT;
  v_fecha DATE := (now() AT TIME ZONE 'America/La_Paz')::DATE;
  v_inventario public.inventario_sucursal;
  v_nombre TEXT;
  v_ingreso INTEGER := COALESCE(p_ingreso_manual, 0);
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo la sucursal puede guardar su inventario.';
  END IF;
  IF p_pollos_crudos IS NOT NULL AND p_pollos_crudos < 0 THEN
    RAISE EXCEPTION 'El conteo debe ser igual o mayor que cero.';
  END IF;
  IF COALESCE(p_cerrar, FALSE) AND p_pollos_crudos IS NULL THEN
    RAISE EXCEPTION 'Ingresa el conteo físico antes de cerrar.';
  END IF;
  IF p_ingreso_manual IS NULL OR p_ingreso_manual < 0 THEN
    RAISE EXCEPTION 'El ingreso manual debe ser igual o mayor que cero.';
  END IF;

  SELECT pu.sucursal_id, pu.nombre_completo
    INTO v_sucursal_id, v_nombre
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  SELECT i.* INTO v_inventario
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = v_sucursal_id
     AND i.fecha = v_fecha
   FOR UPDATE;

  IF NOT FOUND OR v_inventario.hora_corte IS NULL THEN
    RAISE EXCEPTION 'Inicia primero el inventario de hoy.';
  END IF;
  IF v_inventario.cerrado_en IS NOT NULL THEN
    RAISE EXCEPTION 'El inventario de hoy ya está cerrado.';
  END IF;

  IF COALESCE(p_cerrar, FALSE) THEN
    INSERT INTO public.inventario_sucursal_ajustes (
      inventario_sucursal_id, sucursal_id, fecha,
      ajuste_crudos, ajuste_rostizados, creado_por
    )
    VALUES (
      v_inventario.id, v_sucursal_id, v_fecha,
      p_pollos_crudos
        - (COALESCE(v_inventario.pollos_crudos_iniciales, 0) + v_ingreso),
      0, auth.uid()
    )
    ON CONFLICT (inventario_sucursal_id) DO UPDATE SET
      ajuste_crudos = EXCLUDED.ajuste_crudos,
      creado_por = EXCLUDED.creado_por,
      creado_en = now();
  END IF;

  UPDATE public.inventario_sucursal
     SET pollos_crudos = CASE
           WHEN COALESCE(p_cerrar, FALSE) THEN p_pollos_crudos
           ELSE pollos_crudos
         END,
         pollos_crudos_contados = COALESCE(p_pollos_crudos, pollos_crudos_contados),
         pollos_recibidos = v_ingreso,
         pollos_ingreso_manual = v_ingreso,
         pollos_recibidos_en_conteo =
           COALESCE(pollos_crudos_iniciales, 0) + v_ingreso,
         conteo_guardado_en = CASE
           WHEN p_pollos_crudos IS NOT NULL THEN now()
           ELSE conteo_guardado_en
         END,
         cerrado_en = CASE WHEN COALESCE(p_cerrar, FALSE) THEN now() ELSE NULL END,
         cerrado_por = CASE WHEN COALESCE(p_cerrar, FALSE) THEN auth.uid() ELSE NULL END,
         actualizado_por = auth.uid(),
         actualizado_por_nombre = v_nombre,
         actualizado_en = now(),
         observaciones = NULLIF(btrim(p_observaciones), ''),
         observaciones_producto = NULLIF(btrim(p_observaciones_producto), '')
   WHERE id = v_inventario.id
   RETURNING * INTO v_inventario;

  RETURN v_inventario;
END;
$$;

CREATE OR REPLACE FUNCTION public.aplicar_ingreso_stock_sucursal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_pedido_recepcion_id INT;
  v_despacho_id INT;
  v_sucursal_id INT;
  v_fecha DATE;
  v_unidades INT;
  v_origen TEXT;
  v_movimiento_id BIGINT;
  v_saldo_anterior INT := 0;
  v_filas INT;
  v_actualizado_por UUID;
BEGIN
  IF TG_TABLE_NAME = 'pedido_recepciones' THEN
    v_pedido_recepcion_id := NEW.id;
    v_unidades := NEW.unidades_recibidas;
    v_origen := 'PEDIDO';
    SELECT p.sucursal_id INTO v_sucursal_id
      FROM public.pedidos p
     WHERE p.id = NEW.pedido_id;
    v_fecha := COALESCE(
      (NEW.recibido_en AT TIME ZONE 'America/La_Paz')::DATE,
      (now() AT TIME ZONE 'America/La_Paz')::DATE
    );
    v_actualizado_por := NEW.recibido_por;
  ELSE
    RETURN NEW;
  END IF;

  IF v_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la sucursal para aplicar el ingreso de stock.';
  END IF;

  INSERT INTO public.movimientos_stock_sucursal (
    pedido_recepcion_id, despacho_id, sucursal_id, fecha, unidades, origen
  )
  VALUES (
    v_pedido_recepcion_id, v_despacho_id, v_sucursal_id, v_fecha, v_unidades, v_origen
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_movimiento_id;

  IF v_movimiento_id IS NULL OR COALESCE(v_unidades, 0) = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('stock-sucursal-' || v_sucursal_id || '-' || v_fecha, 0)
  );

  SELECT COALESCE(i.pollos_crudos, 0)
    INTO v_saldo_anterior
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = v_sucursal_id
     AND i.fecha < v_fecha
   ORDER BY i.fecha DESC
   LIMIT 1;

  INSERT INTO public.inventario_sucursal (
    sucursal_id, fecha, pollos_crudos, pollos_recibidos,
    pollos_ingreso_manual, pollos_crudos_iniciales,
    actualizado_por, actualizado_en
  )
  VALUES (
    v_sucursal_id, v_fecha, COALESCE(v_saldo_anterior, 0), v_unidades,
    v_unidades, COALESCE(v_saldo_anterior, 0),
    v_actualizado_por, now()
  )
  ON CONFLICT (sucursal_id, fecha) DO NOTHING;

  UPDATE public.inventario_sucursal
     SET pollos_crudos = pollos_crudos + v_unidades,
         pollos_recibidos = pollos_recibidos + v_unidades,
         pollos_ingreso_manual = pollos_ingreso_manual + v_unidades,
         pollos_recibidos_en_conteo =
           COALESCE(pollos_crudos_iniciales, 0)
           + pollos_recibidos + v_unidades,
         actualizado_por = v_actualizado_por,
         actualizado_en = now()
   WHERE sucursal_id = v_sucursal_id
     AND fecha = v_fecha;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guardar_conteo_inventario_crudo_sucursal(INTEGER, INTEGER, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_conteo_inventario_crudo_sucursal(INTEGER, INTEGER, TEXT, BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
