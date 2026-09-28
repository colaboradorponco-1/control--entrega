-- ============================================================
-- PARTE 3 de 5 : RPC despachar_pedido (formulario 2)
-- Lineas 359 a 463 de FORMULARIOS.sql
-- Correlas en orden: 1, 2, 3, 4, 5
-- ============================================================

-- ------------------------------------------------------------
-- 5) FORMULARIO 2: LO QUE SALE HACIA LA SUCURSAL
-- Reemplaza recoger_pedido: ahora lleva precio, con quien va,
-- foto y firma, no solo el peso.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.recoger_pedido(INT, NUMERIC);
DROP FUNCTION IF EXISTS public.despachar_pedido(
  INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
);
DROP FUNCTION IF EXISTS public.despachar_pedido(
  INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.despachar_pedido(
  p_pedido_id INT,
  p_unidades INT,
  p_kilos NUMERIC,
  p_precio_por_kilo NUMERIC,
  p_transportista TEXT,
  p_foto_url TEXT,
  p_firma_url TEXT,
  p_entregado_por TEXT,
  p_observaciones TEXT DEFAULT NULL,
  p_fotos_extra TEXT[] DEFAULT NULL
)
RETURNS public.despacho_pollo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado TEXT;
  v_sucursal INT;
  v_creado_por INT;
  v_id INT;
  v_fotos TEXT[];
BEGIN
  IF public.get_user_rol() NOT IN ('despachador','administrador') THEN
    RAISE EXCEPTION 'Solo el despachador puede registrar la salida del pollo';
  END IF;

  SELECT estado, sucursal_id INTO v_estado, v_sucursal
    FROM public.pedidos WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;
  IF v_estado <> 'LISTO' THEN
    RAISE EXCEPTION 'El pedido no esta listo para cargarse (estado actual: %)', v_estado;
  END IF;
  IF p_unidades IS NULL OR p_unidades <= 0 THEN
    RAISE EXCEPTION 'Las unidades tienen que ser mas de cero';
  END IF;
  IF p_kilos IS NULL OR p_kilos <= 0 THEN
    RAISE EXCEPTION 'Ingresa el peso que sale de la planta';
  END IF;
  IF p_precio_por_kilo IS NULL OR p_precio_por_kilo < 0 THEN
    RAISE EXCEPTION 'Ingresa el precio por kilo de la venta';
  END IF;
  IF p_transportista IS NULL OR btrim(p_transportista) = '' THEN
    RAISE EXCEPTION 'Escribe con quien va el pollo';
  END IF;
  IF p_entregado_por IS NULL OR btrim(p_entregado_por) = '' THEN
    RAISE EXCEPTION 'Falta el nombre de quien autoriza la salida';
  END IF;

  PERFORM public.verificar_archivo('evidencias', p_foto_url, 'la foto de la carga');
  PERFORM public.verificar_archivo('evidencias', p_firma_url, 'la firma de quien autoriza');

  SELECT id INTO v_creado_por
    FROM public.perfiles_usuario
   WHERE usuario_id = auth.uid();

  v_fotos := public.validar_fotos_extra(p_fotos_extra, 'pedido-' || p_pedido_id || '/');

  -- Primero queda el registro con la evidencia
  INSERT INTO public.despacho_pollo (
    fecha, kilos, unidades, sucursal_id, estado_recepcion,
    precio_por_kilo, transportista, foto_url, firma_url,
    entregado_por_nombre, observaciones,
    despachado_por, pedido_id, fotos_extra
  )
  VALUES (
    CURRENT_DATE, p_kilos, p_unidades, v_sucursal, 'PENDIENTE',
    p_precio_por_kilo, btrim(p_transportista), p_foto_url, p_firma_url,
    btrim(p_entregado_por), p_observaciones,
    v_creado_por, p_pedido_id, v_fotos
  )
  RETURNING id INTO v_id;

  -- Peso y estado juntos, en un solo paso
  UPDATE public.pedidos
     SET kilos_despachados = p_kilos,
         estado = 'RECOGIDO'
   WHERE id = p_pedido_id;

  RETURN (SELECT d FROM public.despacho_pollo d WHERE d.id = v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.despachar_pedido(
  INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
) TO authenticated;


