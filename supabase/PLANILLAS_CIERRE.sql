-- Ejecutar despues de PLANILLA_VENTAS.sql y PLANILLA_COMPRAS_MANUAL.sql.
-- Cerrar una plantilla guarda su estado y bloquea cambios hasta que el
-- superadministrador la reabra desde la misma plantilla.
BEGIN;

CREATE TABLE IF NOT EXISTS public.planillas_semanales_cerradas (
  tipo TEXT NOT NULL CHECK (tipo IN ('compras', 'ventas', 'inventario')),
  entidad_id INT NOT NULL,
  semana_inicio DATE NOT NULL,
  cerrada_por UUID NOT NULL REFERENCES auth.users(id),
  cerrada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reabierta_en TIMESTAMPTZ,
  PRIMARY KEY (tipo, entidad_id, semana_inicio),
  CHECK (EXTRACT(ISODOW FROM semana_inicio) = 1)
);

ALTER TABLE public.planillas_semanales_cerradas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planillas_semanales_cerradas_superadmin
  ON public.planillas_semanales_cerradas;
CREATE POLICY planillas_semanales_cerradas_superadmin
  ON public.planillas_semanales_cerradas
  FOR SELECT TO authenticated
  USING (public.get_user_es_superadmin());

REVOKE ALL ON public.planillas_semanales_cerradas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.planillas_semanales_cerradas TO authenticated;

CREATE OR REPLACE FUNCTION public.cerrar_plantilla_semanal(
  p_tipo TEXT,
  p_entidad_id INT,
  p_semana_inicio DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede cerrar plantillas';
  END IF;
  IF p_tipo IS NULL
     OR p_tipo NOT IN ('compras', 'ventas', 'inventario')
     OR p_entidad_id IS NULL
     OR p_semana_inicio IS NULL
     OR EXTRACT(ISODOW FROM p_semana_inicio) <> 1 THEN
    RAISE EXCEPTION 'Los datos de la plantilla semanal no son validos';
  END IF;

  IF p_tipo = 'ventas' AND NOT EXISTS (
    SELECT 1 FROM public.sucursales WHERE id = p_entidad_id
  ) THEN
    RAISE EXCEPTION 'La sucursal seleccionada ya no existe';
  END IF;
  IF p_tipo IN ('compras', 'inventario') AND NOT EXISTS (
    SELECT 1 FROM public.proveedores WHERE id = p_entidad_id
  ) THEN
    RAISE EXCEPTION 'El proveedor seleccionado ya no existe';
  END IF;

  INSERT INTO public.planillas_semanales_cerradas (
    tipo, entidad_id, semana_inicio, cerrada_por, cerrada_en
  )
  VALUES (p_tipo, p_entidad_id, p_semana_inicio, auth.uid(), NOW())
  ON CONFLICT (tipo, entidad_id, semana_inicio)
  DO UPDATE SET
    cerrada_por = EXCLUDED.cerrada_por,
    cerrada_en = EXCLUDED.cerrada_en,
    reabierta_en = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.reabrir_plantilla_semanal(
  p_tipo TEXT,
  p_entidad_id INT,
  p_semana_inicio DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede reabrir plantillas';
  END IF;

  UPDATE public.planillas_semanales_cerradas
     SET reabierta_en = NOW()
   WHERE tipo = p_tipo
     AND entidad_id = p_entidad_id
     AND semana_inicio = p_semana_inicio
     AND reabierta_en IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.cerrar_plantilla_semanal(TEXT, INT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reabrir_plantilla_semanal(TEXT, INT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cerrar_plantilla_semanal(TEXT, INT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_plantilla_semanal(TEXT, INT, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.bloquear_cambios_plantilla_cerrada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo TEXT;
  v_fecha DATE;
  v_entidad_id INT;
  v_cerrada BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'recepcion_pollo' THEN
    v_tipo := 'compras';
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_fecha := OLD.fecha;
      v_entidad_id := OLD.proveedor_id;
      SELECT EXISTS (
        SELECT 1
          FROM public.planillas_semanales_cerradas
         WHERE tipo = v_tipo
           AND entidad_id = v_entidad_id
           AND reabierta_en IS NULL
           AND semana_inicio = v_fecha - (EXTRACT(ISODOW FROM v_fecha)::INT - 1)
      ) INTO v_cerrada;
      IF v_cerrada THEN
        RAISE EXCEPTION 'La planilla de compras de esa semana esta cerrada';
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_fecha := NEW.fecha;
      v_entidad_id := NEW.proveedor_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'planilla_ventas' THEN
    v_tipo := 'ventas';
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_fecha := OLD.fecha;
      v_entidad_id := OLD.sucursal_id;
      SELECT EXISTS (
        SELECT 1
          FROM public.planillas_semanales_cerradas
         WHERE tipo = v_tipo
           AND entidad_id = v_entidad_id
           AND reabierta_en IS NULL
           AND semana_inicio = v_fecha - (EXTRACT(ISODOW FROM v_fecha)::INT - 1)
      ) INTO v_cerrada;
      IF v_cerrada THEN
        RAISE EXCEPTION 'La planilla de ventas de esa semana esta cerrada';
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_fecha := NEW.fecha;
      v_entidad_id := NEW.sucursal_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'planilla_inventario' THEN
    v_tipo := 'inventario';
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_fecha := OLD.fecha;
      v_entidad_id := OLD.proveedor_id;
      SELECT EXISTS (
        SELECT 1
          FROM public.planillas_semanales_cerradas
         WHERE tipo = v_tipo
           AND entidad_id = v_entidad_id
           AND reabierta_en IS NULL
           AND semana_inicio = v_fecha - (EXTRACT(ISODOW FROM v_fecha)::INT - 1)
      ) INTO v_cerrada;
      IF v_cerrada THEN
        RAISE EXCEPTION 'La planilla de inventario de esa semana esta cerrada';
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_fecha := NEW.fecha;
      v_entidad_id := NEW.proveedor_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tabla no compatible con el cierre de planillas: %', TG_TABLE_NAME;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.planillas_semanales_cerradas
       WHERE tipo = v_tipo
         AND entidad_id = v_entidad_id
         AND reabierta_en IS NULL
         AND semana_inicio = v_fecha - (EXTRACT(ISODOW FROM v_fecha)::INT - 1)
    ) INTO v_cerrada;
    IF v_cerrada THEN
      RAISE EXCEPTION 'La planilla de esa semana esta cerrada';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bloquear_cambios_plantilla_cerrada() FROM PUBLIC;

DROP TRIGGER IF EXISTS planilla_compras_cerrada ON public.recepcion_pollo;
CREATE TRIGGER planilla_compras_cerrada
  BEFORE INSERT OR UPDATE OR DELETE ON public.recepcion_pollo
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_plantilla_cerrada();

DROP TRIGGER IF EXISTS planilla_ventas_cerrada ON public.planilla_ventas;
CREATE TRIGGER planilla_ventas_cerrada
  BEFORE INSERT OR UPDATE OR DELETE ON public.planilla_ventas
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_plantilla_cerrada();

DROP TRIGGER IF EXISTS planilla_inventario_cerrada ON public.planilla_inventario;
CREATE TRIGGER planilla_inventario_cerrada
  BEFORE INSERT OR UPDATE OR DELETE ON public.planilla_inventario
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_plantilla_cerrada();

NOTIFY pgrst, 'reload schema';
COMMIT;
