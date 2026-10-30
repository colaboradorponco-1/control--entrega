-- ============================================================
--  PERFIL DEL USUARIO: FOTO, AVATAR, CORREO Y CONTRASENA
-- ------------------------------------------------------------
--  1) Columnas de foto y avatar en perfiles_usuario
--  2) Trigger que impide que alguien se cambie su propio rol
--  3) RPC actualizar_mi_perfil (nombre, foto, avatar)
--  4) Bucket privado 'avatares' con sus policies
--  5) RPC url_avatar (enlace temporal a la foto)
--
--  El avatar se guarda como "estilo + semilla" y se dibuja en el
--  navegador con DiceBear: no depende de internet ni de una foto.
--
--  El correo y la contraseña los cambia Supabase (updateUser), no
--  hace falta nada en la base para eso.
--
--  Ejecutar en Supabase > SQL Editor. Es seguro correrlo dos veces.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Columnas de la foto y del avatar
-- ------------------------------------------------------------
ALTER TABLE public.perfiles_usuario
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_estilo TEXT,
  ADD COLUMN IF NOT EXISTS avatar_semilla TEXT;

-- ------------------------------------------------------------
-- 2) El rol y la sucursal no se tocan desde el perfil
--    (si no, un usuario podria quedarse administrador con un
--    UPDATE normal)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.perfiles_proteger_campos_sensibles()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.usuario_id = OLD.usuario_id
     AND auth.uid() = OLD.usuario_id
     AND COALESCE(public.get_user_rol_exacto(), '') <> 'administrador' THEN

    IF NEW.rol_id IS DISTINCT FROM OLD.rol_id THEN
      RAISE EXCEPTION 'El rol no se puede cambiar desde el perfil';
    END IF;

    IF NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id THEN
      RAISE EXCEPTION 'La sucursal no se puede cambiar desde el perfil';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS perfiles_proteger_campos ON public.perfiles_usuario;
CREATE TRIGGER perfiles_proteger_campos
  BEFORE UPDATE ON public.perfiles_usuario
  FOR EACH ROW
  EXECUTE FUNCTION public.perfiles_proteger_campos_sensibles();

-- ------------------------------------------------------------
-- 3) La RPC que guarda los datos del perfil
-- ------------------------------------------------------------
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

-- Se borran las funciones viejas por su OID (no por firma): si
-- queda una version con otro tipo de retorno, el CREATE falla con
-- "cannot change return type of existing function".
DO $$
DECLARE
  v_oid OID;
BEGIN
  FOR v_oid IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('actualizar_mi_perfil', 'url_avatar')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', v_oid::regprocedure);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.actualizar_mi_perfil(
  p_nombre TEXT DEFAULT NULL,
  p_foto_url TEXT DEFAULT NULL,
  p_avatar_estilo TEXT DEFAULT NULL,
  p_avatar_semilla TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol TEXT;
  v_nombre TEXT;
  v_foto TEXT;
  v_estilo TEXT;
  v_semilla TEXT;
BEGIN
  v_rol := public.get_user_rol_exacto();
  IF v_rol IS NULL THEN
    RAISE EXCEPTION 'Tu usuario no tiene perfil';
  END IF;

  -- El nombre: se recorta y se limita el tamano.
  IF p_nombre IS NOT NULL THEN
    v_nombre := NULLIF(btrim(p_nombre), '');
    IF v_nombre IS NULL THEN
      RAISE EXCEPTION 'El nombre no puede quedar vacio';
    END IF;
    IF length(v_nombre) > 120 THEN
      RAISE EXCEPTION 'El nombre es muy largo (maximo 120 caracteres)';
    END IF;
  END IF;

  -- La foto: '' la borra, null la deja como estaba.
  IF p_foto_url IS NOT NULL THEN
    v_foto := CASE
      WHEN btrim(p_foto_url) = '' THEN NULL
      ELSE btrim(p_foto_url)
    END;
    -- La foto tiene que estar en el bucket de avatares y en la
    -- carpeta del propio usuario.
    IF v_foto IS NOT NULL AND v_foto NOT LIKE auth.uid()::text || '/%' THEN
      RAISE EXCEPTION 'La foto no pertenece a tu usuario';
    END IF;
  END IF;

  IF p_avatar_estilo IS NOT NULL THEN
    v_estilo := NULLIF(btrim(p_avatar_estilo), '');
    IF v_estilo IS NOT NULL AND length(v_estilo) > 40 THEN
      RAISE EXCEPTION 'El estilo de avatar no es valido';
    END IF;
  END IF;

  IF p_avatar_semilla IS NOT NULL THEN
    v_semilla := NULLIF(btrim(p_avatar_semilla), '');
    IF v_semilla IS NOT NULL AND length(v_semilla) > 60 THEN
      RAISE EXCEPTION 'La semilla del avatar no es valida';
    END IF;
  END IF;

  UPDATE public.perfiles_usuario
     SET nombre_completo = COALESCE(v_nombre, nombre_completo),
         foto_url = CASE WHEN p_foto_url IS NOT NULL THEN v_foto ELSE foto_url END,
         avatar_estilo = CASE WHEN p_avatar_estilo IS NOT NULL THEN v_estilo ELSE avatar_estilo END,
         avatar_semilla = CASE WHEN p_avatar_semilla IS NOT NULL THEN v_semilla ELSE avatar_semilla END
   WHERE usuario_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontro tu perfil';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id', pu.id,
      'nombre_completo', pu.nombre_completo,
      'foto_url', pu.foto_url,
      'avatar_estilo', pu.avatar_estilo,
      'avatar_semilla', pu.avatar_semilla
    )
    FROM public.perfiles_usuario pu
    WHERE pu.usuario_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.actualizar_mi_perfil(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 4) Bucket privado de avatares
--    Cada usuario sube a su propia carpeta: <usuario_id>/archivo
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatares', 'avatares', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS avatares_insert ON storage.objects;
CREATE POLICY avatares_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatares'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatares_select ON storage.objects;
CREATE POLICY avatares_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatares'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR COALESCE(public.get_user_rol_exacto(), '') = 'administrador'
    )
  );

DROP POLICY IF EXISTS avatares_delete ON storage.objects;
CREATE POLICY avatares_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatares'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------
-- 5) Enlace temporal a la foto de perfil
-- ------------------------------------------------------------
-- (la RPC url_avatar se borra junto con las de arriba)

CREATE OR REPLACE FUNCTION public.url_avatar(
  p_ruta TEXT,
  p_segundos INT DEFAULT 900
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_carpeta TEXT;
BEGIN
  IF p_ruta IS NULL OR btrim(p_ruta) = '' THEN
    RETURN NULL;
  END IF;

  v_carpeta := split_part(btrim(p_ruta), '/', 1);

  IF v_carpeta IS DISTINCT FROM auth.uid()::text
     AND COALESCE(public.get_user_rol_exacto(), '') <> 'administrador' THEN
    RAISE EXCEPTION 'Esa foto no es tuya';
  END IF;

  RETURN (
    SELECT (storage.create_signed_url(
      'avatares',
      btrim(p_ruta),
      GREATEST(60, LEAST(COALESCE(p_segundos, 900), 3600))
    )).signed_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.url_avatar(TEXT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'perfiles_usuario'
   AND column_name IN ('foto_url', 'avatar_estilo', 'avatar_semilla')
 ORDER BY column_name;

SELECT id, name, public FROM storage.buckets WHERE id = 'avatares';

SELECT policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'storage'
   AND tablename = 'objects'
   AND policyname LIKE 'avatares%'
 ORDER BY policyname;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('actualizar_mi_perfil', 'url_avatar')
 ORDER BY p.proname;
