-- Ejecutar despues de PLANILLA_COMPRAS_MANUAL.sql y PLANILLAS_CIERRE.sql.
-- Archivar conserva los recibos; eliminar solo se permite despues de archivar.
BEGIN;

CREATE TABLE IF NOT EXISTS public.planillas_compras_archivadas (
  proveedor_id INT NOT NULL REFERENCES public.proveedores(id) ON DELETE RESTRICT,
  semana_inicio DATE NOT NULL,
  archivado BOOLEAN NOT NULL DEFAULT TRUE,
  archivado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archivado_en TIMESTAMPTZ,
  restaurado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  restaurado_en TIMESTAMPTZ,
  PRIMARY KEY (proveedor_id, semana_inicio),
  CHECK (EXTRACT(ISODOW FROM semana_inicio) = 1),
  CHECK (
    (archivado AND archivado_en IS NOT NULL)
    OR NOT archivado
  )
);

ALTER TABLE public.planillas_compras_archivadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planillas_compras_archivadas_superadmin
  ON public.planillas_compras_archivadas;
CREATE POLICY planillas_compras_archivadas_superadmin
  ON public.planillas_compras_archivadas
  FOR SELECT TO authenticated
  USING (public.get_user_es_superadmin());

REVOKE ALL ON public.planillas_compras_archivadas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.planillas_compras_archivadas TO authenticated;

CREATE OR REPLACE FUNCTION public.bloquear_cambios_planilla_compras_archivada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proveedor_id INT;
  v_fecha DATE;
  v_archivada BOOLEAN;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_proveedor_id := OLD.proveedor_id;
    v_fecha := OLD.fecha;
    SELECT EXISTS (
      SELECT 1
        FROM public.planillas_compras_archivadas
       WHERE proveedor_id = v_proveedor_id
         AND semana_inicio = v_fecha - (EXTRACT(ISODOW FROM v_fecha)::INT - 1)
         AND archivado = TRUE
    ) INTO v_archivada;
    IF v_archivada AND TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'La planilla de compras esta archivada; restaurala antes de editar';
    END IF;
    IF TG_OP = 'DELETE' THEN
      IF NOT v_archivada THEN
        RAISE EXCEPTION 'Solo se pueden eliminar recibos de una planilla archivada';
      END IF;
      IF coalesce(current_setting('app.eliminar_planilla_compras_archivada', TRUE), '') <> '1' THEN
        RAISE EXCEPTION 'Elimina la planilla archivada desde la accion autorizada';
      END IF;
      RETURN OLD;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_proveedor_id := NEW.proveedor_id;
    v_fecha := NEW.fecha;
    SELECT EXISTS (
      SELECT 1
        FROM public.planillas_compras_archivadas
       WHERE proveedor_id = v_proveedor_id
         AND semana_inicio = v_fecha - (EXTRACT(ISODOW FROM v_fecha)::INT - 1)
         AND archivado = TRUE
    ) INTO v_archivada;
    IF v_archivada THEN
      RAISE EXCEPTION 'La planilla de compras esta archivada; restaurala antes de editar';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.bloquear_cambios_planilla_compras_archivada() FROM PUBLIC;
DROP TRIGGER IF EXISTS planilla_compras_archivada ON public.recepcion_pollo;
CREATE TRIGGER planilla_compras_archivada
  BEFORE INSERT OR UPDATE OR DELETE ON public.recepcion_pollo
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_planilla_compras_archivada();

CREATE OR REPLACE FUNCTION public.archivar_planilla_compras(
  p_proveedor_id INT,
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
  IF p_proveedor_id IS NULL
     OR p_semana_inicio IS NULL
     OR EXTRACT(ISODOW FROM p_semana_inicio) <> 1
     OR p_archivar IS NULL THEN
    RAISE EXCEPTION 'Los datos de la planilla semanal no son validos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proveedores WHERE id = p_proveedor_id) THEN
    RAISE EXCEPTION 'El proveedor seleccionado ya no existe';
  END IF;

  IF p_archivar THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.recepcion_pollo
       WHERE proveedor_id = p_proveedor_id
         AND fecha BETWEEN p_semana_inicio AND p_semana_inicio + 6
    ) THEN
      RAISE EXCEPTION 'No se puede archivar una planilla sin recibos';
    END IF;

    INSERT INTO public.planillas_compras_archivadas (
      proveedor_id, semana_inicio, archivado, archivado_por, archivado_en,
      restaurado_por, restaurado_en
    )
    VALUES (p_proveedor_id, p_semana_inicio, TRUE, auth.uid(), NOW(), NULL, NULL)
    ON CONFLICT (proveedor_id, semana_inicio)
    DO UPDATE SET
      archivado = TRUE,
      archivado_por = EXCLUDED.archivado_por,
      archivado_en = EXCLUDED.archivado_en,
      restaurado_por = NULL,
      restaurado_en = NULL;
  ELSE
    UPDATE public.planillas_compras_archivadas
       SET archivado = FALSE,
           restaurado_por = auth.uid(),
           restaurado_en = NOW()
     WHERE proveedor_id = p_proveedor_id
       AND semana_inicio = p_semana_inicio
       AND archivado = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La planilla no esta archivada';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_planilla_compras_archivada(
  p_proveedor_id INT,
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
  IF p_proveedor_id IS NULL
     OR p_semana_inicio IS NULL
     OR EXTRACT(ISODOW FROM p_semana_inicio) <> 1 THEN
    RAISE EXCEPTION 'Los datos de la planilla semanal no son validos';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.planillas_compras_archivadas
     WHERE proveedor_id = p_proveedor_id
       AND semana_inicio = p_semana_inicio
       AND archivado = TRUE
  ) THEN
    RAISE EXCEPTION 'Solo se puede eliminar una planilla archivada';
  END IF;

  UPDATE public.planillas_semanales_cerradas
     SET reabierta_en = NOW()
   WHERE tipo = 'compras'
     AND entidad_id = p_proveedor_id
     AND semana_inicio = p_semana_inicio
     AND reabierta_en IS NULL;

  PERFORM set_config('app.eliminar_planilla_compras_archivada', '1', TRUE);
  DELETE FROM public.recepcion_pollo
   WHERE proveedor_id = p_proveedor_id
     AND fecha BETWEEN p_semana_inicio AND p_semana_inicio + 6;
  GET DIAGNOSTICS v_registros_eliminados = ROW_COUNT;

  DELETE FROM public.planillas_semanales_cerradas
   WHERE tipo = 'compras'
     AND entidad_id = p_proveedor_id
     AND semana_inicio = p_semana_inicio;

  DELETE FROM public.planillas_compras_archivadas
   WHERE proveedor_id = p_proveedor_id
     AND semana_inicio = p_semana_inicio
     AND archivado = TRUE;

  RETURN v_registros_eliminados;
END;
$$;

REVOKE ALL ON FUNCTION public.archivar_planilla_compras(INT, DATE, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eliminar_planilla_compras_archivada(INT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archivar_planilla_compras(INT, DATE, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eliminar_planilla_compras_archivada(INT, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
