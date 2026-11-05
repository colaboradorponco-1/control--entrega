CREATE OR REPLACE FUNCTION public.es_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles_usuario p
    JOIN public.roles r ON r.id = p.rol_id
    WHERE p.usuario_id = auth.uid()
      AND r.nombre = 'superadmin'
  );
$$;
CREATE TABLE IF NOT EXISTS public.planilla_ventas (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  sucursal_id INT NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  unidades INT NOT NULL DEFAULT 0 CHECK (unidades >= 0),
  transacciones INT NOT NULL DEFAULT 0 CHECK (transacciones >= 0),
  importe_bs NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (importe_bs >= 0),
  creado_por INT REFERENCES public.perfiles_usuario(id) ON DELETE SET NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fecha, sucursal_id)
);

CREATE TABLE IF NOT EXISTS public.planilla_inventario (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  proveedor_id INT NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  kilos_ayer NUMERIC(12,2) NOT NULL DEFAULT 0,
  kilos_entrante NUMERIC(12,2) NOT NULL DEFAULT 0,
  kilos_saliente NUMERIC(12,2) NOT NULL DEFAULT 0,
  kilos_hoy NUMERIC(12,2)
    GENERATED ALWAYS AS (kilos_ayer + kilos_entrante - kilos_saliente) STORED,
  creado_por INT REFERENCES public.perfiles_usuario(id) ON DELETE SET NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fecha, proveedor_id)
);

CREATE OR REPLACE FUNCTION public.tocar_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actualizado_en := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planilla_ventas_actualizado ON public.planilla_ventas;
CREATE TRIGGER planilla_ventas_actualizado
  BEFORE UPDATE ON public.planilla_ventas
  FOR EACH ROW
  EXECUTE FUNCTION public.tocar_actualizado_en();

DROP TRIGGER IF EXISTS planilla_inventario_actualizado ON public.planilla_inventario;
CREATE TRIGGER planilla_inventario_actualizado
  BEFORE UPDATE ON public.planilla_inventario
  FOR EACH ROW
  EXECUTE FUNCTION public.tocar_actualizado_en();

ALTER TABLE public.planilla_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planilla_inventario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS planilla_ventas_superadmin ON public.planilla_ventas;
CREATE POLICY planilla_ventas_superadmin
  ON public.planilla_ventas
  FOR ALL TO authenticated
  USING (public.es_superadmin())
  WITH CHECK (public.es_superadmin());

DROP POLICY IF EXISTS planilla_inventario_superadmin ON public.planilla_inventario;
CREATE POLICY planilla_inventario_superadmin
  ON public.planilla_inventario
  FOR ALL TO authenticated
  USING (public.es_superadmin())
  WITH CHECK (public.es_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planilla_ventas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planilla_inventario TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.planilla_ventas_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.planilla_inventario_id_seq TO authenticated;

DROP POLICY IF EXISTS planilla_ventas_sucursal ON public.planilla_ventas;
CREATE POLICY planilla_ventas_sucursal
  ON public.planilla_ventas
  FOR ALL TO authenticated
  USING (
    public.get_user_rol() = 'sucursal'
    AND sucursal_id = public.get_user_sucursal()
  )
  WITH CHECK (
    public.get_user_rol() = 'sucursal'
    AND sucursal_id = public.get_user_sucursal()
  );

DROP POLICY IF EXISTS planilla_ventas_dueno ON public.planilla_ventas;
CREATE POLICY planilla_ventas_dueno
  ON public.planilla_ventas
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() = 'dueno'
    AND sucursal_id = ANY(public.get_user_sucursales_dueno())
  );

DROP POLICY IF EXISTS planilla_ventas_admin ON public.planilla_ventas;
CREATE POLICY planilla_ventas_admin
  ON public.planilla_ventas
  FOR ALL TO authenticated
  USING (public.get_user_rol() IN ('administrador', 'superadmin'))
  WITH CHECK (public.get_user_rol() IN ('administrador', 'superadmin'));

CREATE OR REPLACE FUNCTION public.registrar_venta_sucursal(
  p_sucursal_id INTEGER,
  p_fecha DATE,
  p_unidades INTEGER,
  p_transacciones INTEGER,
  p_importe_bs NUMERIC
)
RETURNS public.planilla_ventas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_perfil public.perfiles_usuario%ROWTYPE;
  v_registro public.planilla_ventas%ROWTYPE;
  v_rol TEXT := public.get_user_rol();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;
  SELECT pu.* INTO v_perfil
  FROM public.perfiles_usuario pu
  WHERE pu.usuario_id = auth.uid();
  IF v_perfil.id IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;
  IF p_sucursal_id IS NULL OR p_sucursal_id < 1 THEN
    RAISE EXCEPTION 'Sucursal inválida';
  END IF;
  IF p_fecha IS NULL OR p_fecha > (now() AT TIME ZONE 'America/La_Paz')::DATE THEN
    RAISE EXCEPTION 'Fecha inválida';
  END IF;
  IF p_unidades IS NULL OR p_unidades < 0
     OR p_transacciones IS NULL OR p_transacciones < 0
     OR p_importe_bs IS NULL OR p_importe_bs < 0 THEN
    RAISE EXCEPTION 'Los valores deben ser iguales o mayores a cero';
  END IF;
  IF NOT (
    v_rol IN ('administrador', 'superadmin')
    OR (v_rol = 'sucursal' AND p_sucursal_id = public.get_user_sucursal())
  ) THEN
    RAISE EXCEPTION 'No puedes registrar ventas para esta sucursal';
  END IF;

  INSERT INTO public.planilla_ventas (
    fecha, sucursal_id, unidades, transacciones, importe_bs, creado_por
  )
  VALUES (
    p_fecha, p_sucursal_id, p_unidades, p_transacciones, p_importe_bs, v_perfil.id
  )
  ON CONFLICT (fecha, sucursal_id)
  DO UPDATE SET
    unidades = EXCLUDED.unidades,
    transacciones = EXCLUDED.transacciones,
    importe_bs = EXCLUDED.importe_bs,
    creado_por = EXCLUDED.creado_por
  RETURNING * INTO v_registro;
  RETURN v_registro;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_venta_sucursal(INTEGER, DATE, INTEGER, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venta_sucursal(INTEGER, DATE, INTEGER, INTEGER, NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';
