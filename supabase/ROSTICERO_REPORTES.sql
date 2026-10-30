-- ROLES Y REPORTES DE ROSTICERO
-- Agrega los roles 'rosticero' y 'ayudante' y la tabla de reportes diarios.

-- 1. Asegurar que los roles existan
INSERT INTO public.roles (nombre) VALUES ('rosticero') ON CONFLICT (nombre) DO NOTHING;
INSERT INTO public.roles (nombre) VALUES ('ayudante') ON CONFLICT (nombre) DO NOTHING;

-- 2. Tabla de reportes diarios de rosticero
CREATE TABLE IF NOT EXISTS public.reportes_rosticero (
  id BIGSERIAL PRIMARY KEY,
  sucursal_id BIGINT NOT NULL REFERENCES public.sucursales(id),
  fecha DATE NOT NULL,
  hora_ingreso TIME,
  saldo_inicio_dia INTEGER NOT NULL DEFAULT 0,
  ingresos_dia INTEGER NOT NULL DEFAULT 0,
  total_pollos_hornear INTEGER GENERATED ALWAYS AS (saldo_inicio_dia + ingresos_dia) STORED,
  saldo_final_dia INTEGER NOT NULL DEFAULT 0,
  pollos_vendidos INTEGER GENERATED ALWAYS AS (saldo_inicio_dia + ingresos_dia - saldo_final_dia) STORED,
  pollos_vendidos_sistema INTEGER,
  obs_pollos_enfermos BOOLEAN NOT NULL DEFAULT FALSE,
  obs_pollos_pequenos BOOLEAN NOT NULL DEFAULT FALSE,
  obs_otros BOOLEAN NOT NULL DEFAULT FALSE,
  observaciones_detalle TEXT,
  cajero TEXT,
  supervisor TEXT,
  creado_por UUID REFERENCES auth.users(id),
  creado_por_nombre TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. RLS
ALTER TABLE public.reportes_rosticero ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reportes_rosticero_read ON public.reportes_rosticero;
CREATE POLICY reportes_rosticero_read ON public.reportes_rosticero
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('administrador', 'superadministrador', 'ayudante', 'rosticero', 'dueno'))
    )
  );

DROP POLICY IF EXISTS reportes_rosticero_insert ON public.reportes_rosticero;
CREATE POLICY reportes_rosticero_insert ON public.reportes_rosticero
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('rosticero', 'administrador', 'superadministrador'))
    )
  );

DROP POLICY IF EXISTS reportes_rosticero_delete ON public.reportes_rosticero;
CREATE POLICY reportes_rosticero_delete ON public.reportes_rosticero
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('administrador', 'superadministrador'))
    )
    OR creado_por = auth.uid()
  );

-- 4. RPC para crear reporte
CREATE OR REPLACE FUNCTION public.crear_reporte_rosticero(
  p_sucursal_id BIGINT,
  p_fecha DATE,
  p_hora_ingreso TIME,
  p_saldo_inicio_dia INTEGER,
  p_ingresos_dia INTEGER,
  p_saldo_final_dia INTEGER,
  p_pollos_vendidos_sistema INTEGER,
  p_obs_pollos_enfermos BOOLEAN,
  p_obs_pollos_pequenos BOOLEAN,
  p_obs_otros BOOLEAN,
  p_observaciones_detalle TEXT,
  p_cajero TEXT,
  p_supervisor TEXT
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

  INSERT INTO public.reportes_rosticero (
    sucursal_id, fecha, hora_ingreso, saldo_inicio_dia, ingresos_dia,
    saldo_final_dia, pollos_vendidos_sistema,
    obs_pollos_enfermos, obs_pollos_pequenos, obs_otros,
    observaciones_detalle, cajero, supervisor, creado_por, creado_por_nombre
  ) VALUES (
    p_sucursal_id, p_fecha, p_hora_ingreso, p_saldo_inicio_dia, p_ingresos_dia,
    p_saldo_final_dia, p_pollos_vendidos_sistema,
    p_obs_pollos_enfermos, p_obs_pollos_pequenos, p_obs_otros,
    p_observaciones_detalle, p_cajero, p_supervisor, auth.uid(), v_nombre
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 5. Realtime (solo si no esta ya en la publicacion)
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
