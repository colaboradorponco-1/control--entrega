BEGIN;

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
    IF TG_OP = 'INSERT'
       AND public.get_user_rol() IN ('operador_planta', 'administrador')
       AND NEW.origen_registro = 'PLANTA' THEN
      RETURN NEW;
    END IF;

    v_tipo := 'compras';
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_fecha := OLD.fecha;
      v_entidad_id := OLD.proveedor_id;
    ELSE
      v_fecha := NEW.fecha;
      v_entidad_id := NEW.proveedor_id;
    END IF;

  ELSIF TG_TABLE_NAME = 'planilla_ventas' THEN
    v_tipo := 'ventas';
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_fecha := OLD.fecha;
      v_entidad_id := OLD.sucursal_id;
    ELSE
      v_fecha := NEW.fecha;
      v_entidad_id := NEW.sucursal_id;
    END IF;

  ELSIF TG_TABLE_NAME = 'planilla_inventario' THEN
    v_tipo := 'inventario';
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_fecha := OLD.fecha;
      v_entidad_id := OLD.proveedor_id;
    ELSE
      v_fecha := NEW.fecha;
      v_entidad_id := NEW.proveedor_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'Tabla no compatible con el cierre de planillas: %', TG_TABLE_NAME;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.planillas_semanales_cerradas c
       WHERE c.tipo = v_tipo
         AND c.entidad_id = v_entidad_id
         AND c.reabierta_en IS NULL
         AND c.semana_inicio =
             v_fecha - (EXTRACT(ISODOW FROM v_fecha)::INT - 1)
    ) INTO v_cerrada;

    IF v_cerrada THEN
      RAISE EXCEPTION 'La planilla de esa semana esta cerrada';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.planillas_semanales_cerradas c
       WHERE c.tipo = v_tipo
         AND c.entidad_id = v_entidad_id
         AND c.reabierta_en IS NULL
         AND c.semana_inicio =
             v_fecha - (EXTRACT(ISODOW FROM v_fecha)::INT - 1)
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

DROP TRIGGER IF EXISTS planilla_ventas_cerrada ON public.planilla_ventas;
CREATE TRIGGER planilla_ventas_cerrada
  BEFORE INSERT OR UPDATE OR DELETE ON public.planilla_ventas
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_plantilla_cerrada();

DROP TRIGGER IF EXISTS planilla_compras_cerrada ON public.recepcion_pollo;
CREATE TRIGGER planilla_compras_cerrada
  BEFORE INSERT OR UPDATE OR DELETE ON public.recepcion_pollo
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_plantilla_cerrada();

DROP TRIGGER IF EXISTS planilla_inventario_cerrada ON public.planilla_inventario;
CREATE TRIGGER planilla_inventario_cerrada
  BEFORE INSERT OR UPDATE OR DELETE ON public.planilla_inventario
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambios_plantilla_cerrada();

NOTIFY pgrst, 'reload schema';

COMMIT;
