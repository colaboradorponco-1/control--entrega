BEGIN;

ALTER TABLE public.planilla_ventas
  ADD COLUMN IF NOT EXISTS iniciada_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cerrada_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS iniciada_por INTEGER REFERENCES public.perfiles_usuario(id),
  ADD COLUMN IF NOT EXISTS cerrada_por INTEGER REFERENCES public.perfiles_usuario(id);

CREATE OR REPLACE FUNCTION public.iniciar_planilla_ventas_sucursal(
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
  v_perfil public.perfiles_usuario%ROWTYPE;
  v_rol TEXT := public.get_user_rol();
  v_registro public.planilla_ventas%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT pu.* INTO v_perfil
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  IF v_perfil.id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;
  IF v_fecha <> (now() AT TIME ZONE 'America/La_Paz')::DATE THEN
    RAISE EXCEPTION 'Solo puedes iniciar la planilla del día actual';
  END IF;
  IF NOT (
    v_rol IN ('administrador', 'superadmin')
    OR (v_rol = 'sucursal' AND p_sucursal_id = public.get_user_sucursal())
  ) THEN
    RAISE EXCEPTION 'No puedes iniciar ventas para esta sucursal';
  END IF;

  INSERT INTO public.planilla_ventas (
    fecha, sucursal_id, unidades, transacciones, importe_bs,
    creado_por, iniciada_en, iniciada_por
  )
  VALUES (
    v_fecha, p_sucursal_id, 0, 0, 0,
    v_perfil.id, now(), v_perfil.id
  )
  ON CONFLICT (fecha, sucursal_id)
  DO UPDATE SET
    iniciada_en = COALESCE(public.planilla_ventas.iniciada_en, now()),
    iniciada_por = COALESCE(public.planilla_ventas.iniciada_por, EXCLUDED.iniciada_por),
    actualizado_en = now(),
    creado_por = EXCLUDED.creado_por
  RETURNING * INTO v_registro;

  IF v_registro.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'La planilla de ventas de hoy ya está cerrada';
  END IF;

  RETURN v_registro;
END;
$$;

CREATE OR REPLACE FUNCTION public.cerrar_planilla_ventas_sucursal(
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
  v_perfil public.perfiles_usuario%ROWTYPE;
  v_rol TEXT := public.get_user_rol();
  v_registro public.planilla_ventas%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT pu.* INTO v_perfil
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  IF NOT (
    v_rol IN ('administrador', 'superadmin')
    OR (v_rol = 'sucursal' AND p_sucursal_id = public.get_user_sucursal())
  ) THEN
    RAISE EXCEPTION 'No puedes cerrar ventas para esta sucursal';
  END IF;

  SELECT * INTO v_registro
    FROM public.planilla_ventas
   WHERE fecha = v_fecha
     AND sucursal_id = p_sucursal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La planilla de ventas no existe';
  END IF;
  IF v_registro.iniciada_en IS NULL THEN
    RAISE EXCEPTION 'Primero inicia la planilla de ventas del día';
  END IF;
  IF v_registro.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'La planilla de ventas ya está cerrada';
  END IF;

  UPDATE public.planilla_ventas
     SET cerrada_en = now(),
         cerrada_por = v_perfil.id,
         actualizado_en = now(),
         creado_por = v_perfil.id
   WHERE fecha = v_fecha
     AND sucursal_id = p_sucursal_id
  RETURNING * INTO v_registro;

  RETURN v_registro;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_venta_sucursal(
  p_sucursal_id INTEGER,
  p_fecha DATE,
  p_unidades INTEGER,
  p_transacciones INTEGER,
  p_importe_bs NUMERIC
)
RETURNS public.planilla_ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_perfil public.perfiles_usuario%ROWTYPE;
  v_registro public.planilla_ventas%ROWTYPE;
  v_rol TEXT := public.get_user_rol();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  SELECT pu.* INTO v_perfil
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  IF v_perfil.id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;
  IF p_sucursal_id IS NULL OR p_sucursal_id < 1 THEN
    RAISE EXCEPTION 'Sucursal inválida';
  END IF;
  IF p_fecha IS NULL OR p_fecha > (now() AT TIME ZONE 'America/La_Paz')::DATE THEN
    RAISE EXCEPTION 'Fecha inválida';
  END IF;
  IF p_unidades IS NULL OR p_unidades < 0
     OR p_transacciones IS NULL OR p_transacciones < 0
     OR p_importe_bs IS NULL OR p_importe_bs < 0 THEN
    RAISE EXCEPTION 'Los valores deben ser iguales o mayores a cero';
  END IF;
  IF NOT (
    v_rol IN ('administrador', 'superadmin')
    OR (v_rol = 'sucursal' AND p_sucursal_id = public.get_user_sucursal())
  ) THEN
    RAISE EXCEPTION 'No puedes registrar ventas para esta sucursal';
  END IF;

  SELECT * INTO v_registro
    FROM public.planilla_ventas
   WHERE fecha = p_fecha AND sucursal_id = p_sucursal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Primero inicia la planilla de ventas del día';
  END IF;
  IF FOUND AND v_registro.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'La planilla de ventas está cerrada; no puedes modificarla';
  END IF;
  IF FOUND AND v_registro.iniciada_en IS NULL THEN
    RAISE EXCEPTION 'Primero inicia la planilla de ventas del día';
  END IF;

  INSERT INTO public.planilla_ventas (
    fecha, sucursal_id, unidades, transacciones, importe_bs,
    creado_por, iniciada_en, iniciada_por
  )
  VALUES (
    p_fecha, p_sucursal_id, p_unidades, p_transacciones, p_importe_bs,
    v_perfil.id, now(), v_perfil.id
  )
  ON CONFLICT (fecha, sucursal_id)
  DO UPDATE SET
    unidades = EXCLUDED.unidades,
    transacciones = EXCLUDED.transacciones,
    importe_bs = EXCLUDED.importe_bs,
    creado_por = EXCLUDED.creado_por,
    actualizado_en = now()
  RETURNING * INTO v_registro;

  RETURN v_registro;
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_planilla_ventas_sucursal(INTEGER, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cerrar_planilla_ventas_sucursal(INTEGER, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_venta_sucursal(INTEGER, DATE, INTEGER, INTEGER, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_planilla_ventas_sucursal(INTEGER, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_planilla_ventas_sucursal(INTEGER, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venta_sucursal(INTEGER, DATE, INTEGER, INTEGER, NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
