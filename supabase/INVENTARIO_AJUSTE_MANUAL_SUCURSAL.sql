BEGIN;

ALTER TABLE public.inventario_sucursal_ingresos_manuales
  ADD COLUMN IF NOT EXISTS ajuste_crudos INTEGER;

ALTER TABLE public.inventario_sucursal_ingresos_manuales
  DROP CONSTRAINT IF EXISTS inventario_sucursal_ingresos_manuales_unidades_check;

ALTER TABLE public.inventario_sucursal_ingresos_manuales
  ADD CONSTRAINT inventario_sucursal_ingresos_manuales_unidades_check
  CHECK (unidades >= 0);

UPDATE public.inventario_sucursal_ingresos_manuales
   SET ajuste_crudos = unidades
 WHERE ajuste_crudos IS NULL
   AND anulado_en IS NULL;

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
  v_manual_anterior INTEGER := 0;
  v_manual_nuevo INTEGER := COALESCE(p_ingreso_manual, 0);
  v_diferencia INTEGER;
  v_recibido_sistema INTEGER := 0;
  v_disponible INTEGER;
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo el usuario de la sucursal puede guardar su conteo.'
      USING ERRCODE = '42501';
  END IF;
  IF p_pollos_crudos IS NOT NULL AND p_pollos_crudos < 0 THEN
    RAISE EXCEPTION 'El conteo debe ser un número entero igual o mayor que cero.';
  END IF;
  IF COALESCE(p_cerrar, FALSE) AND p_pollos_crudos IS NULL THEN
    RAISE EXCEPTION 'Para cerrar el inventario debes ingresar un conteo entero igual o mayor que cero.';
  END IF;
  IF p_ingreso_manual IS NULL THEN
    RAISE EXCEPTION 'El ingreso manual debe ser un número entero.';
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inicia primero el inventario de hoy.';
  END IF;
  IF v_inventario.hora_corte IS NULL THEN
    RAISE EXCEPTION 'Inicia primero el inventario de hoy.';
  END IF;
  IF v_inventario.cerrado_en IS NOT NULL THEN
    RAISE EXCEPTION 'El inventario de hoy ya está cerrado.';
  END IF;

  SELECT COALESCE(SUM(m.unidades), 0)::INTEGER
    INTO v_recibido_sistema
    FROM public.movimientos_stock_sucursal m
   WHERE m.sucursal_id = v_sucursal_id
     AND m.fecha = v_fecha;

  v_manual_anterior := COALESCE(v_inventario.pollos_ingreso_manual, 0);
  v_diferencia := v_manual_nuevo - v_manual_anterior;

  IF v_diferencia <> 0 THEN
    INSERT INTO public.inventario_sucursal_ingresos_manuales (
      inventario_sucursal_id,
      sucursal_id,
      fecha,
      unidades,
      ajuste_crudos,
      observaciones,
      creado_por
    )
    VALUES (
      v_inventario.id,
      v_sucursal_id,
      v_fecha,
      ABS(v_diferencia),
      v_diferencia,
      NULLIF(btrim(p_observaciones_producto), ''),
      auth.uid()
    );
  END IF;

  v_disponible := COALESCE(v_inventario.pollos_crudos_iniciales, 0)
    + v_recibido_sistema
    + v_manual_nuevo;

  IF COALESCE(p_cerrar, FALSE) THEN
    INSERT INTO public.inventario_sucursal_ajustes (
      inventario_sucursal_id,
      sucursal_id,
      fecha,
      ajuste_crudos,
      ajuste_rostizados,
      creado_por
    )
    VALUES (
      v_inventario.id,
      v_sucursal_id,
      v_fecha,
      p_pollos_crudos - v_disponible,
      0,
      auth.uid()
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
         pollos_recibidos = v_recibido_sistema,
         pollos_ingreso_manual = v_manual_nuevo,
         pollos_recibidos_en_conteo = v_disponible,
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

REVOKE ALL ON FUNCTION public.guardar_conteo_inventario_crudo_sucursal(INTEGER, INTEGER, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_conteo_inventario_crudo_sucursal(INTEGER, INTEGER, TEXT, BOOLEAN, TEXT) TO authenticated;

UPDATE public.inventario_sucursal i
   SET pollos_recibidos = COALESCE((
         SELECT SUM(m.unidades)::INTEGER
           FROM public.movimientos_stock_sucursal m
          WHERE m.sucursal_id = i.sucursal_id
            AND m.fecha = i.fecha
       ), 0),
       pollos_recibidos_en_conteo =
         COALESCE(i.pollos_crudos_iniciales, 0)
         + COALESCE((
             SELECT SUM(m.unidades)::INTEGER
               FROM public.movimientos_stock_sucursal m
              WHERE m.sucursal_id = i.sucursal_id
                AND m.fecha = i.fecha
           ), 0)
         + COALESCE(i.pollos_ingreso_manual, 0),
       actualizado_en = now();

NOTIFY pgrst, 'reload schema';

COMMIT;
