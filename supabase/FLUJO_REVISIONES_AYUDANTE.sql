INSERT INTO public.roles (nombre)
VALUES ('ayudante')
ON CONFLICT (nombre) DO NOTHING;

ALTER TABLE public.revisiones_dueno
  ADD COLUMN IF NOT EXISTS ayudante_usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estado_flujo TEXT NOT NULL DEFAULT 'ENVIADA_DUENO',
  ADD COLUMN IF NOT EXISTS enviada_dueno_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS videos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS area_atencion_cliente BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS area_personal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS area_comida BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS area_limpieza BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS area_infraestructura BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS monto_multa NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS area_atencion_cliente BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS area_personal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS area_comida BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS area_limpieza BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS area_infraestructura BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS documento_url TEXT;

ALTER TABLE public.revisiones_dueno
  ALTER COLUMN videos SET DEFAULT '{}';

UPDATE public.revisiones_dueno
SET videos = '{}'::TEXT[]
WHERE videos IS NULL;

ALTER TABLE public.revisiones_dueno
  ALTER COLUMN videos SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.revisiones_dueno'::regclass
      AND conname = 'revisiones_dueno_estado_flujo_check'
  ) THEN
    ALTER TABLE public.revisiones_dueno
      ADD CONSTRAINT revisiones_dueno_estado_flujo_check
      CHECK (estado_flujo IN ('PENDIENTE_AYUDANTE', 'ENVIADA_DUENO'));
  END IF;
END $$;

ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS videos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tipo_notificacion TEXT NOT NULL DEFAULT 'INFO';

DROP POLICY IF EXISTS "Videos de revisiones: actualizacion por staff" ON storage.objects;
CREATE POLICY "Videos de revisiones: actualizacion por staff"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'revisiones-videos'
    AND EXISTS (
      SELECT 1
      FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
        AND pu.rol_id IN (
          SELECT id FROM public.roles
          WHERE nombre IN ('administrador', 'superadministrador', 'ayudante')
        )
    )
  )
  WITH CHECK (
    bucket_id = 'revisiones-videos'
    AND EXISTS (
      SELECT 1
      FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
        AND pu.rol_id IN (
          SELECT id FROM public.roles
          WHERE nombre IN ('administrador', 'superadministrador', 'ayudante')
        )
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.notificaciones'::regclass
      AND conname = 'notificaciones_tipo_notificacion_check'
  ) THEN
    ALTER TABLE public.notificaciones
      ADD CONSTRAINT notificaciones_tipo_notificacion_check
      CHECK (tipo_notificacion IN ('INFO', 'REVISION', 'MULTA', 'ALERTA', 'REPORTE_ENTREGA', 'PEDIDO'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS revisiones_dueno_ayudante_estado_idx
  ON public.revisiones_dueno (ayudante_usuario_id, estado_flujo, creado_en DESC);

DROP FUNCTION IF EXISTS public.crear_revision_dueno(BIGINT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.crear_revision_dueno(BIGINT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT[]);
DROP FUNCTION IF EXISTS public.crear_revision_dueno(BIGINT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT[]);
DROP FUNCTION IF EXISTS public.crear_revision_dueno(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.crear_revision_dueno(
  p_dueno_id BIGINT,
  p_titulo TEXT,
  p_descripcion TEXT,
  p_tipo TEXT,
  p_sucursal_id BIGINT,
  p_area_atencion_cliente BOOLEAN,
  p_area_personal BOOLEAN,
  p_area_comida BOOLEAN,
  p_area_limpieza BOOLEAN,
  p_area_infraestructura BOOLEAN,
  p_documento_url TEXT,
  p_monto_multa NUMERIC,
  p_ayudante_usuario_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id BIGINT;
  v_nombre TEXT;
  v_dueno_usuario_id UUID;
  v_sucursal_nombre TEXT;
  v_tipo_notificacion TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.perfiles_usuario pu
    JOIN public.roles r ON r.id = pu.rol_id
    WHERE pu.usuario_id = auth.uid()
      AND r.nombre = 'superadministrador'
      AND pu.activo IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'Solo el superadministrador puede crear revisiones y multas.'
      USING ERRCODE = '42501';
  END IF;

  IF p_tipo NOT IN ('REVISION', 'MULTA', 'OBSERVACION', 'ALERTA') THEN
    RAISE EXCEPTION 'El tipo de revisión no es válido.';
  END IF;

  IF p_titulo IS NULL OR btrim(p_titulo) = ''
     OR p_descripcion IS NULL OR btrim(p_descripcion) = '' THEN
    RAISE EXCEPTION 'El título y la descripción son obligatorios.';
  END IF;

  IF p_tipo = 'MULTA' AND (p_monto_multa IS NULL OR p_monto_multa <= 0) THEN
    RAISE EXCEPTION 'La multa debe tener un monto mayor a cero.';
  END IF;

  IF p_tipo <> 'MULTA' AND p_monto_multa IS NOT NULL THEN
    RAISE EXCEPTION 'El monto solo corresponde a una multa.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.perfiles_usuario pu
    JOIN public.roles r ON r.id = pu.rol_id
    WHERE pu.usuario_id = p_ayudante_usuario_id
      AND r.nombre = 'ayudante'
      AND pu.activo IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'Selecciona un ayudante activo.';
  END IF;

  IF p_sucursal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sucursal_duenos sd
    WHERE sd.dueno_id = p_dueno_id
      AND sd.sucursal_id = p_sucursal_id
  ) THEN
    RAISE EXCEPTION 'La sucursal seleccionada no pertenece al dueño.';
  END IF;

  SELECT pu.usuario_id
    INTO v_dueno_usuario_id
  FROM public.perfiles_usuario pu
  JOIN public.roles r ON r.id = pu.rol_id
  WHERE pu.dueno_id = p_dueno_id
    AND r.nombre = 'dueno'
    AND pu.activo IS NOT FALSE
  LIMIT 1;

  IF v_dueno_usuario_id IS NULL THEN
    RAISE EXCEPTION 'El dueño seleccionado no tiene una cuenta activa para recibir el registro.';
  END IF;

  SELECT nombre_completo
    INTO v_nombre
  FROM public.perfiles_usuario
  WHERE usuario_id = auth.uid();

  SELECT nombre
    INTO v_sucursal_nombre
  FROM public.sucursales
  WHERE id = p_sucursal_id;

  v_tipo_notificacion := CASE
    WHEN p_tipo = 'OBSERVACION' THEN 'REVISION'
    ELSE p_tipo
  END;

  INSERT INTO public.revisiones_dueno (
    dueno_id, sucursal_id, titulo, descripcion, tipo, severidad, monto_multa,
    documento_url, videos, estado_flujo, ayudante_usuario_id, creado_por,
    creado_por_nombre, area_atencion_cliente, area_personal, area_comida,
    area_limpieza, area_infraestructura
  ) VALUES (
    p_dueno_id, p_sucursal_id, btrim(p_titulo), btrim(p_descripcion), p_tipo,
    CASE WHEN p_tipo = 'MULTA' THEN 'GRAVE' ELSE 'INFO' END,
    p_monto_multa, NULLIF(btrim(p_documento_url), ''), '{}',
    'PENDIENTE_AYUDANTE', p_ayudante_usuario_id, auth.uid(), v_nombre,
    COALESCE(p_area_atencion_cliente, FALSE), COALESCE(p_area_personal, FALSE),
    COALESCE(p_area_comida, FALSE), COALESCE(p_area_limpieza, FALSE),
    COALESCE(p_area_infraestructura, FALSE)
  ) RETURNING id INTO v_id;

  INSERT INTO public.notificaciones (
    tipo, tipo_notificacion, titulo, mensaje, videos, sucursal_id, sucursal_nombre,
    origen_usuario_id, origen_nombre, destinatario_usuario_id
  ) VALUES (
    p_tipo, v_tipo_notificacion, btrim(p_titulo),
    'Registro asignado por ' || COALESCE(v_nombre, 'el superadministrador')
      || '. Agrega la evidencia para enviarlo al dueño.',
    '{}', p_sucursal_id, v_sucursal_nombre,
    auth.uid(), v_nombre, p_ayudante_usuario_id
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enviar_evidencia_revision_dueno(
  p_revision_id BIGINT,
  p_video_url TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revision public.revisiones_dueno%ROWTYPE;
  v_ayudante_nombre TEXT;
  v_dueno_usuario_id UUID;
  v_sucursal_nombre TEXT;
  v_tipo_notificacion TEXT;
BEGIN
  IF p_video_url IS NULL OR btrim(p_video_url) !~* '^https?://' THEN
    RAISE EXCEPTION 'Adjunta un video o ingresa una URL válida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.perfiles_usuario pu
    JOIN public.roles r ON r.id = pu.rol_id
    WHERE pu.usuario_id = auth.uid()
      AND r.nombre = 'ayudante'
      AND pu.activo IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'Solo un ayudante activo puede enviar evidencia.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.revisiones_dueno
  SET videos = ARRAY[btrim(p_video_url)],
      estado_flujo = 'ENVIADA_DUENO',
      enviada_dueno_en = now()
  WHERE id = p_revision_id
    AND ayudante_usuario_id = auth.uid()
    AND estado_flujo = 'PENDIENTE_AYUDANTE'
  RETURNING * INTO v_revision;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El registro no existe, ya fue enviado o no está asignado a tu cuenta.'
      USING ERRCODE = '42501';
  END IF;

  SELECT nombre_completo
    INTO v_ayudante_nombre
  FROM public.perfiles_usuario
  WHERE usuario_id = auth.uid();

  SELECT pu.usuario_id
    INTO v_dueno_usuario_id
  FROM public.perfiles_usuario pu
  JOIN public.roles r ON r.id = pu.rol_id
  WHERE pu.dueno_id = v_revision.dueno_id
    AND r.nombre = 'dueno'
    AND pu.activo IS NOT FALSE
  LIMIT 1;

  IF v_dueno_usuario_id IS NULL THEN
    RAISE EXCEPTION 'El dueño ya no tiene una cuenta activa para recibir el registro.';
  END IF;

  SELECT nombre
    INTO v_sucursal_nombre
  FROM public.sucursales
  WHERE id = v_revision.sucursal_id;

  v_tipo_notificacion := CASE
    WHEN v_revision.tipo = 'OBSERVACION' THEN 'REVISION'
    ELSE v_revision.tipo
  END;

  INSERT INTO public.notificaciones (
    tipo, tipo_notificacion, titulo, mensaje, videos, sucursal_id, sucursal_nombre,
    origen_usuario_id, origen_nombre, destinatario_usuario_id, monto_multa,
    area_atencion_cliente, area_personal, area_comida, area_limpieza,
    area_infraestructura, documento_url
  ) VALUES (
    v_revision.tipo, v_tipo_notificacion, v_revision.titulo, v_revision.descripcion,
    v_revision.videos, v_revision.sucursal_id, v_sucursal_nombre,
    auth.uid(), v_ayudante_nombre, v_dueno_usuario_id, v_revision.monto_multa,
    v_revision.area_atencion_cliente, v_revision.area_personal,
    v_revision.area_comida, v_revision.area_limpieza,
    v_revision.area_infraestructura, v_revision.documento_url
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_revision_leida(p_revision_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.revisiones_dueno
  SET leido = TRUE, leido_en = now()
  WHERE id = p_revision_id
    AND estado_flujo = 'ENVIADA_DUENO'
    AND dueno_id IN (
      SELECT dueno_id
      FROM public.perfiles_usuario
      WHERE usuario_id = auth.uid()
    );
END;
$$;

DROP POLICY IF EXISTS revisiones_dueno_read ON public.revisiones_dueno;
CREATE POLICY revisiones_dueno_read ON public.revisiones_dueno
  FOR SELECT TO authenticated
  USING (
    (
      estado_flujo = 'ENVIADA_DUENO'
      AND dueno_id IN (
        SELECT dueno_id
        FROM public.perfiles_usuario
        WHERE usuario_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.perfiles_usuario pu
      JOIN public.roles r ON r.id = pu.rol_id
      WHERE pu.usuario_id = auth.uid()
        AND r.nombre IN ('administrador', 'superadministrador')
    )
    OR ayudante_usuario_id = auth.uid()
  );

DROP POLICY IF EXISTS revisiones_dueno_insert ON public.revisiones_dueno;
DROP POLICY IF EXISTS revisiones_dueno_update ON public.revisiones_dueno;
REVOKE INSERT, UPDATE, DELETE ON public.revisiones_dueno FROM authenticated;
GRANT SELECT ON public.revisiones_dueno TO authenticated;

REVOKE ALL ON FUNCTION public.crear_revision_dueno(BIGINT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_revision_dueno(BIGINT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, NUMERIC, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.enviar_evidencia_revision_dueno(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enviar_evidencia_revision_dueno(BIGINT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.marcar_revision_leida(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_revision_leida(BIGINT) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'revisiones_dueno'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.revisiones_dueno;
  END IF;
END $$;
