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
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo el usuario de la sucursal puede guardar su conteo.'
      USING ERRCODE = '42501';
  END IF;
  IF p_pollos_crudos < 0 OR (COALESCE(p_cerrar, FALSE) AND p_pollos_crudos IS NULL) THEN
    RAISE EXCEPTION 'Para cerrar el inventario debes ingresar un conteo entero igual o mayor que cero.';
  END IF;
  IF p_ingreso_manual IS NULL OR p_ingreso_manual < 0 THEN
    RAISE EXCEPTION 'El ingreso manual debe ser un número entero igual o mayor que cero.';
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

  IF p_ingreso_manual > 0 THEN
    INSERT INTO public.inventario_sucursal_ingresos_manuales (
      inventario_sucursal_id, sucursal_id, fecha, unidades, observaciones, creado_por
    )
    VALUES (
      v_inventario.id, v_sucursal_id, v_fecha,
      p_ingreso_manual, NULLIF(btrim(p_observaciones_producto), ''), auth.uid()
    );
  END IF;

  IF COALESCE(p_cerrar, FALSE) THEN
    INSERT INTO public.inventario_sucursal_ajustes (
      inventario_sucursal_id, sucursal_id, fecha,
      ajuste_crudos, ajuste_rostizados, creado_por
    )
    VALUES (
      v_inventario.id, v_sucursal_id, v_fecha,
      p_pollos_crudos - (v_inventario.pollos_crudos_iniciales + v_inventario.pollos_recibidos + p_ingreso_manual),
      0, auth.uid()
    )
    ON CONFLICT (inventario_sucursal_id) DO NOTHING;
  END IF;

  UPDATE public.inventario_sucursal
     SET pollos_crudos = CASE
           WHEN COALESCE(p_cerrar, FALSE) THEN p_pollos_crudos
           ELSE pollos_crudos
         END,
         pollos_crudos_contados = COALESCE(p_pollos_crudos, pollos_crudos_contados),
         pollos_recibidos = pollos_recibidos + p_ingreso_manual,
         pollos_ingreso_manual = pollos_ingreso_manual + p_ingreso_manual,
         pollos_recibidos_en_conteo = pollos_recibidos + p_ingreso_manual,
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

NOTIFY pgrst, 'reload schema';
COMMIT;
