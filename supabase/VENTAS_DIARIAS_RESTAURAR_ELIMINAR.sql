BEGIN;

CREATE OR REPLACE FUNCTION public.restaurar_planilla_ventas_sucursal(
  p_sucursal_id INTEGER,
  p_fecha DATE DEFAULT NULL
)
RETURNS public.planilla_ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fecha DATE := COALESCE(p_fecha, (now() AT TIME ZONE 'America/La_Paz')::DATE);
  v_registro public.planilla_ventas%ROWTYPE;
BEGIN
  IF NOT (
    public.get_user_rol() IN ('administrador', 'superadmin', 'superadministrador')
    OR (public.get_user_rol() = 'sucursal' AND p_sucursal_id = public.get_user_sucursal())
  ) THEN
    RAISE EXCEPTION 'No puedes restaurar esta planilla.';
  END IF;

  UPDATE public.planilla_ventas
     SET archivada_en = NULL,
         archivada_por = NULL,
         actualizado_en = now()
   WHERE fecha = v_fecha
     AND sucursal_id = p_sucursal_id
     AND archivada_en IS NOT NULL
  RETURNING * INTO v_registro;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo puedes restaurar una planilla archivada.';
  END IF;

  RETURN v_registro;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_planilla_ventas_sucursal(
  p_sucursal_id INTEGER,
  p_fecha DATE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fecha DATE := COALESCE(p_fecha, (now() AT TIME ZONE 'America/La_Paz')::DATE);
BEGIN
  IF NOT (
    public.get_user_rol() IN ('administrador', 'superadmin', 'superadministrador')
    OR (public.get_user_rol() = 'sucursal' AND p_sucursal_id = public.get_user_sucursal())
  ) THEN
    RAISE EXCEPTION 'No puedes eliminar esta planilla.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.planilla_ventas
     WHERE fecha = v_fecha
       AND sucursal_id = p_sucursal_id
       AND archivada_en IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Primero debes archivar la planilla antes de eliminarla.';
  END IF;

  DELETE FROM public.planilla_ventas
   WHERE fecha = v_fecha
     AND sucursal_id = p_sucursal_id
     AND archivada_en IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurar_planilla_ventas_sucursal(INTEGER, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.eliminar_planilla_ventas_sucursal(INTEGER, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurar_planilla_ventas_sucursal(INTEGER, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_planilla_ventas_sucursal(INTEGER, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
