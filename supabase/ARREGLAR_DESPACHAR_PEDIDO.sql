-- ============================================================
--  ARREGLAR despachar_pedido  (error "schema cache")
-- ------------------------------------------------------------
--  Corrige:
--    Could not find the function public.despachar_pedido(...)
--    in the schema cache
--
--  Causa: en la base quedo la version vieja de la funcion
--  (sin p_fotos_extra, p_latitude ni p_longitud). El panel de
--  despacho la llama con 12 parametros y PostgREST no la
--  encuentra.
--
--  Que hace: borra las versiones viejas y crea la version
--  completa (la misma que MAPA_UBICACION.sql) + recarga el
--  cache de PostgREST.
--
--  Requiere que existan public.verificar_archivo y
--  public.validar_fotos_extra (las crea FORMULARIOS.sql).
--  Es seguro correrlo varias veces.
-- ============================================================

-- 1) Columnas de ubicacion (por si acaso) y fotos de apoyo
ALTER TABLE public.despacho_pollo
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS fotos_extra TEXT[] NOT NULL DEFAULT '{}';

-- 2) Borrar las firmas viejas para que no queden ambiguas
DROP FUNCTION IF EXISTS public.despachar_pedido(INT, INT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.despachar_pedido(INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.despachar_pedido(INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);

-- 3) Version completa (12 parametros)
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
  p_fotos_extra TEXT[] DEFAULT NULL,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitud NUMERIC DEFAULT NULL
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

  INSERT INTO public.despacho_pollo (
    fecha, kilos, unidades, sucursal_id, estado_recepcion,
    precio_por_kilo, transportista, foto_url, firma_url,
    entregado_por_nombre, observaciones,
    despachado_por, pedido_id, fotos_extra,
    latitude, longitude
  )
  VALUES (
    CURRENT_DATE, p_kilos, p_unidades, v_sucursal, 'PENDIENTE',
    p_precio_por_kilo, btrim(p_transportista), p_foto_url, p_firma_url,
    btrim(p_entregado_por), p_observaciones,
    v_creado_por, p_pedido_id, v_fotos,
    p_latitude, p_longitud
  )
  RETURNING id INTO v_id;

  UPDATE public.pedidos
     SET kilos_despachados = p_kilos,
         estado = 'RECOGIDO'
   WHERE id = p_pedido_id;

  RETURN (SELECT d FROM public.despacho_pollo d WHERE d.id = v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.despachar_pedido(
  INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], NUMERIC, NUMERIC
) TO authenticated;

-- 4) Recargar el cache de PostgREST
NOTIFY pgrst, 'reload schema';

-- 5) Verificacion: debe mostrar "ok" y la firma de 12 parametros
SELECT
  CASE WHEN EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'despachar_pedido'
       AND pg_get_function_arguments(p.oid) LIKE '%p_latitude%'
  ) THEN 'ok' ELSE 'FALTA' END AS despachar_pedido_con_ubicacion;
