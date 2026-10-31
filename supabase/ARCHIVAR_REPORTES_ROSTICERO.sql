-- ARCHIVADO DE REPORTES DE ROSTICERO
-- Permite archivar y eliminar reportes del rosticero.

-- 1. Agregar columnas de archivado
ALTER TABLE public.reportes_rosticero
  ADD COLUMN IF NOT EXISTS archivado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.reportes_rosticero
  ADD COLUMN IF NOT EXISTS archivado_en TIMESTAMPTZ;

-- 2. RPC para archivar/desarchivar
CREATE OR REPLACE FUNCTION public.archivar_reporte_rosticero(
  p_reporte_id BIGINT,
  p_archivado BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.perfiles_usuario pu
      JOIN public.roles r ON r.id = pu.rol_id
     WHERE pu.usuario_id = auth.uid()
       AND r.nombre = 'rosticero'
  ) THEN
    RAISE EXCEPTION 'Solo el rol rosticero puede administrar sus reportes.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.reportes_rosticero
  SET archivado = p_archivado,
      archivado_en = CASE WHEN p_archivado THEN now() ELSE NULL END,
      actualizado_en = now()
  WHERE id = p_reporte_id
    AND creado_por = auth.uid();
END;
$$;

-- 3. RPC para eliminar reporte archivado
CREATE OR REPLACE FUNCTION public.eliminar_reporte_rosticero(
  p_reporte_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.perfiles_usuario pu
      JOIN public.roles r ON r.id = pu.rol_id
     WHERE pu.usuario_id = auth.uid()
       AND r.nombre = 'rosticero'
  ) THEN
    RAISE EXCEPTION 'Solo el rol rosticero puede administrar sus reportes.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.reportes_rosticero
  WHERE id = p_reporte_id
  AND archivado = TRUE
  AND creado_por = auth.uid();
END;
$$;

-- 4. Realtime (ya existe, asegurar)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'reportes_rosticero'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.reportes_rosticero;
    END IF;
  END IF;
END $$;
