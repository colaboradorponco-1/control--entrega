DO $$
BEGIN
  IF to_regclass('public.despacho_pollo') IS NOT NULL THEN
    ALTER TABLE public.despacho_pollo
      ADD COLUMN IF NOT EXISTS recibido_foto_url TEXT,
      ADD COLUMN IF NOT EXISTS recibido_firma_url TEXT,
      ADD COLUMN IF NOT EXISTS recibido_por_nombre TEXT,
      ADD COLUMN IF NOT EXISTS recibido_en TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS fotos_extra_recepcion TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS latitude_recepcion NUMERIC(10,7),
      ADD COLUMN IF NOT EXISTS longitude_recepcion NUMERIC(10,7);
  END IF;
END $$;

-- Se borran todas las versiones de la RPC por su OID (no por firma).
DO $$
DECLARE
  v_oid OID;
BEGIN
  FOR v_oid IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'confirmar_entrega_despacho'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', v_oid::regprocedure);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.confirmar_entrega_despacho(
  p_despacho_id INT,
  p_observaciones TEXT DEFAULT NULL,
  p_foto_url TEXT DEFAULT NULL,
  p_firma_url TEXT DEFAULT NULL,
  p_recibido_por TEXT DEFAULT NULL,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitud NUMERIC DEFAULT NULL,
  p_fotos_extra TEXT[] DEFAULT NULL
)
RETURNS public.despacho_pollo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_despacho public.despacho_pollo;
  v_fotos TEXT[];
BEGIN
  SELECT * INTO v_despacho
    FROM public.despacho_pollo
   WHERE id = p_despacho_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El despacho no existe';
  END IF;

  IF public.get_user_rol() NOT IN ('administrador', 'sucursal') THEN
    RAISE EXCEPTION 'Solo la sucursal receptora o un administrador pueden confirmar la entrega';
  END IF;

  IF public.get_user_rol() <> 'administrador'
     AND v_despacho.sucursal_id IS DISTINCT FROM public.get_user_sucursal() THEN
    RAISE EXCEPTION 'Ese despacho no pertenece a tu sucursal';
  END IF;

  IF v_despacho.estado_recepcion = 'RECIBIDO' THEN
    RAISE EXCEPTION 'Esta entrega ya fue confirmada';
  END IF;

  IF p_foto_url IS NULL OR btrim(p_foto_url) = '' THEN
    RAISE EXCEPTION 'Adjunta la foto de la entrega, es la evidencia de que llego el pollo';
  END IF;
  IF p_firma_url IS NULL OR btrim(p_firma_url) = '' THEN
    RAISE EXCEPTION 'Falta la firma de quien recibio';
  END IF;
  IF p_recibido_por IS NULL OR btrim(p_recibido_por) = '' THEN
    RAISE EXCEPTION 'Escribe el nombre de quien recibio';
  END IF;

  PERFORM public.verificar_archivo('evidencias', p_foto_url, 'la foto de la entrega');
  PERFORM public.verificar_archivo('evidencias', p_firma_url, 'la firma de quien recibio');

  v_fotos := public.validar_fotos_extra(p_fotos_extra, 'despacho-' || p_despacho_id || '/');

  UPDATE public.despacho_pollo
     SET estado_recepcion = 'RECIBIDO',
         observaciones = COALESCE(NULLIF(TRIM(p_observaciones), ''), NULL),
         recibido_foto_url = p_foto_url,
         recibido_firma_url = p_firma_url,
         recibido_por_nombre = btrim(p_recibido_por),
         recibido_en = now(),
         fotos_extra_recepcion = v_fotos,
         latitude_recepcion = p_latitude,
         longitude_recepcion = p_longitud
   WHERE id = p_despacho_id
  RETURNING * INTO v_despacho;

  RETURN v_despacho;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_entrega_despacho(
  INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT[]
) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'confirmar_entrega_despacho';
