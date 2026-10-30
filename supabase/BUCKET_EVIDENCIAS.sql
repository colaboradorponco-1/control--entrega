INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('evidencias', 'evidencias', FALSE, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS evidencias_administrar ON storage.objects;
CREATE POLICY evidencias_administrar ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'evidencias' AND public.get_user_rol() = 'administrador')
  WITH CHECK (bucket_id = 'evidencias' AND public.get_user_rol() = 'administrador');

DROP POLICY IF EXISTS evidencias_subir ON storage.objects;
CREATE POLICY evidencias_subir ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidencias'
    AND public.get_user_rol() IN ('sucursal', 'despachador', 'operador_planta', 'administrador')
  );

DROP POLICY IF EXISTS evidencias_ver ON storage.objects;
CREATE POLICY evidencias_ver ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidencias'
    AND public.get_user_rol() IN ('administrador', 'operador_planta', 'despachador', 'sucursal')
  );

NOTIFY pgrst, 'reload schema';

SELECT id, name, public, file_size_limit, allowed_mime_types
  FROM storage.buckets
 WHERE id = 'evidencias';
