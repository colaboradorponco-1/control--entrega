CREATE OR REPLACE FUNCTION public.get_user_es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.perfiles_usuario pu
      JOIN public.roles r ON r.id = pu.rol_id
     WHERE pu.usuario_id = auth.uid()
       AND r.nombre = 'administrador'
       AND pu.activo IS NOT FALSE
  );
$$;
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'REPORTE_ENTREGA',
  titulo TEXT NOT NULL,
  mensaje TEXT,
  pedido_id INT REFERENCES public.pedidos(id) ON DELETE SET NULL,
  sucursal_id INT REFERENCES public.sucursales(id) ON DELETE SET NULL,
  sucursal_nombre TEXT,
  estado_producto TEXT,
  observaciones_entrega TEXT,
  fotos_observaciones TEXT[] NOT NULL DEFAULT '{}',
  origen_usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  origen_nombre TEXT,
  destinatario_usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leido BOOLEAN NOT NULL DEFAULT FALSE,
  leido_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_destinatario
  ON public.notificaciones (destinatario_usuario_id, creado_en DESC);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notificaciones_read ON public.notificaciones;
CREATE POLICY notificaciones_read ON public.notificaciones
  FOR SELECT TO authenticated
  USING (destinatario_usuario_id = auth.uid());

DROP POLICY IF EXISTS notificaciones_update ON public.notificaciones;
CREATE POLICY notificaciones_update ON public.notificaciones
  FOR UPDATE TO authenticated
  USING (destinatario_usuario_id = auth.uid())
  WITH CHECK (destinatario_usuario_id = auth.uid());

GRANT SELECT, UPDATE ON public.notificaciones TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.notificaciones_id_seq TO authenticated;
COMMENT ON TABLE public.notificaciones IS
  'Avisos de la administracion. El reporte de entrega de la sucursal se guarda aqui solo para el rol administrador, no para el superadmin.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notificaciones'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3) Marcar avisos como leidos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_notificacion_leida(p_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actualizado BOOLEAN;
BEGIN
  UPDATE public.notificaciones
     SET leido = TRUE,
         leido_en = now()
   WHERE id = p_id
     AND destinatario_usuario_id = auth.uid()
  RETURNING TRUE INTO v_actualizado;

  RETURN COALESCE(v_actualizado, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_todas_notificaciones_leidas()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total INT;
BEGIN
  UPDATE public.notificaciones
     SET leido = TRUE,
         leido_en = now()
   WHERE destinatario_usuario_id = auth.uid()
     AND leido = FALSE;
  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_notificacion_leida(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_todas_notificaciones_leidas() TO authenticated;

-- ------------------------------------------------------------
-- 4) La RPC del reporte: ahora tambien deja el aviso
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.enviar_observaciones_entrega_pedido(INT, TEXT);

CREATE OR REPLACE FUNCTION public.enviar_observaciones_entrega_pedido(
  p_pedido_id INT,
  p_observaciones TEXT DEFAULT NULL,
  p_estado_producto TEXT DEFAULT NULL,
  p_fotos TEXT[] DEFAULT NULL
)
RETURNS public.pedido_recepciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recepcion public.pedido_recepciones;
  v_recepcion_id INT;
  v_estado TEXT;
  v_sucursal_id INT;
  v_sucursal_nombre TEXT;
  v_recibido_en TIMESTAMPTZ;
  v_observaciones_entrega TEXT;
  v_limite TIMESTAMPTZ;
  v_fotos TEXT[];
  v_observaciones TEXT;
  v_origen_nombre TEXT;
BEGIN
  IF public.get_user_rol() <> 'sucursal' THEN
    RAISE EXCEPTION 'Solo la sucursal receptora puede enviar este reporte';
  END IF;

  IF p_observaciones IS NOT NULL AND length(btrim(p_observaciones)) > 2000 THEN
    RAISE EXCEPTION 'Las observaciones no pueden superar 2000 caracteres';
  END IF;

  IF p_estado_producto IS NOT NULL
     AND p_estado_producto NOT IN ('FRESCO', 'TIBIO', 'EMBALAJE', 'DETERIORO', 'OTRO') THEN
    RAISE EXCEPTION 'El estado del producto no es valido';
  END IF;

  SELECT p.estado, p.sucursal_id, r.id, r.recibido_en, r.observaciones_entrega
    INTO v_estado, v_sucursal_id, v_recepcion_id, v_recibido_en, v_observaciones_entrega
    FROM public.pedidos p
    JOIN public.pedido_recepciones r ON r.pedido_id = p.id
   WHERE p.id = p_pedido_id
   FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontro la recepcion de este pedido';
  END IF;
  IF v_sucursal_id IS DISTINCT FROM public.get_user_sucursal() THEN
    RAISE EXCEPTION 'Solo la sucursal del pedido puede enviar este reporte';
  END IF;
  IF v_estado <> 'ENTREGADO' THEN
    RAISE EXCEPTION 'El pedido debe estar entregado antes de enviar el reporte';
  END IF;
  IF v_observaciones_entrega IS NOT NULL THEN
    RAISE EXCEPTION 'El reporte de este pedido ya fue enviado';
  END IF;

  -- Con al menos un dato alcanza: el estado, una observacion o una foto.
  IF p_estado_producto IS NULL
     AND (p_observaciones IS NULL OR btrim(p_observaciones) = '')
     AND (p_fotos IS NULL OR cardinality(p_fotos) = 0) THEN
    RAISE EXCEPTION 'Marca el estado del pollo, escribe una observacion o adjunta una foto';
  END IF;

  -- 48 horas desde la recepcion: da margen para revisar la mercaderia
  -- sin dejar el reporte abierto indefinidamente.
  v_limite := v_recibido_en + INTERVAL '48 hours';
  IF now() > v_limite THEN
    RAISE EXCEPTION 'El plazo para enviar el reporte vencio (48 horas despues de recibir el pedido)';
  END IF;

  v_fotos := public.validar_fotos_extra(
    p_fotos,
    'pedido-' || p_pedido_id || '/observaciones/'
  );

  v_observaciones := NULLIF(btrim(COALESCE(p_observaciones, '')), '');

  UPDATE public.pedido_recepciones
     SET observaciones_entrega = v_observaciones,
         observaciones_entrega_en = now(),
         estado_producto = p_estado_producto,
         fotos_observaciones = v_fotos
   WHERE id = v_recepcion_id
  RETURNING * INTO v_recepcion;

  SELECT s.nombre INTO v_sucursal_nombre
    FROM public.sucursales s
   WHERE s.id = v_sucursal_id;

  SELECT pu.nombre_completo INTO v_origen_nombre
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  -- El aviso va a cada administrador activo. El superadmin no entra
  -- porque su rol se llama 'superadmin', no 'administrador'.
  INSERT INTO public.notificaciones (
    tipo, titulo, mensaje, pedido_id, sucursal_id, sucursal_nombre,
    estado_producto, observaciones_entrega, fotos_observaciones,
    origen_usuario_id, origen_nombre, destinatario_usuario_id
  )
  SELECT
    'REPORTE_ENTREGA',
    'Reporte de entrega - Pedido #' || p_pedido_id,
    'La sucursal ' || COALESCE(v_sucursal_nombre, 'sin nombre') || ' reportó en qué estado recibió el pollo.',
    p_pedido_id,
    v_sucursal_id,
    v_sucursal_nombre,
    p_estado_producto,
    v_observaciones,
    v_fotos,
    auth.uid(),
    v_origen_nombre,
    pu.usuario_id
  FROM public.perfiles_usuario pu
  JOIN public.roles r ON r.id = pu.rol_id
 WHERE r.nombre = 'administrador'
   AND pu.activo IS NOT FALSE
   AND pu.usuario_id IS NOT NULL;

  RETURN v_recepcion;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enviar_observaciones_entrega_pedido(
  INT, TEXT, TEXT, TEXT[]
) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Verificacion: la RPC del reporte debe tener una sola version (4 args)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'enviar_observaciones_entrega_pedido',
     'marcar_notificacion_leida',
     'marcar_todas_notificaciones_leidas',
     'get_user_es_admin'
   )
 ORDER BY p.proname;
