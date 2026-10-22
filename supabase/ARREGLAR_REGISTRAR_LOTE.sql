-- ============================================================
--  ARREGLAR: registrar_lote_proveedor
--  La recepcion de planta (operador_planta) llama esta funcion
--  con 14 parametros (incluye p_fotos_extra, p_latitude,
--  p_longitud), pero en la base no existe -> la recepcion no
--  guarda nada y recepcion_pollo queda en 0 filas.
--
--  Este archivo borra cualquier version vieja y deja la version
--  completa (la misma de MAPA_UBICACION.sql) + recarga el cache.
--
--  Requiere public.validar_fotos_extra (ARREGLAR_HELPERS_EVIDENCIA.sql).
--  Es seguro correrlo varias veces.
-- ============================================================

-- 1) Columnas de ubicacion (por si acaso)
ALTER TABLE public.recepcion_pollo
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

-- 2) Borrar TODAS las versiones viejas (cualquier firma)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS firma
      FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'registrar_lote_proveedor'
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.firma;
  END LOOP;
END $$;

-- 3) Version completa (14 parametros)
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

NOTIFY pgrst, 'reload schema';

-- Verificacion: debe listar exactamente una version, terminando en
-- "..., text[], numeric, numeric".
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'registrar_lote_proveedor';
