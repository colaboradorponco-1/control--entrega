-- ============================================================
--  BUCKET DE EVIDENCIAS + POLITICAS DE ACCESO
-- ------------------------------------------------------------
--  Corrige el error "Bucket not found" en el panel de despacho.
--  Crea (si no existe) el bucket privado 'evidencias' donde se
--  guardan las fotos y firmas, y define quien puede subir/ver.
--
--  Roles que suben: sucursal (recepcion), despachador (carga),
--  operador_planta (recepcion de pollo) y administrador.
--  Es seguro volver a ejecutarlo las veces que haga falta.
-- ============================================================

-- 1) Crear el bucket privado (5 MB, solo imagenes)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('evidencias', 'evidencias', FALSE, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) El administrador administra todos los archivos del bucket
DROP POLICY IF EXISTS evidencias_administrar ON storage.objects;
CREATE POLICY evidencias_administrar ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'evidencias' AND public.get_user_rol() = 'administrador')
  WITH CHECK (bucket_id = 'evidencias' AND public.get_user_rol() = 'administrador');

-- 3) Quien puede subir (INSERT)
DROP POLICY IF EXISTS evidencias_subir ON storage.objects;
CREATE POLICY evidencias_subir ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidencias'
    AND public.get_user_rol() IN ('sucursal', 'despachador', 'operador_planta', 'administrador')
  );

-- 4) Quien puede ver (SELECT)
DROP POLICY IF EXISTS evidencias_ver ON storage.objects;
CREATE POLICY evidencias_ver ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidencias'
    AND public.get_user_rol() IN ('administrador', 'operador_planta', 'despachador', 'sucursal')
  );

NOTIFY pgrst, 'reload schema';

-- 5) Verificacion: debe devolver una fila con id = 'evidencias'
SELECT id, name, public, file_size_limit, allowed_mime_types
  FROM storage.buckets
 WHERE id = 'evidencias';
