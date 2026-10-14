-- ============================================================
--  ARREGLAR: confirmar_recepcion_pedido
--  La sucursal confirma la entrega. El frontend llama la version
--  de 9 parametros (con p_fotos_extra, p_latitude y p_longitud),
--  pero en la base no existe -> "Could not find the function
--  public.confirmar_recepcion_pedido(...) in the schema cache".
--
--  Este archivo borra cualquier overload viejo y deja la version
--  buena. Requiere:
--    - public.verificar_archivo(...)        (ARREGLAR_HELPERS_EVIDENCIA.sql)
--    - public.validar_fotos_extra(...)      (ARREGLAR_HELPERS_EVIDENCIA.sql)
--    - columnas de pedido_recepciones       (ARREGLAR_COLUMNAS_FORMULARIOS.sql)
-- ============================================================

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
BEGIN
  SELECT p.sucursal_id, p.unidades, p.estado
    INTO v_pedido_sucursal, v_pedido_unidades, v_pedido_estado
    FROM public.pedidos p
   WHERE p.id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;

  SELECT pr.id, pr.sucursal_id
    INTO v_perfil_id, v_perfil_sucursal
    FROM public.perfiles_usuario pr
   WHERE pr.usuario_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF public.get_user_rol() <> 'administrador'
     AND v_pedido_sucursal <> v_perfil_sucursal THEN
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

  -- La carga que ya existe queda como recibida. No se inserta otra
  -- fila, porque el inventario sumaria los kilos dos veces.
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

  RETURN (SELECT r FROM public.pedido_recepciones r WHERE r.id = v_id_recepcion);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_recepcion_pedido(
  INT, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT[]
) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Verificacion: debe listar exactamente una version de 9 argumentos.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'confirmar_recepcion_pedido';
