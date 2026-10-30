-- REVISIONES Y MULTAS PARA DUEÑOS
-- El superadministrador y el administrador crean revisiones/multas
-- que llegan como notificación al dueño con un documento detallado.

-- 1. Tabla de revisiones
CREATE TABLE IF NOT EXISTS public.revisiones_dueno (
  id BIGSERIAL PRIMARY KEY,
  dueno_id BIGINT NOT NULL REFERENCES public.duenos(id),
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'REVISION' CHECK (tipo IN ('REVISION', 'MULTA', 'OBSERVACION', 'ALERTA')),
  severidad TEXT NOT NULL DEFAULT 'INFO' CHECK (severidad IN ('INFO', 'ADVERTENCIA', 'GRAVE')),
  monto_multa NUMERIC(10,2),
  documento_url TEXT,
  leido BOOLEAN NOT NULL DEFAULT FALSE,
  leido_en TIMESTAMPTZ,
  creado_por UUID REFERENCES auth.users(id),
  creado_por_nombre TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.revisiones_dueno ENABLE ROW LEVEL SECURITY;

-- El dueño ve solo sus revisiones
DROP POLICY IF EXISTS revisiones_dueno_read ON public.revisiones_dueno;
CREATE POLICY revisiones_dueno_read ON public.revisiones_dueno
  FOR SELECT USING (
    dueno_id IN (SELECT dueno_id FROM public.perfiles_usuario WHERE usuario_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('administrador', 'superadministrador'))
    )
  );

-- Solo admin/superadmin pueden crear
DROP POLICY IF EXISTS revisiones_dueno_insert ON public.revisiones_dueno;
CREATE POLICY revisiones_dueno_insert ON public.revisiones_dueno
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('administrador', 'superadministrador'))
    )
  );

-- Solo admin/superadmin pueden actualizar
DROP POLICY IF EXISTS revisiones_dueno_update ON public.revisiones_dueno;
CREATE POLICY revisiones_dueno_update ON public.revisiones_dueno
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('administrador', 'superadministrador'))
    )
    OR dueno_id IN (SELECT dueno_id FROM public.perfiles_usuario WHERE usuario_id = auth.uid())
  );

-- 3. RPC para crear revisión
CREATE OR REPLACE FUNCTION public.crear_revision_dueno(
  p_dueno_id BIGINT,
  p_titulo TEXT,
  p_descripcion TEXT,
  p_tipo TEXT DEFAULT 'REVISION',
  p_severidad TEXT DEFAULT 'INFO',
  p_monto_multa NUMERIC DEFAULT NULL,
  p_documento_url TEXT DEFAULT NULL
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
    dueno_id, titulo, descripcion, tipo, severidad, monto_multa, documento_url, creado_por, creado_por_nombre
  ) VALUES (
    p_dueno_id, p_titulo, p_descripcion, p_tipo, p_severidad, p_monto_multa, p_documento_url, auth.uid(), v_nombre
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 4. RPC para marcar como leída
CREATE OR REPLACE FUNCTION public.marcar_revision_leida(p_revision_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.revisiones_dueno
  SET leido = TRUE, leido_en = now()
  WHERE id = p_revision_id
  AND dueno_id IN (SELECT dueno_id FROM public.perfiles_usuario WHERE usuario_id = auth.uid());
END;
$$;

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.revisiones_dueno;
