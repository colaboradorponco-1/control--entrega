-- ============================================================
--  AGREGAR GPS A LOS OTROS DOS FORMULARIOS
-- ============================================================
--  Que hace: agrega el boton de ubicacion, igual al que ya
--  tiene la recepcion de sucursal, a los otros dos formularios:
--
--    - Recepcion en planta   -> tabla recepcion_pollo
--    - Despacho               -> tabla despacho_pollo
--
--  Cuando se acepta el pedido, el boton es opcional: si el
--  celular no da la ubicacion, el registro se guarda igual. La
--  foto y la firma siguen siendo la prueba obligatoria.
--
--  ORDEN: correr DESPUES de partes/PARTE1.sql a PARTE5.sql.
--  Este archivo usa public.validar_fotos_extra y
--  public.verificar_archivo, que esos archivos crean. Si no
--  existen, falla.
--
--  Se puede correr varias veces. No rompe nada.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Las columnas de ubicacion
-- ------------------------------------------------------------
--  Se agregan a las dos tablas. Se dejan en NUMERIC(10,7) como
--  las de pedido_recepciones, que ya funcionan.

ALTER TABLE public.recepcion_pollo
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

ALTER TABLE public.despacho_pollo
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

COMMENT ON COLUMN public.recepcion_pollo.latitude IS
  'GPS de donde se recibio el lote. Opcional: es un extra.';
COMMENT ON COLUMN public.despacho_pollo.latitude IS
  'GPS de donde salio la carga. Opcional: es un extra.';


-- ------------------------------------------------------------
-- 2) Se tapan las funciones viejas
-- ------------------------------------------------------------
--  Postgres no tiene "cambiarle la firma a una funcion". Si se
--  creara la nueva con los parametros nuevos, quedaria la vieja
--  tambien, y PostgREST no sabria cual usar. Por eso se borra
--  la anterior primero, escribiendo su firma exacta.

DROP FUNCTION IF EXISTS public.registrar_lote_proveedor(
  TEXT, INT, NUMERIC, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
);

DROP FUNCTION IF EXISTS public.despachar_pedido(
  INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
);


-- ------------------------------------------------------------
-- 3) registrar_lote_proveedor, ahora con ubicacion
-- ------------------------------------------------------------
--  Es la misma funcion de FORMULARIOS.sql. Lo unico que cambio
--  son los dos parametros nuevos al final y las dos columnas del
--  INSERT. El resto esta copiado tal cual.

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
  p_fotos_extra TEXT[] DEFAULT NULL,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitud NUMERIC DEFAULT NULL
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

  SELECT id INTO v_creado_por
    FROM public.perfiles_usuario
   WHERE usuario_id = auth.uid();

  v_recibe := COALESCE(NULLIF(btrim(p_recibido_por), ''), (SELECT nombre_completo FROM public.perfiles_usuario WHERE usuario_id = auth.uid()));

  v_fotos := public.validar_fotos_extra(p_fotos_extra, 'lote-' || btrim(p_numero_recibo) || '-');

  INSERT INTO public.recepcion_pollo (
    numero_recibo, fecha, kilos, unidades, precio_por_kilo, proveedor_id,
    creado_por, observaciones, foto_url,
    firma_entrega_url, firma_recepcion_url,
    entregado_por_nombre, recibido_por_nombre, recibido_por,
    fotos_extra, latitude, longitude
  )
  VALUES (
    btrim(p_numero_recibo), CURRENT_DATE, p_kilos, p_unidades, p_precio_por_kilo,
    p_proveedor_id, v_creado_por, p_observaciones, p_foto_url,
    p_firma_entrega_url, p_firma_recepcion_url,
    btrim(p_entregado_por), v_recibe, auth.uid(),
    v_fotos, p_latitude, p_longitud
  )
  RETURNING id INTO v_id;

  RETURN (SELECT r FROM public.recepcion_pollo r WHERE r.id = v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_lote_proveedor(
  TEXT, INT, NUMERIC, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], NUMERIC, NUMERIC
) TO authenticated;


-- ------------------------------------------------------------
-- 4) despachar_pedido, ahora con ubicacion
-- ------------------------------------------------------------
--  Mismo criterio que arriba: los dos parametros nuevos al
--  final, las dos columnas nuevas en el INSERT, y todo lo demas
--  igual que en FORMULARIOS.sql.

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

  -- Primero queda el registro con la evidencia
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

  -- Peso y estado juntos, en un solo paso
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


-- ------------------------------------------------------------
-- 5) Verificar
-- ------------------------------------------------------------
--  Tiene que dar ok, ok, y las dos firmas de abajo tienen que
--  terminar en "NUMERIC, NUMERIC". Si aparece la firma vieja,
--  es que quedo una version anterior de la funcion.

SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'recepcion_pollo'
       AND column_name = 'latitude') THEN 'ok' ELSE 'FALTA' END
  || ' / '
  || CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'despacho_pollo'
       AND column_name = 'latitude') THEN 'ok' ELSE 'FALTA' END
  AS columnas_de_ubicacion;

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS parametros
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('registrar_lote_proveedor', 'despachar_pedido')
 ORDER BY p.proname;

-- Que no queden funciones viejas colgadas. Tiene que dar 0 filas.
SELECT proname, pg_get_function_identity_arguments(oid)
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN ('registrar_lote_proveedor', 'despachar_pedido')
   AND pg_get_function_identity_arguments(oid) NOT LIKE '%NUMERIC, NUMERIC%';

NOTIFY pgrst, 'reload schema';