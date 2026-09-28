-- ============================================================
-- PARTE 2 de 5 : RPC registrar_lote_proveedor (formulario 1)
-- Lineas 261 a 358 de FORMULARIOS.sql
-- Correlas en orden: 1, 2, 3, 4, 5
-- ============================================================

-- 4) FORMULARIO 1: LOTE QUE LLEGA DEL PROVEEDOR
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.registrar_lote_proveedor(
  TEXT, INT, NUMERIC, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
);
DROP FUNCTION IF EXISTS public.registrar_lote_proveedor(
  TEXT, INT, NUMERIC, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.registrar_lote_proveedor(
  TEXT, INT, NUMERIC, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.registrar_lote_proveedor(
  p_numero_recibo TEXT,
  p_proveedor_id INT,
  p_kilos NUMERIC,
  p_unidades INT,
  p_precio_por_kilo NUMERIC,
  p_foto_url TEXT,
  p_firma_entrega_url TEXT,
  p_firma_recepcion_url TEXT,
  p_entregado_por TEXT,
  p_observaciones TEXT DEFAULT NULL,
  p_recibido_por TEXT DEFAULT NULL,
  p_fotos_extra TEXT[] DEFAULT NULL
)
RETURNS public.recepcion_pollo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_creado_por INT;
  v_id INT;
  v_recibe TEXT;
  v_fotos TEXT[];
BEGIN
  IF public.get_user_rol() NOT IN ('operador_planta','administrador') THEN
    RAISE EXCEPTION 'Solo el encargado de planta puede registrar la llegada de un lote';
  END IF;

  IF p_numero_recibo IS NULL OR btrim(p_numero_recibo) = '' THEN
    RAISE EXCEPTION 'Ingresa el numero de recibo o lote';
  END IF;
  IF p_proveedor_id IS NULL THEN
    RAISE EXCEPTION 'Elige el proveedor';
  END IF;
  IF p_kilos IS NULL OR p_kilos <= 0 THEN
    RAISE EXCEPTION 'Los kilos tienen que ser mas de cero';
  END IF;
  IF p_unidades IS NULL OR p_unidades <= 0 THEN
    RAISE EXCEPTION 'Las unidades tienen que ser mas de cero';
  END IF;
  IF p_precio_por_kilo IS NULL OR p_precio_por_kilo < 0 THEN
    RAISE EXCEPTION 'Ingresa el precio por kilo';
  END IF;
  IF p_entregado_por IS NULL OR btrim(p_entregado_por) = '' THEN
    RAISE EXCEPTION 'Escribe el nombre de quien trae el pollo';
  END IF;

  PERFORM public.verificar_archivo('evidencias', p_foto_url, 'la foto del lote');
  PERFORM public.verificar_archivo('evidencias', p_firma_entrega_url, 'la firma de quien entrega');
  PERFORM public.verificar_archivo('evidencias', p_firma_recepcion_url, 'la firma de quien recibe');

  SELECT id INTO v_creado_por
    FROM public.perfiles_usuario
   WHERE usuario_id = auth.uid();

  -- Si no se escribe, el que registra es el que recibe
  v_recibe := COALESCE(NULLIF(btrim(p_recibido_por), ''), (SELECT nombre_completo FROM public.perfiles_usuario WHERE usuario_id = auth.uid()));

  v_fotos := public.validar_fotos_extra(p_fotos_extra, 'lote-' || btrim(p_numero_recibo) || '-');

  INSERT INTO public.recepcion_pollo (
    numero_recibo, fecha, kilos, unidades, precio_por_kilo, proveedor_id,
    creado_por, observaciones, foto_url,
    firma_entrega_url, firma_recepcion_url,
    entregado_por_nombre, recibido_por_nombre, recibido_por,
    fotos_extra
  )
  VALUES (
    btrim(p_numero_recibo), CURRENT_DATE, p_kilos, p_unidades, p_precio_por_kilo,
    p_proveedor_id, v_creado_por, p_observaciones, p_foto_url,
    p_firma_entrega_url, p_firma_recepcion_url,
    btrim(p_entregado_por), v_recibe, auth.uid(),
    v_fotos
  )
  RETURNING id INTO v_id;

  RETURN (SELECT r FROM public.recepcion_pollo r WHERE r.id = v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_lote_proveedor(
  TEXT, INT, NUMERIC, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
) TO authenticated;


