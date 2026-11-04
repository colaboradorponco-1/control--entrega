-- Inventario diario de pollo por sucursal.
-- Ejecutar despues de EMERGENCIA_INVENTARIO.sql y
-- PLANILLAS_AUTOMATICAS_MANUALES.sql, INVENTARIO_PREPARACION_PEDIDOS.sql
-- y DISPONIBILIDAD_PLANTA_DUENO.sql.

BEGIN;

ALTER TABLE public.inventario_sucursal
  ADD COLUMN IF NOT EXISTS pollos_crudos_iniciales INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pollos_rostizados_iniciales INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pollos_recibidos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pollos_ingreso_manual INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pollos_recibidos_en_conteo INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pollos_crudos_contados INTEGER,
  ADD COLUMN IF NOT EXISTS conteo_guardado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cerrado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cerrado_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS hora_corte TIME,
  ADD COLUMN IF NOT EXISTS observaciones TEXT,
  ADD COLUMN IF NOT EXISTS observaciones_producto TEXT,
  ADD COLUMN IF NOT EXISTS archivado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archivado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archivado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.inventario_sucursal
   SET pollos_crudos_iniciales = pollos_crudos,
       pollos_rostizados_iniciales = pollos_rostizados
 WHERE fecha = (now() AT TIME ZONE 'America/La_Paz')::DATE
   AND conteo_guardado_en IS NULL
   AND pollos_recibidos = 0;

UPDATE public.inventario_sucursal
   SET pollos_recibidos_en_conteo = pollos_recibidos
 WHERE conteo_guardado_en IS NOT NULL
   AND hora_corte IS NULL
   AND pollos_recibidos_en_conteo = 0;

UPDATE public.inventario_sucursal
   SET cerrado_en = COALESCE(actualizado_en, creado_en, now()),
       cerrado_por = actualizado_por
 WHERE fecha < (now() AT TIME ZONE 'America/La_Paz')::DATE
   AND cerrado_en IS NULL;

CREATE TABLE IF NOT EXISTS public.inventario_sucursal_ingresos (
  pedido_recepcion_id BIGINT PRIMARY KEY,
  sucursal_id BIGINT NOT NULL REFERENCES public.sucursales(id),
  fecha DATE NOT NULL,
  unidades INTEGER NOT NULL CHECK (unidades > 0),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventario_sucursal_ajustes (
  inventario_sucursal_id BIGINT PRIMARY KEY REFERENCES public.inventario_sucursal(id),
  sucursal_id BIGINT NOT NULL REFERENCES public.sucursales(id),
  fecha DATE NOT NULL,
  ajuste_crudos INTEGER NOT NULL,
  ajuste_rostizados INTEGER NOT NULL,
  creado_por UUID NOT NULL REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventario_sucursal_ingresos_manuales (
  id BIGSERIAL PRIMARY KEY,
  inventario_sucursal_id BIGINT NOT NULL REFERENCES public.inventario_sucursal(id),
  sucursal_id BIGINT NOT NULL REFERENCES public.sucursales(id),
  fecha DATE NOT NULL,
  unidades INTEGER NOT NULL CHECK (unidades > 0),
  observaciones TEXT,
  creado_por UUID NOT NULL REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulado_en TIMESTAMPTZ,
  anulado_por UUID REFERENCES auth.users(id)
);

ALTER TABLE public.inventario_sucursal_ingresos_manuales
  ALTER COLUMN observaciones DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS anulado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anulado_por UUID REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.archivar_inventario_sucursal(
  p_inventario_id BIGINT,
  p_archivado BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol TEXT := public.get_user_rol();
  v_sucursal_id BIGINT;
BEGIN
  IF p_archivado IS NULL THEN
    RAISE EXCEPTION 'Indica si se archiva o restaura el inventario.';
  END IF;
  IF COALESCE(v_rol, '') NOT IN ('administrador', 'superadministrador', 'dueno') THEN
    RAISE EXCEPTION 'No tienes permiso para archivar inventarios.'
      USING ERRCODE = '42501';
  END IF;

  SELECT i.sucursal_id
    INTO v_sucursal_id
    FROM public.inventario_sucursal i
   WHERE i.id = p_inventario_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el inventario diario.';
  END IF;

  IF v_rol = 'dueno' AND NOT EXISTS (
    SELECT 1
      FROM public.perfiles_usuario pu
      JOIN public.sucursal_duenos sd
        ON sd.dueno_id = pu.dueno_id
       AND sd.sucursal_id = v_sucursal_id
     WHERE pu.usuario_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Solo puedes archivar inventarios de tus sucursales.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventario_sucursal
     SET archivado = p_archivado,
         archivado_en = CASE WHEN p_archivado THEN now() ELSE NULL END,
         archivado_por = CASE WHEN p_archivado THEN auth.uid() ELSE NULL END
   WHERE id = p_inventario_id;
END;
$$;

UPDATE public.inventario_sucursal i
   SET pollos_ingreso_manual = COALESCE((
     SELECT SUM(m.unidades)::INTEGER
       FROM public.inventario_sucursal_ingresos_manuales m
      WHERE m.inventario_sucursal_id = i.id
        AND m.anulado_en IS NULL
   ), 0)
 WHERE pollos_ingreso_manual = 0;

ALTER TABLE public.inventario_sucursal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventario_sucursal_read ON public.inventario_sucursal;
CREATE POLICY inventario_sucursal_read ON public.inventario_sucursal
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.perfiles_usuario pu
        JOIN public.roles r ON r.id = pu.rol_id
       WHERE pu.usuario_id = auth.uid()
         AND (
           r.nombre IN ('administrador', 'superadministrador')
           OR (
             r.nombre IN ('sucursal', 'rosticero')
             AND pu.sucursal_id = inventario_sucursal.sucursal_id
           )
           OR (
             r.nombre = 'dueno'
             AND EXISTS (
               SELECT 1 FROM public.sucursal_duenos sd
                WHERE sd.sucursal_id = inventario_sucursal.sucursal_id
                  AND sd.dueno_id = pu.dueno_id
             )
           )
         )
    )
  );

DROP POLICY IF EXISTS inventario_sucursal_write ON public.inventario_sucursal;
REVOKE INSERT, UPDATE, DELETE ON public.inventario_sucursal FROM anon, authenticated;
GRANT SELECT ON public.inventario_sucursal TO authenticated;

ALTER TABLE public.inventario_sucursal_ingresos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventario_sucursal_ingresos FROM PUBLIC, anon, authenticated;
ALTER TABLE public.inventario_sucursal_ajustes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventario_sucursal_ajustes FROM PUBLIC, anon, authenticated;
ALTER TABLE public.inventario_sucursal_ingresos_manuales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventario_sucursal_ingresos_manuales FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.iniciar_planilla_inventario_sucursal(
  p_hora_corte TIME,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS public.inventario_sucursal
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sucursal_id BIGINT;
  v_fecha DATE := (now() AT TIME ZONE 'America/La_Paz')::DATE;
  v_crudos_iniciales INTEGER := 0;
  v_rostizados_iniciales INTEGER := 0;
  v_inventario public.inventario_sucursal;
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo el usuario de la sucursal puede iniciar su inventario.'
      USING ERRCODE = '42501';
  END IF;
  IF p_hora_corte IS NULL THEN
    RAISE EXCEPTION 'Indica la hora de corte del inventario.';
  END IF;

  SELECT pu.sucursal_id INTO v_sucursal_id
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();
  IF v_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no está vinculado a una sucursal.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.inventario_sucursal i
     WHERE i.sucursal_id = v_sucursal_id
       AND i.fecha < v_fecha
        AND i.hora_corte IS NOT NULL
        AND i.cerrado_en IS NULL
  ) THEN
    RAISE EXCEPTION 'Cierra el inventario anterior antes de iniciar uno nuevo.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('inventario-sucursal-' || v_sucursal_id, 0));

  SELECT CASE
           WHEN i.cerrado_en IS NOT NULL THEN i.pollos_crudos
           ELSE i.pollos_crudos_iniciales + i.pollos_recibidos
         END,
         i.pollos_rostizados
    INTO v_crudos_iniciales, v_rostizados_iniciales
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = v_sucursal_id
     AND i.fecha < v_fecha
   ORDER BY i.fecha DESC
   LIMIT 1;

  INSERT INTO public.inventario_sucursal (
    sucursal_id, fecha, pollos_crudos, pollos_rostizados,
    pollos_crudos_iniciales, pollos_rostizados_iniciales,
    pollos_recibidos, actualizado_por, actualizado_por_nombre, actualizado_en
  )
  VALUES (
    v_sucursal_id, v_fecha,
    COALESCE(v_crudos_iniciales, 0), COALESCE(v_rostizados_iniciales, 0),
    COALESCE(v_crudos_iniciales, 0), COALESCE(v_rostizados_iniciales, 0),
    0, auth.uid(),
    (SELECT pu.nombre_completo FROM public.perfiles_usuario pu WHERE pu.usuario_id = auth.uid()),
    now()
  )
  ON CONFLICT (sucursal_id, fecha) DO NOTHING;

  SELECT i.* INTO v_inventario
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = v_sucursal_id
     AND i.fecha = v_fecha
   FOR UPDATE;

  UPDATE public.inventario_sucursal
     SET hora_corte = COALESCE(hora_corte, p_hora_corte),
         observaciones = COALESCE(observaciones, NULLIF(btrim(p_observaciones), '')),
         actualizado_por = auth.uid(),
         actualizado_por_nombre = (
           SELECT pu.nombre_completo
             FROM public.perfiles_usuario pu
            WHERE pu.usuario_id = auth.uid()
         ),
         actualizado_en = now()
   WHERE id = v_inventario.id
   RETURNING * INTO v_inventario;

  RETURN v_inventario;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_ingreso_manual_inventario_sucursal(
  p_unidades INTEGER,
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
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo el usuario de la sucursal puede registrar ingresos.'
      USING ERRCODE = '42501';
  END IF;
  IF p_unidades IS NULL OR p_unidades <= 0 THEN
    RAISE EXCEPTION 'Las unidades deben ser un número entero mayor que cero.';
  END IF;
  SELECT pu.sucursal_id INTO v_sucursal_id
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
    RAISE EXCEPTION 'No puedes registrar ingresos en un inventario cerrado.';
  END IF;

  INSERT INTO public.inventario_sucursal_ingresos_manuales (
    inventario_sucursal_id, sucursal_id, fecha, unidades, observaciones, creado_por
  )
  VALUES (
    v_inventario.id, v_sucursal_id, v_fecha, p_unidades,
    NULLIF(btrim(p_observaciones), ''), auth.uid()
  );

  UPDATE public.inventario_sucursal
     SET pollos_recibidos = pollos_recibidos + p_unidades,
         pollos_ingreso_manual = pollos_ingreso_manual + p_unidades,
         actualizado_en = now()
   WHERE id = v_inventario.id
   RETURNING * INTO v_inventario;

  RETURN v_inventario;
END;
$$;

DROP FUNCTION IF EXISTS public.guardar_conteo_inventario_crudo_sucursal(INTEGER, BOOLEAN, TEXT);

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
    v_inventario.pollos_recibidos := v_inventario.pollos_recibidos + p_ingreso_manual;
  END IF;

  IF COALESCE(p_cerrar, FALSE) THEN
    INSERT INTO public.inventario_sucursal_ajustes (
      inventario_sucursal_id, sucursal_id, fecha,
      ajuste_crudos, ajuste_rostizados, creado_por
    )
    VALUES (
      v_inventario.id, v_sucursal_id, v_fecha,
      p_pollos_crudos - (v_inventario.pollos_crudos_iniciales + v_inventario.pollos_recibidos),
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

CREATE OR REPLACE FUNCTION public.eliminar_planilla_inventario_sucursal()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sucursal_id BIGINT;
  v_fecha DATE := (now() AT TIME ZONE 'America/La_Paz')::DATE;
  v_inventario public.inventario_sucursal;
  v_ingresos_automaticos INTEGER;
  v_nombre TEXT;
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo el usuario de la sucursal puede eliminar su planilla.'
      USING ERRCODE = '42501';
  END IF;

  SELECT pu.sucursal_id, pu.nombre_completo
    INTO v_sucursal_id, v_nombre
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();
  IF v_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no está vinculado a una sucursal.'
      USING ERRCODE = '42501';
  END IF;

  SELECT i.* INTO v_inventario
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = v_sucursal_id
     AND i.fecha = v_fecha
   FOR UPDATE;
  IF NOT FOUND OR v_inventario.hora_corte IS NULL THEN
    RAISE EXCEPTION 'No hay una planilla iniciada hoy para eliminar.';
  END IF;
  IF v_inventario.cerrado_en IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede eliminar una planilla cerrada.';
  END IF;

  UPDATE public.inventario_sucursal_ingresos_manuales
     SET anulado_en = now(),
         anulado_por = auth.uid()
   WHERE inventario_sucursal_id = v_inventario.id
     AND anulado_en IS NULL;

  v_ingresos_automaticos := GREATEST(
    COALESCE(v_inventario.pollos_recibidos, 0)
      - COALESCE(v_inventario.pollos_ingreso_manual, 0),
    0
  );

  UPDATE public.inventario_sucursal
     SET pollos_crudos = pollos_crudos_iniciales + v_ingresos_automaticos,
         pollos_recibidos = v_ingresos_automaticos,
         pollos_ingreso_manual = 0,
         pollos_recibidos_en_conteo = 0,
         pollos_crudos_contados = NULL,
         conteo_guardado_en = NULL,
         cerrado_en = NULL,
         cerrado_por = NULL,
         hora_corte = NULL,
         observaciones = NULL,
         observaciones_producto = NULL,
         actualizado_por = auth.uid(),
         actualizado_por_nombre = v_nombre,
         actualizado_en = now()
   WHERE id = v_inventario.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.iniciar_inventario_diario_sucursal()
RETURNS public.inventario_sucursal
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sucursal_id BIGINT;
  v_fecha DATE := (now() AT TIME ZONE 'America/La_Paz')::DATE;
  v_crudos_iniciales INTEGER := 0;
  v_rostizados_iniciales INTEGER := 0;
  v_inventario public.inventario_sucursal;
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo el usuario de la sucursal puede iniciar su inventario.'
      USING ERRCODE = '42501';
  END IF;

  SELECT pu.sucursal_id INTO v_sucursal_id
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();
  IF v_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no está vinculado a una sucursal.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('inventario-sucursal-' || v_sucursal_id, 0));

  SELECT CASE
           WHEN i.cerrado_en IS NOT NULL THEN i.pollos_crudos
           ELSE i.pollos_crudos_iniciales + i.pollos_recibidos
         END,
         i.pollos_rostizados
    INTO v_crudos_iniciales, v_rostizados_iniciales
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = v_sucursal_id
     AND i.fecha < v_fecha
   ORDER BY i.fecha DESC
   LIMIT 1;

  INSERT INTO public.inventario_sucursal (
    sucursal_id, fecha, pollos_crudos, pollos_rostizados,
    pollos_crudos_iniciales, pollos_rostizados_iniciales,
    pollos_recibidos, actualizado_por, actualizado_por_nombre, actualizado_en
  )
  VALUES (
    v_sucursal_id, v_fecha,
    COALESCE(v_crudos_iniciales, 0), COALESCE(v_rostizados_iniciales, 0),
    COALESCE(v_crudos_iniciales, 0), COALESCE(v_rostizados_iniciales, 0),
    0, auth.uid(),
    (SELECT pu.nombre_completo FROM public.perfiles_usuario pu WHERE pu.usuario_id = auth.uid()),
    now()
  )
  ON CONFLICT (sucursal_id, fecha) DO NOTHING;

  SELECT i.* INTO v_inventario
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = v_sucursal_id
     AND i.fecha = v_fecha;

  RETURN v_inventario;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_conteo_inventario_sucursal(
  p_pollos_crudos INTEGER,
  p_pollos_rostizados INTEGER,
  p_cerrar BOOLEAN DEFAULT FALSE
)
RETURNS public.inventario_sucursal
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inventario public.inventario_sucursal;
  v_nombre TEXT;
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo el usuario de la sucursal puede guardar su conteo.'
      USING ERRCODE = '42501';
  END IF;
  IF p_pollos_crudos IS NULL OR p_pollos_crudos < 0
     OR p_pollos_rostizados IS NULL OR p_pollos_rostizados < 0 THEN
    RAISE EXCEPTION 'El conteo debe ser un número entero igual o mayor que cero.';
  END IF;

  PERFORM public.iniciar_inventario_diario_sucursal();

  SELECT i.* INTO v_inventario
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = (
     SELECT pu.sucursal_id FROM public.perfiles_usuario pu WHERE pu.usuario_id = auth.uid()
   )
     AND i.fecha = (now() AT TIME ZONE 'America/La_Paz')::DATE
   FOR UPDATE;

  IF v_inventario.cerrado_en IS NOT NULL THEN
    RAISE EXCEPTION 'El inventario de hoy ya está cerrado.';
  END IF;

  IF COALESCE(p_cerrar, FALSE) THEN
    INSERT INTO public.inventario_sucursal_ajustes (
      inventario_sucursal_id, sucursal_id, fecha,
      ajuste_crudos, ajuste_rostizados, creado_por
    )
    VALUES (
      v_inventario.id, v_inventario.sucursal_id, v_inventario.fecha,
      p_pollos_crudos - (v_inventario.pollos_crudos_iniciales + v_inventario.pollos_recibidos),
      p_pollos_rostizados - v_inventario.pollos_rostizados_iniciales,
      auth.uid()
    )
    ON CONFLICT (inventario_sucursal_id) DO NOTHING;
  END IF;

  SELECT pu.nombre_completo INTO v_nombre
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  UPDATE public.inventario_sucursal
     SET pollos_crudos = p_pollos_crudos,
         pollos_rostizados = p_pollos_rostizados,
         conteo_guardado_en = now(),
         cerrado_en = CASE WHEN COALESCE(p_cerrar, FALSE) THEN now() ELSE NULL END,
         cerrado_por = CASE WHEN COALESCE(p_cerrar, FALSE) THEN auth.uid() ELSE NULL END,
         actualizado_por = auth.uid(),
         actualizado_por_nombre = v_nombre,
         actualizado_en = now()
   WHERE id = v_inventario.id
   RETURNING * INTO v_inventario;

  RETURN v_inventario;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_ingreso_inventario_sucursal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sucursal_id BIGINT;
  v_fecha DATE;
  v_crudos_iniciales INTEGER := 0;
  v_rostizados_iniciales INTEGER := 0;
  v_filas INTEGER;
BEGIN
  IF COALESCE(NEW.unidades_recibidas, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT p.sucursal_id INTO v_sucursal_id
    FROM public.pedidos p
   WHERE p.id = NEW.pedido_id;
  IF v_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la sucursal del pedido recibido.';
  END IF;

  v_fecha := COALESCE(
    (NEW.recibido_en AT TIME ZONE 'America/La_Paz')::DATE,
    (now() AT TIME ZONE 'America/La_Paz')::DATE
  );

  INSERT INTO public.inventario_sucursal_ingresos (
    pedido_recepcion_id, sucursal_id, fecha, unidades
  )
  VALUES (NEW.id, v_sucursal_id, v_fecha, NEW.unidades_recibidas)
  ON CONFLICT (pedido_recepcion_id) DO NOTHING;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas = 0 THEN
    RETURN NEW;
  END IF;

  SELECT CASE
           WHEN i.cerrado_en IS NOT NULL THEN i.pollos_crudos
           ELSE i.pollos_crudos_iniciales + i.pollos_recibidos
         END,
         i.pollos_rostizados
    INTO v_crudos_iniciales, v_rostizados_iniciales
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = v_sucursal_id
     AND i.fecha < v_fecha
   ORDER BY i.fecha DESC
   LIMIT 1;

  INSERT INTO public.inventario_sucursal (
    sucursal_id, fecha, pollos_crudos, pollos_rostizados,
    pollos_crudos_iniciales, pollos_rostizados_iniciales,
    pollos_recibidos
  )
  VALUES (
    v_sucursal_id, v_fecha,
    COALESCE(v_crudos_iniciales, 0), COALESCE(v_rostizados_iniciales, 0),
    COALESCE(v_crudos_iniciales, 0), COALESCE(v_rostizados_iniciales, 0),
    0
  )
  ON CONFLICT (sucursal_id, fecha) DO NOTHING;

  UPDATE public.inventario_sucursal
     SET pollos_recibidos = pollos_recibidos + NEW.unidades_recibidas,
         pollos_crudos = CASE
           WHEN cerrado_en IS NOT NULL THEN pollos_crudos + NEW.unidades_recibidas
           ELSE pollos_crudos
         END,
         actualizado_en = now()
   WHERE sucursal_id = v_sucursal_id
     AND fecha = v_fecha;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pedido_recepcion_actualizar_inventario_sucursal
  ON public.pedido_recepciones;
CREATE TRIGGER pedido_recepcion_actualizar_inventario_sucursal
  AFTER INSERT ON public.pedido_recepciones
  FOR EACH ROW EXECUTE FUNCTION public.registrar_ingreso_inventario_sucursal();

REVOKE ALL ON FUNCTION public.iniciar_inventario_diario_sucursal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_conteo_inventario_sucursal(INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.iniciar_planilla_inventario_sucursal(TIME, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.registrar_ingreso_manual_inventario_sucursal(INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guardar_conteo_inventario_crudo_sucursal(INTEGER, INTEGER, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.eliminar_planilla_inventario_sucursal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archivar_inventario_sucursal(BIGINT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_ingreso_inventario_sucursal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.actualizar_inventario_sucursal(BIGINT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.obtener_disponibilidad_pedidos_planta() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validar_stock_al_iniciar_pedido() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_planilla_inventario_sucursal(TIME, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_conteo_inventario_crudo_sucursal(INTEGER, INTEGER, TEXT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_planilla_inventario_sucursal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.archivar_inventario_sucursal(BIGINT, BOOLEAN) TO authenticated;

-- El despacho ya descuenta las unidades de planta via despacho_pollo.
-- RECOGIDO no se vuelve a reservar porque ese stock ya salió físicamente.
CREATE OR REPLACE FUNCTION public.obtener_disponibilidad_pedidos_planta()
RETURNS TABLE (
  unidades_stock INT,
  unidades_reservadas BIGINT,
  unidades_disponibles BIGINT,
  kilos_stock NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock public.control_inventario_diario;
BEGIN
  IF public.get_user_rol() NOT IN ('operador_planta', 'administrador', 'dueno') THEN
    RAISE EXCEPTION 'Solo planta, administración y dueño pueden consultar el inventario.';
  END IF;

  SELECT c.* INTO v_stock
    FROM public.control_inventario_diario c
   ORDER BY c.fecha DESC
   LIMIT 1;

  RETURN QUERY
  SELECT
    COALESCE(v_stock.unidades_saldo, 0),
    COALESCE((
      SELECT SUM(p.unidades)::BIGINT
        FROM public.pedidos p
       WHERE p.estado IN ('EN_PREPARACION', 'LISTO')
    ), 0),
    GREATEST(
      COALESCE(v_stock.unidades_saldo, 0)::BIGINT
      - COALESCE((
        SELECT SUM(p.unidades)::BIGINT
          FROM public.pedidos p
         WHERE p.estado IN ('EN_PREPARACION', 'LISTO')
      ), 0),
      0
    ),
    COALESCE(v_stock.kilos_saldo, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_stock_al_iniciar_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock_unidades BIGINT := 0;
  v_reservadas BIGINT := 0;
BEGIN
  IF OLD.estado <> 'APROBADO' OR NEW.estado <> 'EN_PREPARACION' THEN
    RETURN NEW;
  END IF;
  IF public.get_user_rol() IS DISTINCT FROM 'operador_planta' THEN
    RAISE EXCEPTION 'Solo el operador de planta puede iniciar la preparación.';
  END IF;

  PERFORM pg_advisory_xact_lock(730241906);

  SELECT COALESCE(c.unidades_saldo, 0) INTO v_stock_unidades
    FROM public.control_inventario_diario c
   ORDER BY c.fecha DESC
   LIMIT 1;

  SELECT COALESCE(SUM(p.unidades), 0) INTO v_reservadas
    FROM public.pedidos p
   WHERE p.estado IN ('EN_PREPARACION', 'LISTO')
     AND p.id <> OLD.id;

  IF NEW.unidades > v_stock_unidades - v_reservadas THEN
    RAISE EXCEPTION
      'Stock insuficiente para iniciar este pedido. Stock: %, reservado: %, disponible: %, pedido: % unidades',
      v_stock_unidades,
      v_reservadas,
      GREATEST(v_stock_unidades - v_reservadas, 0),
      NEW.unidades;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS z_validar_stock_preparacion ON public.pedidos;
CREATE TRIGGER z_validar_stock_preparacion
  BEFORE UPDATE OF estado ON public.pedidos
  FOR EACH ROW
  WHEN (OLD.estado = 'APROBADO' AND NEW.estado = 'EN_PREPARACION')
  EXECUTE FUNCTION public.validar_stock_al_iniciar_pedido();

GRANT EXECUTE ON FUNCTION public.obtener_disponibilidad_pedidos_planta() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'inventario_sucursal'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventario_sucursal;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
