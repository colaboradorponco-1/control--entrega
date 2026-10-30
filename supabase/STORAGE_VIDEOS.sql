-- STORAGE BUCKET PARA VIDEOS DE REVISIONES
-- Crea un bucket de storage para videos de evidencia de revisiones/multas.

-- 1. Crear bucket (si no existe)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('revisiones-videos', 'revisiones-videos', true, 52428800, ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'])
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas de storage
-- Lectura pública
DROP POLICY IF EXISTS "Videos de revisiones: lectura publica" ON storage.objects;
CREATE POLICY "Videos de revisiones: lectura publica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'revisiones-videos');

-- Subida solo por admin/superadmin/ayudante
DROP POLICY IF EXISTS "Videos de revisiones: subida por staff" ON storage.objects;
CREATE POLICY "Videos de revisiones: subida por staff"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'revisiones-videos'
    AND EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('administrador', 'superadministrador', 'ayudante'))
    )
  );

-- Eliminación por admin/superadmin
DROP POLICY IF EXISTS "Videos de revisiones: eliminacion por admin" ON storage.objects;
CREATE POLICY "Videos de revisiones: eliminacion por admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'revisiones-videos'
    AND EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('administrador', 'superadministrador'))
    )
  );
