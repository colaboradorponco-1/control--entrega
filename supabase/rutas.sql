CREATE TABLE IF NOT EXISTS public.rutas (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  repartidor_id INT REFERENCES public.perfiles_usuario(id) ON DELETE SET NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS rutas_nombre_unico
  ON public.rutas (lower(btrim(nombre)));

CREATE TABLE IF NOT EXISTS public.ruta_sucursales (
  ruta_id INT NOT NULL REFERENCES public.rutas(id) ON DELETE CASCADE,
  sucursal_id INT NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  orden INT NOT NULL CHECK (orden > 0),
  PRIMARY KEY (ruta_id, sucursal_id)
);

CREATE INDEX IF NOT EXISTS ruta_sucursales_orden_idx
  ON public.ruta_sucursales (ruta_id, orden);

ALTER TABLE public.rutas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ruta_sucursales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rutas_read ON public.rutas;
CREATE POLICY rutas_read ON public.rutas
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() = 'administrador'
    OR repartidor_id = (
      SELECT p.id FROM public.perfiles_usuario p WHERE p.usuario_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS rutas_admin ON public.rutas;
CREATE POLICY rutas_admin ON public.rutas
  FOR ALL TO authenticated
  USING (public.get_user_rol() = 'administrador')
  WITH CHECK (public.get_user_rol() = 'administrador');

DROP POLICY IF EXISTS ruta_sucursales_read ON public.ruta_sucursales;
CREATE POLICY ruta_sucursales_read ON public.ruta_sucursales
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() = 'administrador'
    OR EXISTS (
      SELECT 1
        FROM public.rutas r
        JOIN public.perfiles_usuario p ON p.id = r.repartidor_id
       WHERE r.id = ruta_id
         AND p.usuario_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS ruta_sucursales_admin ON public.ruta_sucursales;
CREATE POLICY ruta_sucursales_admin ON public.ruta_sucursales
  FOR ALL TO authenticated
  USING (public.get_user_rol() = 'administrador')
  WITH CHECK (public.get_user_rol() = 'administrador');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rutas TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.rutas_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ruta_sucursales TO authenticated;

CREATE OR REPLACE FUNCTION public.guardar_paradas_ruta(
  p_ruta_id INT,
  p_sucursales_ids INT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'administrador' THEN
    RAISE EXCEPTION 'Solo un administrador puede modificar las paradas de una ruta';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.rutas WHERE id = p_ruta_id) THEN
    RAISE EXCEPTION 'La ruta no existe';
  END IF;

  IF cardinality(COALESCE(p_sucursales_ids, '{}')) <>
     (SELECT COUNT(DISTINCT parada.sucursal_id)
        FROM unnest(COALESCE(p_sucursales_ids, '{}')) AS parada(sucursal_id)) THEN
    RAISE EXCEPTION 'Una sucursal no puede repetirse en la misma ruta';
  END IF;

  DELETE FROM public.ruta_sucursales WHERE ruta_id = p_ruta_id;

  INSERT INTO public.ruta_sucursales (ruta_id, sucursal_id, orden)
  SELECT p_ruta_id, parada.sucursal_id, parada.orden::INT
    FROM unnest(COALESCE(p_sucursales_ids, '{}'))
         WITH ORDINALITY AS parada(sucursal_id, orden);
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_paradas_ruta(INT, INT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardar_paradas_ruta(INT, INT[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
