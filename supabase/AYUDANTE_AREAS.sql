-- AYUDANTE: campos de área y sucursal en revisiones_dueno

-- 1. Agregar columnas
ALTER TABLE public.revisiones_dueno
  ADD COLUMN IF NOT EXISTS sucursal_id BIGINT REFERENCES public.sucursales(id);

ALTER TABLE public.revisiones_dueno
  ADD COLUMN IF NOT EXISTS area_atencion_cliente BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.revisiones_dueno
  ADD COLUMN IF NOT EXISTS area_personal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.revisiones_dueno
  ADD COLUMN IF NOT EXISTS area_comida BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.revisiones_dueno
  ADD COLUMN IF NOT EXISTS area_limpieza BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.revisiones_dueno
  ADD COLUMN IF NOT EXISTS area_infraestructura BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Actualizar RPC
CREATE OR REPLACE FUNCTION public.crear_revision_dueno(
  p_dueno_id BIGINT,
  p_titulo TEXT,
  p_descripcion TEXT,
  p_tipo TEXT DEFAULT 'REVISION',
  p_sucursal_id BIGINT DEFAULT NULL,
  p_area_atencion_cliente BOOLEAN DEFAULT FALSE,
  p_area_personal BOOLEAN DEFAULT FALSE,
  p_area_comida BOOLEAN DEFAULT FALSE,
  p_area_limpieza BOOLEAN DEFAULT FALSE,
  p_area_infraestructura BOOLEAN DEFAULT FALSE,
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
  IF NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede crear revisiones y multas.'
      USING ERRCODE = '42501';
  END IF;

  SELECT nombre_completo INTO v_nombre
  FROM public.perfiles_usuario WHERE usuario_id = auth.uid();

  SELECT usuario_id INTO v_usuario_id
  FROM public.perfiles_usuario
  WHERE dueno_id = p_dueno_id
  LIMIT 1;

  INSERT INTO public.revisiones_dueno (
    dueno_id, sucursal_id, titulo, descripcion, tipo,
    area_atencion_cliente, area_personal, area_comida, area_limpieza, area_infraestructura,
    documento_url, videos, creado_por, creado_por_nombre
  ) VALUES (
    p_dueno_id, p_sucursal_id, p_titulo, p_descripcion, p_tipo,
    p_area_atencion_cliente, p_area_personal, p_area_comida, p_area_limpieza, p_area_infraestructura,
    p_documento_url, p_videos, auth.uid(), v_nombre
  ) RETURNING id INTO v_id;

  IF v_usuario_id IS NOT NULL THEN
    INSERT INTO public.notificaciones (
      tipo, tipo_notificacion, titulo, mensaje, videos, origen_usuario_id, origen_nombre, destinatario_usuario_id, sucursal_id
    ) VALUES (
      COALESCE(p_tipo, 'REVISION'), COALESCE(p_tipo, 'REVISION'), p_titulo, p_descripcion,
      p_videos, auth.uid(), v_nombre, v_usuario_id, p_sucursal_id
    );
  END IF;

  RETURN v_id;
END;
$$;
