BEGIN;

ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proveedores_read ON public.proveedores;
CREATE POLICY proveedores_read ON public.proveedores
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS proveedores_write ON public.proveedores;
DROP POLICY IF EXISTS proveedores_gestion_admin ON public.proveedores;
CREATE POLICY proveedores_gestion_admin ON public.proveedores
  FOR ALL TO authenticated
  USING (
    public.get_user_es_superadmin()
    OR public.get_user_rol() = 'administrador'
  )
  WITH CHECK (
    public.get_user_es_superadmin()
    OR public.get_user_rol() = 'administrador'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proveedores TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.proveedores_id_seq TO authenticated;

DO $$
DECLARE
  v_fk RECORD;
  v_nombre_constraint TEXT;
BEGIN
  FOR v_fk IN
    SELECT c.conrelid::REGCLASS AS tabla, c.conname, c.conrelid::REGCLASS::TEXT AS nombre_tabla
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.proveedores'::REGCLASS
       AND c.conrelid IN (
         to_regclass('public.recepcion_pollo'),
         to_regclass('public.planilla_inventario')
       )
       AND EXISTS (
         SELECT 1
           FROM unnest(c.conkey) AS columna(attnum)
           JOIN pg_attribute a
             ON a.attrelid = c.conrelid
            AND a.attnum = columna.attnum
          WHERE a.attname = 'proveedor_id'
       )
  LOOP
    v_nombre_constraint := 'proveedores_' || split_part(v_fk.nombre_tabla, '.', 2) || '_no_borrar_fkey';
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_fk.tabla, v_fk.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (proveedor_id) REFERENCES public.proveedores(id) ON DELETE RESTRICT',
      v_fk.tabla,
      v_nombre_constraint
    );
  END LOOP;
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
     ) THEN
    RAISE EXCEPTION 'No se puede registrar un movimiento con un proveedor inactivo.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_proveedor_activo() FROM PUBLIC;

DROP TRIGGER IF EXISTS recepcion_proveedor_activo ON public.recepcion_pollo;
CREATE TRIGGER recepcion_proveedor_activo
  BEFORE INSERT OR UPDATE ON public.recepcion_pollo
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_proveedor_activo();

DROP TRIGGER IF EXISTS inventario_proveedor_activo ON public.planilla_inventario;
CREATE TRIGGER inventario_proveedor_activo
  BEFORE INSERT OR UPDATE ON public.planilla_inventario
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_proveedor_activo();

NOTIFY pgrst, 'reload schema';
COMMIT;
