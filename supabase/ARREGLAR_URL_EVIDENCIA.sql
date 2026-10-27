
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('evidencias', 'evidencias', FALSE, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.get_user_rol_exacto()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.nombre
    FROM public.perfiles_usuario pu
    JOIN public.roles r ON r.id = pu.rol_id
   WHERE pu.usuario_id = auth.uid()
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_rol_exacto() TO authenticated;

DROP POLICY IF EXISTS evidencias_ver ON storage.objects;
CREATE POLICY evidencias_ver ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidencias'
    AND public.get_user_rol_exacto() IN ('administrador', 'operador_planta', 'despachador', 'sucursal', 'superadmin')
    AND (
      public.get_user_rol_exacto() <> 'superadmin'
      OR storage.objects.name NOT LIKE '%/observaciones/%'
    )
  );

DROP FUNCTION IF EXISTS public.url_evidencia(TEXT);
DROP FUNCTION IF EXISTS public.url_evidencia(TEXT, INT);

CREATE OR REPLACE FUNCTION public.url_evidencia(
  p_ruta TEXT,
  p_segundos INT DEFAULT 900
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_rol_exacto   TEXT;
  v_sucursal     INT;
  v_pedido       INT;
  v_url          TEXT;
  v_json         JSONB;
BEGIN
  IF p_ruta IS NULL OR btrim(p_ruta) = '' THEN
    RETURN NULL;
  END IF;

  IF p_ruta LIKE '%..%' THEN
    RAISE EXCEPTION 'Ruta de evidencia invalida';
  END IF;
  SELECT r.nombre, pu.sucursal_id
    INTO v_rol_exacto, v_sucursal
    FROM public.perfiles_usuario pu
    JOIN public.roles r ON r.id = pu.rol_id
   WHERE pu.usuario_id = auth.uid()
   LIMIT 1;

  IF v_rol_exacto IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF v_rol_exacto = 'sucursal' THEN

    BEGIN
      v_pedido := substring(p_ruta FROM '^pedido-([0-9]+)/')::INT;
    EXCEPTION WHEN others THEN
      v_pedido := NULL;
    END;

    IF v_pedido IS NULL THEN
      RAISE EXCEPTION 'No tienes permiso para ver esa evidencia';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.pedidos p
       WHERE p.id = v_pedido AND p.sucursal_id = v_sucursal
    ) THEN
      RAISE EXCEPTION 'No tienes permiso para ver esa evidencia';
    END IF;

  ELSIF v_rol_exacto = 'superadmin' THEN
  
    IF p_ruta LIKE '%/observaciones/%' THEN
      RAISE EXCEPTION 'No tienes permiso para ver esa evidencia';
    END IF;

  ELSIF v_rol_exacto NOT IN ('administrador', 'operador_planta', 'despachador') THEN
    RAISE EXCEPTION 'No tienes permiso para ver esa evidencia';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
     WHERE bucket_id = 'evidencias' AND name = p_ruta
  ) THEN
    RAISE EXCEPTION 'La evidencia no existe o fue borrada';
  END IF;

  BEGIN
    SELECT to_jsonb(s) INTO v_json
      FROM storage.create_signed_url(
        'evidencias',
        p_ruta,
        LEAST(GREATEST(COALESCE(p_segundos, 900), 60), 900)
      ) AS s;

    IF v_json IS NOT NULL THEN
      SELECT e.value INTO v_url
        FROM jsonb_each_text(v_json) e
       WHERE e.value LIKE 'http%'
       LIMIT 1;
    END IF;
  EXCEPTION WHEN others THEN
    v_url := NULL;
  END;

  IF v_url IS NULL THEN
    BEGIN
      v_url := storage.create_signed_url(
        'evidencias',
        p_ruta,
        LEAST(GREATEST(COALESCE(p_segundos, 900), 60), 900)
      );
    EXCEPTION WHEN others THEN
      v_url := NULL;
    END;
  END IF;

  IF v_url IS NULL THEN
    RAISE EXCEPTION 'No se pudo generar el enlace de la evidencia';
  END IF;

  RETURN v_url;
END;
$$;

GRANT EXECUTE ON FUNCTION public.url_evidencia(TEXT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS argumentos
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'url_evidencia'
 ORDER BY argumentos;
