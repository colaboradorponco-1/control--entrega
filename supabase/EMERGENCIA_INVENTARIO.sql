-- PEDIDO DE EMERGENCIA E INVENTARIO POR SUCURSAL

-- 1. Agregar campo emergencia a pedidos
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS emergencia BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Tabla de inventario por sucursal
CREATE TABLE IF NOT EXISTS public.inventario_sucursal (
  id BIGSERIAL PRIMARY KEY,
  sucursal_id BIGINT NOT NULL REFERENCES public.sucursales(id),
  pollos_crudos INTEGER NOT NULL DEFAULT 0,
  pollos_rostizados INTEGER NOT NULL DEFAULT 0,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  actualizado_por UUID REFERENCES auth.users(id),
  actualizado_por_nombre TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sucursal_id, fecha)
);

-- 3. RLS
ALTER TABLE public.inventario_sucursal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventario_sucursal_read ON public.inventario_sucursal;
CREATE POLICY inventario_sucursal_read ON public.inventario_sucursal
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('dueno', 'administrador', 'superadministrador', 'sucursal', 'rosticero'))
    )
  );

DROP POLICY IF EXISTS inventario_sucursal_write ON public.inventario_sucursal;
CREATE POLICY inventario_sucursal_write ON public.inventario_sucursal
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('dueno', 'administrador', 'superadministrador'))
    )
  );

-- 4. RPC para actualizar inventario
CREATE OR REPLACE FUNCTION public.actualizar_inventario_sucursal(
  p_sucursal_id BIGINT,
  p_pollos_crudos INTEGER,
  p_pollos_rostizados INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nombre TEXT;
BEGIN
  SELECT nombre_completo INTO v_nombre
  FROM public.perfiles_usuario WHERE usuario_id = auth.uid();

  INSERT INTO public.inventario_sucursal (sucursal_id, fecha, pollos_crudos, pollos_rostizados, actualizado_por, actualizado_por_nombre, actualizado_en)
  VALUES (p_sucursal_id, CURRENT_DATE, p_pollos_crudos, p_pollos_rostizados, auth.uid(), v_nombre, now())
  ON CONFLICT (sucursal_id, fecha)
  DO UPDATE SET
    pollos_crudos = p_pollos_crudos,
    pollos_rostizados = p_pollos_rostizados,
    actualizado_por = auth.uid(),
    actualizado_por_nombre = v_nombre,
    actualizado_en = now();
END;
$$;

-- 5. RPC para crear pedido de emergencia
CREATE OR REPLACE FUNCTION public.crear_pedido_emergencia(
  p_sucursal_id BIGINT,
  p_unidades INTEGER,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pedido_id BIGINT;
  v_sucursal_usuario BIGINT;
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo una sucursal puede crear un pedido de emergencia.'
      USING ERRCODE = '42501';
  END IF;
  IF p_unidades IS NULL OR p_unidades <= 0 THEN
    RAISE EXCEPTION 'Las unidades deben ser un número entero mayor que cero.';
  END IF;

  SELECT pu.sucursal_id INTO v_sucursal_usuario
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();
  IF v_sucursal_usuario IS NULL OR v_sucursal_usuario IS DISTINCT FROM p_sucursal_id THEN
    RAISE EXCEPTION 'Solo puedes crear una emergencia para tu sucursal.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pedidos (sucursal_id, unidades, fecha, observaciones, estado, emergencia)
  VALUES (
    p_sucursal_id,
    p_unidades,
    (now() AT TIME ZONE 'America/La_Paz')::DATE,
    COALESCE(NULLIF(btrim(p_observaciones), ''), 'PEDIDO DE EMERGENCIA'),
    'PENDIENTE',
    TRUE
  )
  RETURNING id INTO v_pedido_id;

  RETURN v_pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_pedido_emergencia(BIGINT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_pedido_emergencia(BIGINT, INTEGER, TEXT) TO authenticated;

-- 6. Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'inventario_sucursal'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventario_sucursal;
  END IF;
END;
$$;
