-- Ejecutar despues de PLANILLA_VENTAS.sql y PLANILLAS_CIERRE.sql.
-- Archivar y eliminar afectan a toda la semana de ventas.
BEGIN;

CREATE TABLE IF NOT EXISTS public.planillas_ventas_archivadas (
  semana_inicio DATE PRIMARY KEY,
  archivado BOOLEAN NOT NULL DEFAULT TRUE,
  archivado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archivado_en TIMESTAMPTZ,
  restaurado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  restaurado_en TIMESTAMPTZ,
  CHECK (EXTRACT(ISODOW FROM semana_inicio) = 1),
  CHECK (
    (archivado AND archivado_en IS NOT NULL)
    OR NOT archivado
  )
);

ALTER TABLE public.planillas_ventas_archivadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planillas_ventas_archivadas_superadmin
  ON public.planillas_ventas_archivadas;
CREATE POLICY planillas_ventas_archivadas_superadmin
  ON public.planillas_ventas_archivadas
  FOR SELECT TO authenticated
  USING (public.get_user_es_superadmin());

REVOKE ALL ON public.planillas_ventas_archivadas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.planillas_ventas_archivadas TO authenticated;

CREATE TABLE IF NOT EXISTS public.planillas_ventas_semanales (
  semana_inicio DATE PRIMARY KEY,
  guardada_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guardada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (EXTRACT(ISODOW FROM semana_inicio) = 1)
);

ALTER TABLE public.planillas_ventas_semanales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planillas_ventas_semanales_superadmin
  ON public.planillas_ventas_semanales;
CREATE POLICY planillas_ventas_semanales_superadmin
  ON public.planillas_ventas_semanales
  FOR SELECT TO authenticated
  USING (public.get_user_es_superadmin());

REVOKE ALL ON public.planillas_ventas_semanales FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.planillas_ventas_semanales TO authenticated;

INSERT INTO public.planillas_ventas_semanales (semana_inicio, guardada_en)
SELECT semanas.semana_inicio, MAX(semanas.guardada_en)
  FROM (
    SELECT fecha - (EXTRACT(ISODOW FROM fecha)::INT - 1) AS semana_inicio,
           MAX(actualizado_en) AS guardada_en
      FROM public.planilla_ventas
     GROUP BY 1
    UNION ALL
    SELECT semana_inicio, MAX(cerrada_en)
      FROM public.planillas_semanales_cerradas
     WHERE tipo = 'ventas'
     GROUP BY semana_inicio
  ) semanas
 GROUP BY semanas.semana_inicio
ON CONFLICT (semana_inicio) DO NOTHING;

CREATE OR REPLACE FUNCTION public.registrar_planilla_ventas_guardada(
  p_semana_inicio DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede guardar planillas'
      USING ERRCODE = '42501';
  END IF;
  IF p_semana_inicio IS NULL OR EXTRACT(ISODOW FROM p_semana_inicio) <> 1 THEN
    RAISE EXCEPTION 'La semana de ventas no es valida';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.planillas_ventas_archivadas
     WHERE semana_inicio = p_semana_inicio
       AND archivado = TRUE
  ) THEN
    RAISE EXCEPTION 'Restaura la semana archivada antes de guardarla';
  END IF;

  INSERT INTO public.planillas_ventas_semanales (
    semana_inicio, guardada_por, guardada_en
  )
  VALUES (p_semana_inicio, auth.uid(), NOW())
  ON CONFLICT (semana_inicio)
  DO UPDATE SET
    guardada_por = EXCLUDED.guardada_por,
    guardada_en = EXCLUDED.guardada_en;
END;
$$;

CREATE OR REPLACE FUNCTION public.bloquear_cambios_planilla_ventas_archivada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_archivada BOOLEAN;
  v_semana_inicio DATE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_semana_inicio := OLD.fecha - (EXTRACT(ISODOW FROM OLD.fecha)::INT - 1);
    SELECT EXISTS (
      SELECT 1
        FROM public.planillas_ventas_archivadas
       WHERE semana_inicio = v_semana_inicio
         AND archivado = TRUE
    ) INTO v_archivada;
    IF v_archivada THEN
      IF TG_OP = 'DELETE'
         AND COALESCE(current_setting('app.eliminar_planilla_ventas_archivada', TRUE), '') = '1' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'La semana de ventas esta archivada; restaurala antes de editar';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_semana_inicio := NEW.fecha - (EXTRACT(ISODOW FROM NEW.fecha)::INT - 1);
    SELECT EXISTS (
      SELECT 1
        FROM public.planillas_ventas_archivadas
       WHERE semana_inicio = v_semana_inicio
         AND archivado = TRUE
    ) INTO v_archivada;
    IF v_archivada THEN
      RAISE EXCEPTION 'La semana de ventas esta archivada; restaurala antes de editar';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.bloquear_cambios_planilla_ventas_archivada() FROM PUBLIC;
DROP TRIGGER IF EXISTS planilla_ventas_archivada ON public.planilla_ventas;
CREATE TRIGGER planilla_ventas_archivada
  BEFORE INSERT OR UPDATE OR DELETE ON public.planilla_ventas
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_planilla_ventas_archivada();

CREATE OR REPLACE FUNCTION public.archivar_planilla_ventas(
  p_semana_inicio DATE,
  p_archivar BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede archivar planillas'
      USING ERRCODE = '42501';
  END IF;
  IF p_semana_inicio IS NULL
     OR EXTRACT(ISODOW FROM p_semana_inicio) <> 1
     OR p_archivar IS NULL THEN
    RAISE EXCEPTION 'Los datos de la semana de ventas no son validos';
  END IF;

  IF p_archivar THEN
    IF NOT EXISTS (SELECT 1 FROM public.sucursales) OR EXISTS (
      SELECT 1
        FROM public.sucursales s
       WHERE NOT EXISTS (
         SELECT 1
           FROM public.planillas_semanales_cerradas c
          WHERE c.tipo = 'ventas'
            AND c.entidad_id = s.id
            AND c.semana_inicio = p_semana_inicio
            AND c.reabierta_en IS NULL
       )
    ) THEN
      RAISE EXCEPTION 'Cierra la plantilla para todas las sucursales antes de archivarla';
    END IF;

    INSERT INTO public.planillas_ventas_archivadas (
      semana_inicio, archivado, archivado_por, archivado_en,
      restaurado_por, restaurado_en
    )
    VALUES (p_semana_inicio, TRUE, auth.uid(), NOW(), NULL, NULL)
    ON CONFLICT (semana_inicio)
    DO UPDATE SET
      archivado = TRUE,
      archivado_por = EXCLUDED.archivado_por,
      archivado_en = EXCLUDED.archivado_en,
      restaurado_por = NULL,
      restaurado_en = NULL;
  ELSE
    UPDATE public.planillas_ventas_archivadas
       SET archivado = FALSE,
           restaurado_por = auth.uid(),
           restaurado_en = NOW()
     WHERE semana_inicio = p_semana_inicio
       AND archivado = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La semana de ventas no esta archivada';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_planilla_ventas(
  p_semana_inicio DATE
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_registros_eliminados INT;
BEGIN
  IF NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede eliminar planillas'
      USING ERRCODE = '42501';
  END IF;
  IF p_semana_inicio IS NULL OR EXTRACT(ISODOW FROM p_semana_inicio) <> 1 THEN
    RAISE EXCEPTION 'La semana de ventas no es valida';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sucursales) OR EXISTS (
    SELECT 1
      FROM public.sucursales s
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.planillas_semanales_cerradas c
        WHERE c.tipo = 'ventas'
          AND c.entidad_id = s.id
          AND c.semana_inicio = p_semana_inicio
          AND c.reabierta_en IS NULL
     )
  ) THEN
    RAISE EXCEPTION 'Cierra la plantilla para todas las sucursales antes de eliminarla';
  END IF;

  UPDATE public.planillas_semanales_cerradas
     SET reabierta_en = NOW()
   WHERE tipo = 'ventas'
     AND semana_inicio = p_semana_inicio
     AND reabierta_en IS NULL;

  PERFORM set_config('app.eliminar_planilla_ventas_archivada', '1', TRUE);
  DELETE FROM public.planilla_ventas
   WHERE fecha BETWEEN p_semana_inicio AND p_semana_inicio + 6;
  GET DIAGNOSTICS v_registros_eliminados = ROW_COUNT;

  DELETE FROM public.planillas_ventas_semanales
   WHERE semana_inicio = p_semana_inicio;
  DELETE FROM public.planillas_semanales_cerradas
   WHERE tipo = 'ventas'
     AND semana_inicio = p_semana_inicio;
  DELETE FROM public.planillas_ventas_archivadas
   WHERE semana_inicio = p_semana_inicio;

  RETURN v_registros_eliminados;
END;
$$;

REVOKE ALL ON FUNCTION public.archivar_planilla_ventas(DATE, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eliminar_planilla_ventas(DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_planilla_ventas_guardada(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archivar_planilla_ventas(DATE, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_planilla_ventas(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_planilla_ventas_guardada(DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
