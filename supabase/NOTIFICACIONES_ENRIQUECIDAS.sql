-- NOTIFICACIONES ENRIQUECIDAS (como bandeja de mensajes)
-- Agrega soporte de videos, documentos y unifica revisiones/multas como notificaciones.

-- 1. Agregar columnas de videos y tipo a notificaciones
ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS videos TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS tipo_notificacion TEXT NOT NULL DEFAULT 'INFO'
  CHECK (tipo_notificacion IN ('INFO', 'REVISION', 'MULTA', 'ALERTA', 'REPORTE_ENTREGA', 'PEDIDO'));

-- 2. RPC para crear notificación enriquecida (con videos)
CREATE OR REPLACE FUNCTION public.crear_notificacion_enriquecida(
  p_destinatario_usuario_id UUID,
  p_tipo TEXT DEFAULT 'INFO',
  p_titulo TEXT DEFAULT NULL,
  p_mensaje TEXT DEFAULT NULL,
  p_videos TEXT[] DEFAULT '{}',
  p_documento_url TEXT DEFAULT NULL,
  p_pedido_id INT DEFAULT NULL,
  p_sucursal_id INT DEFAULT NULL,
  p_sucursal_nombre TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id BIGINT;
  v_origen_nombre TEXT;
BEGIN
  IF p_titulo IS NULL OR btrim(p_titulo) = '' THEN
    RAISE EXCEPTION 'El titulo no puede estar vacio';
  END IF;

  SELECT nombre_completo INTO v_origen_nombre
  FROM public.perfiles_usuario WHERE usuario_id = auth.uid();

  INSERT INTO public.notificaciones (
    tipo, tipo_notificacion, titulo, mensaje, pedido_id, sucursal_id, sucursal_nombre,
    videos, origen_usuario_id, origen_nombre, destinatario_usuario_id
  ) VALUES (
    COALESCE(p_tipo, 'INFO'), COALESCE(p_tipo, 'INFO'), p_titulo, p_mensaje,
    p_pedido_id, p_sucursal_id, p_sucursal_nombre,
    p_videos, auth.uid(), v_origen_nombre, p_destinatario_usuario_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 3. Actualizar crear_revision_dueno para también crear notificación enriquecida
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
  v_usuario_id UUID;
BEGIN
  SELECT nombre_completo INTO v_nombre
  FROM public.perfiles_usuario WHERE usuario_id = auth.uid();

  -- Obtener usuario_id del dueño
  SELECT usuario_id INTO v_usuario_id
  FROM public.perfiles_usuario
  WHERE dueno_id = p_dueno_id
  LIMIT 1;

  INSERT INTO public.revisiones_dueno (
    dueno_id, titulo, descripcion, tipo, severidad, monto_multa, documento_url, videos, creado_por, creado_por_nombre
  ) VALUES (
    p_dueno_id, p_titulo, p_descripcion, p_tipo, p_severidad, p_monto_multa, p_documento_url, p_videos, auth.uid(), v_nombre
  ) RETURNING id INTO v_id;

  -- Crear notificación enriquecida para el dueño
  IF v_usuario_id IS NOT NULL THEN
    INSERT INTO public.notificaciones (
      tipo, tipo_notificacion, titulo, mensaje, videos, origen_usuario_id, origen_nombre, destinatario_usuario_id
    ) VALUES (
      COALESCE(p_tipo, 'REVISION'), COALESCE(p_tipo, 'REVISION'), p_titulo, p_descripcion,
      p_videos, auth.uid(), v_nombre, v_usuario_id
    );
  END IF;

  RETURN v_id;
END;
$$;

-- 4. Realtime para notificaciones (ya existe, asegurar)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notificaciones'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
    END IF;
  END IF;
END $$;
