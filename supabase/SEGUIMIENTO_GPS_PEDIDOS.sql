CREATE TABLE IF NOT EXISTS public.seguimiento_pedidos (
  pedido_id INT PRIMARY KEY REFERENCES public.pedidos(id) ON DELETE CASCADE,
  despachador_id INT NOT NULL REFERENCES public.perfiles_usuario(id),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  precision_m DOUBLE PRECISION,
  ruta_nombre TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.validar_seguimiento_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sucursal_id INT;
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'despachador'
     OR NEW.despachador_id <> (
       SELECT id FROM public.perfiles_usuario WHERE usuario_id = auth.uid()
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.pedidos p
       JOIN public.despacho_pollo d ON d.pedido_id = p.id
       WHERE p.id = NEW.pedido_id
         AND p.estado = 'RECOGIDO'
         AND d.despachado_por = NEW.despachador_id
     )
  THEN
    RAISE EXCEPTION 'No puedes actualizar la ubicación de este pedido';
  END IF;

  SELECT sucursal_id INTO v_sucursal_id
  FROM public.pedidos
  WHERE id = NEW.pedido_id;

  SELECT r.nombre INTO NEW.ruta_nombre
  FROM public.despacho_pollo d
  JOIN public.ruta_sucursales rs ON rs.sucursal_id = v_sucursal_id
  JOIN public.rutas r ON r.id = rs.ruta_id
    AND r.repartidor_id = d.despachado_por
    AND r.activo = TRUE
  WHERE d.pedido_id = NEW.pedido_id
  LIMIT 1;

  NEW.actualizado_en := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_seguimiento_pedido ON public.seguimiento_pedidos;
CREATE TRIGGER validar_seguimiento_pedido
  BEFORE INSERT OR UPDATE ON public.seguimiento_pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_seguimiento_pedido();

CREATE OR REPLACE FUNCTION public.limpiar_seguimiento_pedido_entregado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado <> 'RECOGIDO' THEN
    DELETE FROM public.seguimiento_pedidos WHERE pedido_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS limpiar_seguimiento_pedido_entregado ON public.pedidos;
CREATE TRIGGER limpiar_seguimiento_pedido_entregado
  AFTER UPDATE OF estado ON public.pedidos
  FOR EACH ROW
  WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION public.limpiar_seguimiento_pedido_entregado();

ALTER TABLE public.seguimiento_pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seguimiento_pedidos_leer_autorizados ON public.seguimiento_pedidos;
CREATE POLICY seguimiento_pedidos_leer_autorizados
  ON public.seguimiento_pedidos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.pedidos p
      WHERE p.id = pedido_id
        AND p.estado = 'RECOGIDO'
        AND (
          public.get_user_rol() = 'administrador'
          OR p.sucursal_id = public.get_user_sucursal()
          OR (
            public.get_user_es_dueno()
            AND p.sucursal_id = ANY(public.get_user_sucursales_dueno())
          )
          OR EXISTS (
            SELECT 1
            FROM public.despacho_pollo d
            JOIN public.perfiles_usuario u ON u.id = d.despachado_por
            WHERE d.pedido_id = p.id
              AND u.usuario_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS seguimiento_pedidos_escribir_propio ON public.seguimiento_pedidos;
CREATE POLICY seguimiento_pedidos_escribir_propio
  ON public.seguimiento_pedidos FOR INSERT TO authenticated
  WITH CHECK (
    despachador_id = (
      SELECT id FROM public.perfiles_usuario WHERE usuario_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS seguimiento_pedidos_actualizar_propio ON public.seguimiento_pedidos;
CREATE POLICY seguimiento_pedidos_actualizar_propio
  ON public.seguimiento_pedidos FOR UPDATE TO authenticated
  USING (
    despachador_id = (
      SELECT id FROM public.perfiles_usuario WHERE usuario_id = auth.uid()
    )
  )
  WITH CHECK (
    despachador_id = (
      SELECT id FROM public.perfiles_usuario WHERE usuario_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.seguimiento_pedidos TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'seguimiento_pedidos'
     )
  THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.seguimiento_pedidos';
  END IF;
END;
$$;
