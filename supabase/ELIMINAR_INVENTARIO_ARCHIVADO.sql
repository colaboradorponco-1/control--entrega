BEGIN;

DROP FUNCTION IF EXISTS public.eliminar_planilla_inventario_sucursal();

CREATE OR REPLACE FUNCTION public.eliminar_planilla_inventario_sucursal(
  p_inventario_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol TEXT := public.get_user_rol();
  v_sucursal_usuario BIGINT;
  v_inventario public.inventario_sucursal;
BEGIN
  IF p_inventario_id IS NULL THEN
    RAISE EXCEPTION 'Indica la planilla que deseas eliminar.';
  END IF;

  SELECT i.*
    INTO v_inventario
    FROM public.inventario_sucursal i
   WHERE i.id = p_inventario_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la planilla de inventario.';
  END IF;

  SELECT pu.sucursal_id
    INTO v_sucursal_usuario
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  IF v_rol NOT IN ('administrador', 'superadministrador', 'sucursal') THEN
    RAISE EXCEPTION 'No tienes permiso para eliminar planillas de inventario.'
      USING ERRCODE = '42501';
  END IF;

  IF v_rol = 'sucursal' AND v_sucursal_usuario IS DISTINCT FROM v_inventario.sucursal_id THEN
    RAISE EXCEPTION 'Solo puedes eliminar planillas de tu sucursal.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_inventario.archivado, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'Primero debes archivar la planilla antes de eliminarla.';
  END IF;

  DELETE FROM public.inventario_sucursal_ajustes
   WHERE inventario_sucursal_id = v_inventario.id;

  DELETE FROM public.inventario_sucursal_ingresos_manuales
   WHERE inventario_sucursal_id = v_inventario.id;

  DELETE FROM public.inventario_sucursal
   WHERE id = v_inventario.id;
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_planilla_inventario_sucursal(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_planilla_inventario_sucursal(BIGINT) TO authenticated;

COMMIT;
