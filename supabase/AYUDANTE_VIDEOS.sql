-- AYUDANTE: agregar soporte de videos a revisiones_dueno
-- El ayudante revisa establecimientos y envía videos como evidencia.
a
-- 1. Agregar columna de videos (array de URLs)
ALTER TABLE public.revisiones_dueno
  ADD COLUMN IF NOT EXISTS videos TEXT[] DEFAULT '{}';

-- 2. Actualizar RPC para incluir videos
CREATE OR REPLACE FUNCTION public.crear_revision_dueno(
  p_dueno_id BIGINT,
  p_titulo TEXT,
  p_descripcion TEXT,
  p_tipo TEXT DEFAULT 'REVISION',
  p_severidad TEXT DEFAULT 'INFO',
  p_monto_multa NUMERIC DEFAULT NULL,
  p_documento_url TEXT DEFAULT NULL,
  p_videos TEXT[] DEFAULT '{}'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id BIGINT;
  v_nombre TEXT;
BEGIN
  SELECT nombre_completo INTO v_nombre
  FROM public.perfiles_usuario WHERE usuario_id = auth.uid();

  INSERT INTO public.revisiones_dueno (
    dueno_id, titulo, descripcion, tipo, severidad, monto_multa, documento_url, videos, creado_por, creado_por_nombre
  ) VALUES (
    p_dueno_id, p_titulo, p_descripcion, p_tipo, p_severidad, p_monto_multa, p_documento_url, p_videos, auth.uid(), v_nombre
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 3. Asegurar que el rol ayudante existe
INSERT INTO public.roles (nombre) VALUES ('ayudante') ON CONFLICT (nombre) DO NOTHING;
