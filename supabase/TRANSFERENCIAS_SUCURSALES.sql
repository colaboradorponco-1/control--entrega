-- TRANSFERENCIAS ENTRE SUCURSALES
-- Permite mover stock de una sucursal a otra con aprobación del dueño.

-- 1. Tabla de transferencias
CREATE TABLE IF NOT EXISTS public.transferencias_sucursal (
  id BIGSERIAL PRIMARY KEY,
  sucursal_origen_id BIGINT NOT NULL REFERENCES public.sucursales(id),
  sucursal_destino_id BIGINT NOT NULL REFERENCES public.sucursales(id),
  unidades INTEGER NOT NULL CHECK (unidades > 0),
  kilos NUMERIC(10,2),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'COMPLETADO')),
  motivo TEXT,
  solicitado_por UUID REFERENCES auth.users(id),
  aprobado_por UUID REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_diferentes CHECK (sucursal_origen_id <> sucursal_destino_id)
);

-- 2. RLS
ALTER TABLE public.transferencias_sucursal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transferencias_read ON public.transferencias_sucursal;
CREATE POLICY transferencias_read ON public.transferencias_sucursal
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('dueno', 'administrador'))
    )
  );

DROP POLICY IF EXISTS transferencias_insert ON public.transferencias_sucursal;
CREATE POLICY transferencias_insert ON public.transferencias_sucursal
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('dueno', 'administrador'))
    )
  );

DROP POLICY IF EXISTS transferencias_update ON public.transferencias_sucursal;
CREATE POLICY transferencias_update ON public.transferencias_sucursal
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('dueno', 'administrador'))
    )
  );

-- 3. RPC para solicitar transferencia
CREATE OR REPLACE FUNCTION public.solicitar_transferencia(
  p_sucursal_origen BIGINT,
  p_sucursal_destino BIGINT,
  p_unidades INTEGER,
  p_kilos NUMERIC DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id BIGINT;
  v_dueno_id BIGINT;
BEGIN
  -- Verificar que ambas sucursales pertenecen al mismo dueño
  SELECT dueno_id INTO v_dueno_id
  FROM public.sucursales WHERE id = p_sucursal_origen;

  IF v_dueno_id IS NULL OR v_dueno_id <> (SELECT dueno_id FROM public.sucursales WHERE id = p_sucursal_destino) THEN
    RAISE EXCEPTION 'Las sucursales deben pertenecer al mismo dueño';
  END IF;

  INSERT INTO public.transferencias_sucursal (
    sucursal_origen_id, sucursal_destino_id, unidades, kilos, motivo, solicitado_por
  ) VALUES (
    p_sucursal_origen, p_sucursal_destino, p_unidades, p_kilos, p_motivo, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 4. RPC para aprobar/rechazar transferencia
CREATE OR REPLACE FUNCTION public.responder_transferencia(
  p_transferencia_id BIGINT,
  p_aprobar BOOLEAN,
  p_motivo TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_aprobar THEN
    UPDATE public.transferencias_sucursal
    SET estado = 'APROBADO', aprobado_por = auth.uid(), actualizado_en = now()
    WHERE id = p_transferencia_id AND estado = 'PENDIENTE';
  ELSE
    UPDATE public.transferencias_sucursal
    SET estado = 'RECHAZADO', motivo = COALESCE(p_motivo, motivo), aprobado_por = auth.uid(), actualizado_en = now()
    WHERE id = p_transferencia_id AND estado = 'PENDIENTE';
  END IF;
END;
$$;

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.transferencias_sucursal;
