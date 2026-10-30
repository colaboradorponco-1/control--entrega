-- PRESUPUESTOS Y METAS POR SUCURSAL
-- Permite definir metas mensuales de unidades por sucursal.

-- 1. Tabla de metas
CREATE TABLE IF NOT EXISTS public.metas_sucursal (
  id BIGSERIAL PRIMARY KEY,
  sucursal_id BIGINT NOT NULL REFERENCES public.sucursales(id),
  mes TEXT NOT NULL, -- formato YYYY-MM
  meta_unidades INTEGER NOT NULL DEFAULT 0,
  meta_kilos NUMERIC(10,2),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sucursal_id, mes)
);

-- 2. RLS
ALTER TABLE public.metas_sucursal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metas_read ON public.metas_sucursal;
CREATE POLICY metas_read ON public.metas_sucursal
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('dueno', 'administrador'))
    )
  );

DROP POLICY IF EXISTS metas_write ON public.metas_sucursal;
CREATE POLICY metas_write ON public.metas_sucursal
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.perfiles_usuario pu
      WHERE pu.usuario_id = auth.uid()
      AND pu.rol_id IN (SELECT id FROM public.roles WHERE nombre IN ('dueno', 'administrador'))
    )
  );

-- 3. RPC para guardar/actualizar meta
CREATE OR REPLACE FUNCTION public.guardar_meta_sucursal(
  p_sucursal_id BIGINT,
  p_mes TEXT,
  p_meta_unidades INTEGER,
  p_meta_kilos NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.metas_sucursal (sucursal_id, mes, meta_unidades, meta_kilos, actualizado_en)
  VALUES (p_sucursal_id, p_mes, p_meta_unidades, p_meta_kilos, now())
  ON CONFLICT (sucursal_id, mes)
  DO UPDATE SET
    meta_unidades = p_meta_unidades,
    meta_kilos = p_meta_kilos,
    actualizado_en = now();
END;
$$;

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.metas_sucursal;
