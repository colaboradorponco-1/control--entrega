-- ============================================================
--  ARREGLAR: ver las fotos de evidencia
-- ------------------------------------------------------------
--  La base tiene 'verificar_archivo' y 'validar_fotos_extra'
--  (ARREGLAR_HELPERS_EVIDENCIA.sql), pero NO tiene la funcion que
--  devuelve el enlace de una foto. Sin ella el boton "Ver foto"
--  responde "Could not find the function public.url_evidencia".
--
--  Esta funcion devuelve un enlace con caducidad de una foto o
--  firma del bucket privado 'evidencias'.
--
--  Quién puede ver qué:
--    - sucursal: solo la evidencia de los pedidos de su sucursal
--    - administrador, planta, despacho: toda la evidencia
--    - superadmin: toda la evidencia MENOS la de los reportes de
--      entrega ('/observaciones/'), que son del administrador
--    - dueno y demás: nada
--
--  Requiere:
--    - bucket privado 'evidencias'  (BUCKET_EVIDENCIAS.sql)
--
--  Es seguro correrlo varias veces.
-- ============================================================

-- 1) El bucket tiene que existir (por si nunca se creo)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('evidencias', 'evidencias', FALSE, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) El rol exacto del usuario
--    get_user_rol() devuelve 'administrador' tambien para el
--    superadmin, asi que para separarlos hace falta el nombre del
--    rol tal cual esta en la tabla public.roles.
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

-- 3) Politicas del bucket: quien puede ver
--    El rol se compara con el nombre exacto: get_user_rol() devuelve
--    'administrador' tambien para el superadmin, y asi el superadmin
--    terminaba viendo las fotos de los reportes de entrega
--    ('pedido-<id>/observaciones/'), que son del administrador.
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

-- 4) La funcion que devuelve el enlace
-- Se borran todas las versiones de la RPC por su OID (no por firma):
-- si queda una con otro tipo de retorno, el CREATE de abajo falla
-- con "cannot change return type of existing function".
DO $$
DECLARE
  v_oid OID;
BEGIN
  FOR v_oid IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'url_evidencia'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', v_oid::regprocedure);
  END LOOP;
END $$;

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

  -- El rol exacto, sin el mapeo de get_user_rol(): el superadmin
  -- tiene que quedar afuera de los reportes de entrega.
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
    -- solo la evidencia de los pedidos de su sucursal
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
    -- El superadmin ve toda la evidencia operativa, pero los
    -- reportes de entrega con el estado del pollo son del
    -- administrador: de ahi no puede verlos.
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

  -- El enlace no vive mas de 15 minutos. Segun la version de
  -- Supabase, create_signed_url devuelve un texto o una tabla con
  -- una columna: por eso se prueban las dos formas.
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

-- Verificacion: debe existir una sola version con 2 argumentos
-- (la de 1 es la misma con el segundo por defecto)
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS argumentos
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'url_evidencia'
 ORDER BY argumentos;
