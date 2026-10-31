-- Ejecutar despues de FORMULARIOS.sql, MAPA_UBICACION.sql y GESTION_PROVEEDORES.sql.
-- Permite al superadministrador registrar y corregir compras desde la plantilla,
-- sin exigir foto, firmas ni justificante. No ejecutar desde la aplicacion.
BEGIN;

ALTER TABLE public.recepcion_pollo
  ADD COLUMN IF NOT EXISTS origen_registro TEXT NOT NULL DEFAULT 'PLANTA';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.recepcion_pollo'::REGCLASS
       AND conname = 'recepcion_pollo_origen_registro_check'
  ) THEN
    ALTER TABLE public.recepcion_pollo
      ADD CONSTRAINT recepcion_pollo_origen_registro_check
      CHECK (origen_registro IN ('PLANTA', 'MANUAL', 'CORREGIDO'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_edicion_compra_planilla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.origen_registro = 'MANUAL' THEN
      IF NOT public.get_user_es_superadmin() THEN
        RAISE EXCEPTION 'Solo el superadministrador puede crear compras manuales';
      END IF;
      IF NEW.proveedor_id IS NULL OR NEW.numero_recibo IS NULL OR btrim(NEW.numero_recibo) = '' THEN
        RAISE EXCEPTION 'El proveedor y el numero de recibo son obligatorios';
      END IF;
    ELSIF NEW.origen_registro <> 'PLANTA' THEN
      RAISE EXCEPTION 'El origen del registro no es valido';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.get_user_es_superadmin() THEN
      RAISE EXCEPTION 'Solo el superadministrador puede eliminar compras';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede corregir compras';
  END IF;

  IF NEW.origen_registro IS DISTINCT FROM OLD.origen_registro THEN
    RAISE EXCEPTION 'El origen del registro no se puede cambiar manualmente';
  END IF;

  IF NEW.fecha IS DISTINCT FROM OLD.fecha
     OR NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id
     OR NEW.numero_recibo IS DISTINCT FROM OLD.numero_recibo
     OR NEW.kilos IS DISTINCT FROM OLD.kilos
     OR NEW.unidades IS DISTINCT FROM OLD.unidades
     OR NEW.precio_por_kilo IS DISTINCT FROM OLD.precio_por_kilo THEN
    IF OLD.origen_registro = 'PLANTA' THEN
      NEW.origen_registro := 'CORREGIDO';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_compra_planilla ON public.recepcion_pollo;
CREATE TRIGGER validar_compra_planilla
  BEFORE INSERT OR UPDATE OR DELETE ON public.recepcion_pollo
  FOR EACH ROW EXECUTE FUNCTION public.validar_edicion_compra_planilla();

DROP TRIGGER IF EXISTS t_aud_recepcion ON public.recepcion_pollo;
CREATE TRIGGER t_aud_recepcion
  AFTER INSERT OR UPDATE OR DELETE ON public.recepcion_pollo
  FOR EACH ROW EXECUTE FUNCTION public.trg_auditoria();

CREATE OR REPLACE FUNCTION public.exigir_evidencia_movimiento()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tabla TEXT := TG_TABLE_NAME;
BEGIN
  IF v_tabla = 'recepcion_pollo'
     AND TG_OP = 'INSERT'
     AND NEW.origen_registro = 'MANUAL' THEN
    IF NOT public.get_user_es_superadmin() THEN
      RAISE EXCEPTION 'Solo el superadministrador puede registrar compras manuales';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.foto_url IS DISTINCT FROM OLD.foto_url THEN
      RAISE EXCEPTION 'La foto de un movimiento no se puede cambiar ni quitar';
    END IF;
    IF NEW.fotos_extra IS DISTINCT FROM OLD.fotos_extra THEN
      RAISE EXCEPTION 'Las fotos de apoyo no se pueden cambiar ni quitar';
    END IF;
    IF v_tabla = 'recepcion_pollo' THEN
      IF NEW.firma_entrega_url IS DISTINCT FROM OLD.firma_entrega_url
         OR NEW.firma_recepcion_url IS DISTINCT FROM OLD.firma_recepcion_url THEN
        RAISE EXCEPTION 'Las firmas de un lote no se pueden cambiar ni quitar';
      END IF;
    ELSE
      IF NEW.firma_url IS DISTINCT FROM OLD.firma_url THEN
        RAISE EXCEPTION 'La firma de una carga no se puede cambiar ni quitar';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_tabla = 'recepcion_pollo' THEN
    IF NEW.foto_url IS NULL OR btrim(NEW.foto_url) = '' THEN
      RAISE EXCEPTION 'Adjunta la foto del lote que esta llegando';
    END IF;
    IF NEW.firma_entrega_url IS NULL OR btrim(NEW.firma_entrega_url) = '' THEN
      RAISE EXCEPTION 'Falta la firma de quien trae el pollo';
    END IF;
    IF NEW.firma_recepcion_url IS NULL OR btrim(NEW.firma_recepcion_url) = '' THEN
      RAISE EXCEPTION 'Falta la firma del encargado que recibe';
    END IF;
    IF NEW.entregado_por_nombre IS NULL OR btrim(NEW.entregado_por_nombre) = '' THEN
      RAISE EXCEPTION 'Escribe el nombre de quien trae el pollo';
    END IF;
  END IF;

  IF v_tabla = 'despacho_pollo' THEN
    IF NEW.foto_url IS NULL OR btrim(NEW.foto_url) = '' THEN
      RAISE EXCEPTION 'Adjunta la foto de la carga que se lleva el distribuidor';
    END IF;
    IF NEW.firma_url IS NULL OR btrim(NEW.firma_url) = '' THEN
      RAISE EXCEPTION 'Falta la firma de quien autoriza la salida';
    END IF;
    IF NEW.transportista IS NULL OR btrim(NEW.transportista) = '' THEN
      RAISE EXCEPTION 'Escribe con quien va el pollo, el nombre del distribuidor';
    END IF;
    IF NEW.precio_por_kilo IS NULL OR NEW.precio_por_kilo < 0 THEN
      RAISE EXCEPTION 'Ingresa el precio por kilo de la venta';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_proveedor_activo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.proveedor_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.proveedores
        WHERE id = NEW.proveedor_id
          AND activo = TRUE
     )
     AND NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'No se puede registrar un movimiento con un proveedor inactivo.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS recepcion_write ON public.recepcion_pollo;
DROP POLICY IF EXISTS recepcion_insert_operacion ON public.recepcion_pollo;
DROP POLICY IF EXISTS recepcion_update_superadmin ON public.recepcion_pollo;
DROP POLICY IF EXISTS recepcion_delete_superadmin ON public.recepcion_pollo;

CREATE POLICY recepcion_insert_operacion ON public.recepcion_pollo
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_es_superadmin()
    OR public.get_user_rol() IN ('administrador', 'operador_planta')
  );

CREATE POLICY recepcion_update_superadmin ON public.recepcion_pollo
  FOR UPDATE TO authenticated
  USING (public.get_user_es_superadmin())
  WITH CHECK (public.get_user_es_superadmin());

CREATE POLICY recepcion_delete_superadmin ON public.recepcion_pollo
  FOR DELETE TO authenticated
  USING (public.get_user_es_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recepcion_pollo TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.recepcion_pollo_id_seq TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
