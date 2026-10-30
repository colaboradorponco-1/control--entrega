ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS unidades_pedidas INT,
  ADD COLUMN IF NOT EXISTS unidades_recibidas INT,
  ADD COLUMN IF NOT EXISTS faltantes INT,
  ADD COLUMN IF NOT EXISTS recibido_por TEXT,
  ADD COLUMN IF NOT EXISTS observaciones_recepcion TEXT,
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS firma_url TEXT,
  ADD COLUMN IF NOT EXISTS fotos_extra TEXT[] NOT NULL DEFAULT '{}';

DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(INT, INT, TEXT);
DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(INT, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(INT, INT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(INT, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(INT, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT[]);

CREATE OR REPLACE FUNCTION public.confirmar_recepcion_pedido(
  p_pedido_id INT,
  p_unidades_recibidas INT,
  p_foto_url TEXT,
  p_firma_url TEXT,
  p_recibido_por TEXT DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitud NUMERIC DEFAULT NULL,
  p_fotos_extra TEXT[] DEFAULT NULL
)
RETURNS public.pedido_recepciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido_sucursal  INT;
  v_pedido_unidades  INT;
  v_pedido_estado    TEXT;
  v_perfil_id        INT;
  v_perfil_sucursal  INT;
  v_faltantes        BOOLEAN;
  v_id_recepcion     INT;
  v_fotos            TEXT[];
  v_sucursal_nombre  TEXT;
  v_origen_nombre    TEXT;
  v_faltantes_n      INT;
  v_sobran_n         INT;
  v_hay_que_avisar   BOOLEAN := FALSE;
BEGIN
  SELECT p.sucursal_id, p.unidades, p.estado
    INTO v_pedido_sucursal, v_pedido_unidades, v_pedido_estado
    FROM public.pedidos p
   WHERE p.id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;

  v_pedido_unidades := COALESCE(v_pedido_unidades, 0);

  SELECT pr.id, pr.sucursal_id
    INTO v_perfil_id, v_perfil_sucursal
    FROM public.perfiles_usuario pr
   WHERE pr.usuario_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF public.get_user_rol() IS DISTINCT FROM 'administrador'
     AND v_pedido_sucursal IS DISTINCT FROM v_perfil_sucursal THEN
    RAISE EXCEPTION 'No tenes permiso para recibir este pedido';
  END IF;

  IF v_pedido_estado <> 'RECOGIDO' THEN
    RAISE EXCEPTION 'El pedido aun no fue recogido (estado actual: %)', v_pedido_estado;
  END IF;

  IF p_unidades_recibidas IS NULL OR p_unidades_recibidas < 0 THEN
    RAISE EXCEPTION 'Las unidades recibidas no pueden ser negativas';
  END IF;

  IF p_foto_url IS NULL OR btrim(p_foto_url) = '' THEN
    RAISE EXCEPTION 'Adjunta la foto de la entrega, es la evidencia de que llego el pedido';
  END IF;
  IF p_firma_url IS NULL OR btrim(p_firma_url) = '' THEN
    RAISE EXCEPTION 'Falta la firma de quien recibio el pedido';
  END IF;
  IF p_recibido_por IS NULL OR btrim(p_recibido_por) = '' THEN
    RAISE EXCEPTION 'Escribe el nombre de quien recibio el pedido';
  END IF;

  PERFORM public.verificar_archivo('evidencias', p_foto_url, 'la foto de la entrega');
  PERFORM public.verificar_archivo('evidencias', p_firma_url, 'la firma de quien recibio');

  v_fotos := public.validar_fotos_extra(p_fotos_extra, 'pedido-' || p_pedido_id || '/');

  v_faltantes := p_unidades_recibidas < v_pedido_unidades;

  UPDATE public.despacho_pollo
     SET estado_recepcion = 'RECIBIDO'
   WHERE pedido_id = p_pedido_id;

  INSERT INTO public.pedido_recepciones (
    pedido_id, unidades_recibidas, faltantes, observaciones,
    recibido_por, recibido_por_nombre, foto_url, firma_url,
    latitude, longitud, fotos_extra
  )
  VALUES (
    p_pedido_id,
    p_unidades_recibidas,
    v_faltantes,
    p_observaciones,
    auth.uid(),
    btrim(p_recibido_por),
    p_foto_url,
    p_firma_url,
    p_latitude,
    p_longitud,
    v_fotos
  )
  RETURNING id INTO v_id_recepcion;

  UPDATE public.pedidos SET estado = 'ENTREGADO' WHERE id = p_pedido_id;

  v_faltantes_n := GREATEST(v_pedido_unidades - p_unidades_recibidas, 0);
  v_sobran_n := GREATEST(p_unidades_recibidas - v_pedido_unidades, 0);
  v_hay_que_avisar := v_faltantes_n > 0 OR v_sobran_n > 0;

  IF v_hay_que_avisar THEN
    SELECT s.nombre INTO v_sucursal_nombre
      FROM public.sucursales s
     WHERE s.id = v_pedido_sucursal;

    SELECT pu.nombre_completo INTO v_origen_nombre
      FROM public.perfiles_usuario pu
     WHERE pu.usuario_id = auth.uid();

    INSERT INTO public.notificaciones (
      tipo, titulo, mensaje, pedido_id, sucursal_id, sucursal_nombre,
      unidades_pedidas, unidades_recibidas, faltantes,
      recibido_por, observaciones_recepcion,
      foto_url, firma_url, fotos_extra,
      origen_usuario_id, origen_nombre, destinatario_usuario_id
    )
    SELECT
      'RECEPCION_FALTANTES',
      CASE
        WHEN v_faltantes_n > 0
          THEN 'Faltantes en el pedido #' || p_pedido_id
        ELSE 'Unidades de mas en el pedido #' || p_pedido_id
      END,
      CASE
        WHEN v_faltantes_n > 0
          THEN 'La sucursal ' || COALESCE(v_sucursal_nombre, 'sin nombre')
               || ' recibio ' || p_unidades_recibidas || ' de ' || v_pedido_unidades
               || ' unidades: faltan ' || v_faltantes_n || '.'
        ELSE 'La sucursal ' || COALESCE(v_sucursal_nombre, 'sin nombre')
             || ' recibio ' || p_unidades_recibidas || ' unidades de las '
             || v_pedido_unidades || ' pedidas: sobran ' || v_sobran_n || '.'
      END,
      p_pedido_id,
      v_pedido_sucursal,
      v_sucursal_nombre,
      v_pedido_unidades,
      p_unidades_recibidas,
      v_faltantes_n,
      NULLIF(btrim(COALESCE(p_recibido_por, '')), ''),
      NULLIF(btrim(COALESCE(p_observaciones, '')), ''),
      p_foto_url,
      p_firma_url,
      v_fotos,
      auth.uid(),
      v_origen_nombre,
      pu.usuario_id
    FROM public.perfiles_usuario pu
    JOIN public.roles r ON r.id = pu.rol_id
    WHERE r.nombre = 'administrador'
      AND pu.activo IS NOT FALSE
      AND pu.usuario_id IS NOT NULL;
  END IF;

  RETURN (SELECT r FROM public.pedido_recepciones r WHERE r.id = v_id_recepcion);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_recepcion_pedido(
  INT, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT[]
) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('confirmar_recepcion_pedido', 'enviar_observaciones_entrega_pedido')
 ORDER BY p.proname;
