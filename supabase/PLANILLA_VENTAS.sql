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
      AND r.nombre = 'superadministrador'
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

NOTIFY pgrst, 'reload schema';
