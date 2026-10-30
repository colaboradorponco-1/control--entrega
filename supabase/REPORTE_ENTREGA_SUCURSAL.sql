DO $$
BEGIN
  IF to_regclass('public.pedido_recepciones') IS NOT NULL THEN
    ALTER TABLE public.pedido_recepciones
      ADD COLUMN IF NOT EXISTS estado_producto TEXT,
      ADD COLUMN IF NOT EXISTS fotos_observaciones TEXT[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

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
  v_recibido_en TIMESTAMPTZ;
  v_observaciones_entrega TEXT;
  v_limite TIMESTAMPTZ;
  v_fotos TEXT[];
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

  IF p_estado_producto IS NULL
     AND (p_observaciones IS NULL OR btrim(p_observaciones) = '')
     AND (p_fotos IS NULL OR cardinality(p_fotos) = 0) THEN
    RAISE EXCEPTION 'Marca el estado del pollo, escribe una observacion o adjunta una foto';
  END IF;

  v_limite := (
    (v_recibido_en AT TIME ZONE 'America/La_Paz')::DATE + TIME '18:00'
  ) AT TIME ZONE 'America/La_Paz';
  IF now() > v_limite THEN
    RAISE EXCEPTION 'El plazo para enviar el reporte vencio a las 18:00 de Cochabamba';
  END IF;

  v_fotos := public.validar_fotos_extra(
    p_fotos,
    'pedido-' || p_pedido_id || '/observaciones/'
  );

  UPDATE public.pedido_recepciones
     SET observaciones_entrega = NULLIF(btrim(COALESCE(p_observaciones, '')), ''),
         observaciones_entrega_en = now(),
         estado_producto = p_estado_producto,
         fotos_observaciones = v_fotos
   WHERE id = v_recepcion_id
  RETURNING * INTO v_recepcion;

  RETURN v_recepcion;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enviar_observaciones_entrega_pedido(
  INT, TEXT, TEXT, TEXT[]
) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'enviar_observaciones_entrega_pedido';
