BEGIN;

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
  v_sucursal_usuario BIGINT;
BEGIN
  IF p_archivado IS NULL THEN
    RAISE EXCEPTION 'Indica si se archiva o restaura el inventario.';
  END IF;

  SELECT i.sucursal_id
    INTO v_sucursal_id
    FROM public.inventario_sucursal i
   WHERE i.id = p_inventario_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontro el inventario diario.';
  END IF;

  SELECT pu.sucursal_id
    INTO v_sucursal_usuario
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  IF v_rol NOT IN ('administrador', 'superadministrador', 'sucursal') THEN
    RAISE EXCEPTION 'No tienes permiso para archivar inventarios.';
  END IF;

  IF v_rol = 'sucursal' AND v_sucursal_usuario IS DISTINCT FROM v_sucursal_id THEN
    RAISE EXCEPTION 'Solo puedes archivar inventarios de tu sucursal.';
  END IF;

  UPDATE public.inventario_sucursal
     SET archivado = p_archivado,
         archivado_en = CASE WHEN p_archivado THEN now() ELSE NULL END,
         archivado_por = CASE WHEN p_archivado THEN auth.uid() ELSE NULL END
   WHERE id = p_inventario_id;
END;
$$;

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
  v_resultado public.inventario_sucursal;
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo el usuario de la sucursal puede iniciar su inventario.';
  END IF;
  IF p_hora_corte IS NULL THEN
    RAISE EXCEPTION 'Indica la hora de corte del inventario.';
  END IF;

  SELECT pu.sucursal_id
    INTO v_sucursal_id
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  IF v_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no esta vinculado a una sucursal.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('inventario-sucursal-' || v_sucursal_id, 0));

  SELECT CASE
           WHEN i.cerrado_en IS NOT NULL THEN i.pollos_crudos
           ELSE COALESCE(i.pollos_crudos_iniciales, 0) + COALESCE(i.pollos_recibidos, 0)
         END,
         COALESCE(i.pollos_rostizados, 0)
    INTO v_crudos_iniciales, v_rostizados_iniciales
    FROM public.inventario_sucursal i
   WHERE i.sucursal_id = v_sucursal_id
     AND i.fecha < v_fecha
     AND i.hora_corte IS NOT NULL
   ORDER BY i.fecha DESC
   LIMIT 1;

  INSERT INTO public.inventario_sucursal (
    sucursal_id, fecha, pollos_crudos, pollos_rostizados,
    pollos_crudos_iniciales, pollos_rostizados_iniciales,
    pollos_recibidos, pollos_ingreso_manual, pollos_recibidos_en_conteo,
    actualizado_por, actualizado_por_nombre, actualizado_en
  )
  VALUES (
    v_sucursal_id, v_fecha,
    COALESCE(v_crudos_iniciales, 0), COALESCE(v_rostizados_iniciales, 0),
    COALESCE(v_crudos_iniciales, 0), COALESCE(v_rostizados_iniciales, 0),
    0, 0, COALESCE(v_crudos_iniciales, 0),
    auth.uid(),
    (SELECT pu.nombre_completo FROM public.perfiles_usuario pu WHERE pu.usuario_id = auth.uid()),
    now()
  )
  ON CONFLICT (sucursal_id, fecha) DO NOTHING;

  SELECT *
    INTO v_resultado
    FROM public.inventario_sucursal
   WHERE sucursal_id = v_sucursal_id
     AND fecha = v_fecha
   FOR UPDATE;

  UPDATE public.inventario_sucursal
     SET hora_corte = COALESCE(hora_corte, p_hora_corte),
         observaciones = COALESCE(observaciones, NULLIF(btrim(p_observaciones), '')),
         actualizado_por = auth.uid(),
         actualizado_por_nombre = (
           SELECT pu.nombre_completo FROM public.perfiles_usuario pu WHERE pu.usuario_id = auth.uid()
         ),
         actualizado_en = now()
   WHERE id = v_resultado.id
  RETURNING * INTO v_resultado;

  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.bloquear_cambios_plantilla_cerrada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo TEXT;
  v_fecha DATE;
  v_entidad_id BIGINT;
  v_cerrada BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'recepcion_pollo' THEN
    v_tipo := 'compras';
    v_fecha := CASE WHEN TG_OP = 'DELETE' THEN OLD.fecha ELSE NEW.fecha END;
    v_entidad_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.proveedor_id ELSE NEW.proveedor_id END;
  ELSIF TG_TABLE_NAME = 'planilla_ventas' THEN
    v_tipo := 'ventas';
    v_fecha := CASE WHEN TG_OP = 'DELETE' THEN OLD.fecha ELSE NEW.fecha END;
    v_entidad_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.sucursal_id ELSE NEW.sucursal_id END;
  ELSIF TG_TABLE_NAME = 'planilla_inventario' THEN
    v_tipo := 'inventario';
    v_fecha := CASE WHEN TG_OP = 'DELETE' THEN OLD.fecha ELSE NEW.fecha END;
    v_entidad_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.proveedor_id ELSE NEW.proveedor_id END;
  ELSE
    RAISE EXCEPTION 'Tabla no compatible con cierre de planillas: %', TG_TABLE_NAME;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.planillas_semanales_cerradas c
     WHERE c.tipo = v_tipo
       AND c.entidad_id = v_entidad_id
       AND c.reabierta_en IS NULL
       AND c.semana_inicio = v_fecha - (EXTRACT(ISODOW FROM v_fecha)::INT - 1)
  ) INTO v_cerrada;

  IF v_cerrada THEN
    RAISE EXCEPTION 'La planilla de esa semana esta cerrada';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS planilla_ventas_cerrada ON public.planilla_ventas;
CREATE TRIGGER planilla_ventas_cerrada
BEFORE INSERT OR UPDATE OR DELETE ON public.planilla_ventas
FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_plantilla_cerrada();

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
  v_nombre TEXT;
  v_fecha DATE := (now() AT TIME ZONE 'America/La_Paz')::DATE;
  v_ingreso INTEGER := COALESCE(p_ingreso_manual, 0);
  v_disponible INTEGER;
  v_resultado public.inventario_sucursal;
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo el usuario de la sucursal puede guardar su conteo.';
  END IF;
  IF p_ingreso_manual IS NULL OR p_ingreso_manual < 0 THEN
    RAISE EXCEPTION 'El ingreso manual debe ser un entero igual o mayor que cero.';
  END IF;
  IF p_pollos_crudos IS NOT NULL AND p_pollos_crudos < 0 THEN
    RAISE EXCEPTION 'El conteo debe ser un entero igual o mayor que cero.';
  END IF;
  IF COALESCE(p_cerrar, FALSE) AND p_pollos_crudos IS NULL THEN
    RAISE EXCEPTION 'Para cerrar debes ingresar el conteo físico.';
  END IF;

  SELECT pu.sucursal_id, pu.nombre_completo
    INTO v_sucursal_id, v_nombre
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  SELECT *
    INTO v_resultado
    FROM public.inventario_sucursal
   WHERE sucursal_id = v_sucursal_id
     AND fecha = v_fecha
   FOR UPDATE;

  IF NOT FOUND OR v_resultado.hora_corte IS NULL THEN
    RAISE EXCEPTION 'Inicia primero el inventario de hoy.';
  END IF;
  IF v_resultado.cerrado_en IS NOT NULL THEN
    RAISE EXCEPTION 'El inventario de hoy ya está cerrado.';
  END IF;

  v_disponible := COALESCE(v_resultado.pollos_crudos_iniciales, 0) + v_ingreso;

  UPDATE public.inventario_sucursal
     SET pollos_crudos_contados = COALESCE(p_pollos_crudos, pollos_crudos_contados),
         pollos_ingreso_manual = v_ingreso,
         pollos_recibidos_en_conteo = v_disponible,
         conteo_guardado_en = CASE WHEN p_pollos_crudos IS NOT NULL THEN now() ELSE conteo_guardado_en END,
         cerrado_en = CASE WHEN COALESCE(p_cerrar, FALSE) THEN now() ELSE NULL END,
         cerrado_por = CASE WHEN COALESCE(p_cerrar, FALSE) THEN auth.uid() ELSE NULL END,
         actualizado_por = auth.uid(),
         actualizado_por_nombre = v_nombre,
         actualizado_en = now(),
         observaciones = NULLIF(btrim(p_observaciones), ''),
         observaciones_producto = NULLIF(btrim(p_observaciones_producto), '')
   WHERE id = v_resultado.id
  RETURNING * INTO v_resultado;

  IF COALESCE(p_cerrar, FALSE) THEN
    INSERT INTO public.inventario_sucursal_ajustes (
      inventario_sucursal_id, sucursal_id, fecha,
      ajuste_crudos, ajuste_rostizados, creado_por
    )
    VALUES (
      v_resultado.id, v_sucursal_id, v_fecha,
      p_pollos_crudos - v_disponible, 0, auth.uid()
    )
    ON CONFLICT (inventario_sucursal_id) DO UPDATE SET
      ajuste_crudos = EXCLUDED.ajuste_crudos,
      creado_por = EXCLUDED.creado_por,
      creado_en = now();
  END IF;

  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.sincronizar_movimiento_real_inventario_sucursal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  SELECT COALESCE(SUM(unidades), 0)::BIGINT
    INTO v_total
    FROM public.movimientos_stock_sucursal
   WHERE sucursal_id = NEW.sucursal_id
     AND fecha = NEW.fecha;

  INSERT INTO public.inventario_sucursal (
    sucursal_id, fecha, pollos_crudos, pollos_rostizados,
    pollos_recibidos, pollos_ingreso_manual, pollos_recibidos_en_conteo,
    actualizado_por, actualizado_en
  )
  VALUES (
    NEW.sucursal_id, NEW.fecha, 0, 0,
    v_total::INTEGER, v_total::INTEGER, v_total::INTEGER,
    auth.uid(), now()
  )
  ON CONFLICT (sucursal_id, fecha) DO UPDATE SET
    pollos_recibidos = v_total::INTEGER,
    pollos_ingreso_manual = v_total::INTEGER,
    pollos_recibidos_en_conteo =
      COALESCE(public.inventario_sucursal.pollos_crudos_iniciales, 0) + v_total::INTEGER,
    actualizado_por = auth.uid(),
    actualizado_en = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS movimientos_stock_sincronizar_ingreso_real ON public.movimientos_stock_sucursal;
CREATE TRIGGER movimientos_stock_sincronizar_ingreso_real
AFTER INSERT OR UPDATE ON public.movimientos_stock_sucursal
FOR EACH ROW
WHEN (NEW.unidades >= 0)
EXECUTE FUNCTION public.sincronizar_movimiento_real_inventario_sucursal();

WITH totales AS (
  SELECT sucursal_id, fecha, COALESCE(SUM(unidades), 0)::INTEGER AS total
  FROM public.movimientos_stock_sucursal
  GROUP BY sucursal_id, fecha
)
UPDATE public.inventario_sucursal i
   SET pollos_recibidos = t.total,
       pollos_ingreso_manual = t.total,
       pollos_recibidos_en_conteo =
         COALESCE(i.pollos_crudos_iniciales, 0) + t.total,
       actualizado_en = now()
  FROM totales t
 WHERE i.sucursal_id = t.sucursal_id
   AND i.fecha = t.fecha;

NOTIFY pgrst, 'reload schema';
COMMIT;
