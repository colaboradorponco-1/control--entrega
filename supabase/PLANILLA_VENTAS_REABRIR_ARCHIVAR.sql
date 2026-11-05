BEGIN;

ALTER TABLE public.planilla_ventas
  ADD COLUMN IF NOT EXISTS archivada_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archivada_por INTEGER REFERENCES public.perfiles_usuario(id);

CREATE OR REPLACE FUNCTION public.reabrir_planilla_ventas_sucursal(
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
  v_registro public.planilla_ventas%ROWTYPE;
BEGIN
  SELECT pu.* INTO v_perfil
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  IF v_perfil.id IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;
  IF NOT (
    public.get_user_rol() IN ('administrador', 'superadmin')
    OR (public.get_user_rol() = 'sucursal' AND p_sucursal_id = public.get_user_sucursal())
  ) THEN
    RAISE EXCEPTION 'No puedes abrir esta planilla';
  END IF;

  UPDATE public.planilla_ventas
     SET cerrada_en = NULL,
         cerrada_por = NULL,
         archivada_en = NULL,
         archivada_por = NULL,
         actualizado_en = now(),
         creado_por = v_perfil.id
   WHERE fecha = v_fecha
     AND sucursal_id = p_sucursal_id
     AND iniciada_en IS NOT NULL
     AND cerrada_en IS NOT NULL
  RETURNING * INTO v_registro;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La planilla cerrada no existe';
  END IF;

  RETURN v_registro;
END;
$$;

CREATE OR REPLACE FUNCTION public.archivar_planilla_ventas_sucursal(
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
  v_registro public.planilla_ventas%ROWTYPE;
BEGIN
  SELECT pu.* INTO v_perfil
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  IF v_perfil.id IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;
  IF NOT (
    public.get_user_rol() IN ('administrador', 'superadmin')
    OR (public.get_user_rol() = 'sucursal' AND p_sucursal_id = public.get_user_sucursal())
  ) THEN
    RAISE EXCEPTION 'No puedes archivar esta planilla';
  END IF;

  UPDATE public.planilla_ventas
     SET archivada_en = COALESCE(archivada_en, now()),
         archivada_por = COALESCE(archivada_por, v_perfil.id),
         actualizado_en = now()
   WHERE fecha = v_fecha
     AND sucursal_id = p_sucursal_id
     AND iniciada_en IS NOT NULL
     AND cerrada_en IS NOT NULL
  RETURNING * INTO v_registro;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo puedes archivar una planilla ya cerrada';
  END IF;

  RETURN v_registro;
END;
$$;

REVOKE ALL ON FUNCTION public.reabrir_planilla_ventas_sucursal(INTEGER, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archivar_planilla_ventas_sucursal(INTEGER, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_planilla_ventas_sucursal(INTEGER, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archivar_planilla_ventas_sucursal(INTEGER, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
