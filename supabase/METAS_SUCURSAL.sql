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
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
        FROM public.perfiles_usuario pu
        JOIN public.roles r ON r.id = pu.rol_id
       WHERE pu.usuario_id = auth.uid()
         AND (
           r.nombre = 'administrador'
           OR (
             r.nombre = 'dueno'
             AND EXISTS (
               SELECT 1 FROM public.sucursal_duenos sd
                WHERE sd.sucursal_id = metas_sucursal.sucursal_id
                  AND sd.dueno_id = pu.dueno_id
             )
           )
         )
    )
  );

DROP POLICY IF EXISTS metas_write ON public.metas_sucursal;
CREATE POLICY metas_write ON public.metas_sucursal
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1
        FROM public.perfiles_usuario pu
        JOIN public.roles r ON r.id = pu.rol_id
       WHERE pu.usuario_id = auth.uid()
         AND (
           r.nombre = 'administrador'
           OR (
             r.nombre = 'dueno'
             AND EXISTS (
               SELECT 1 FROM public.sucursal_duenos sd
                WHERE sd.sucursal_id = metas_sucursal.sucursal_id
                  AND sd.dueno_id = pu.dueno_id
             )
           )
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.perfiles_usuario pu
        JOIN public.roles r ON r.id = pu.rol_id
       WHERE pu.usuario_id = auth.uid()
         AND (
           r.nombre = 'administrador'
           OR (
             r.nombre = 'dueno'
             AND EXISTS (
               SELECT 1 FROM public.sucursal_duenos sd
                WHERE sd.sucursal_id = metas_sucursal.sucursal_id
                  AND sd.dueno_id = pu.dueno_id
             )
           )
         )
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.metas_sucursal FROM anon, authenticated;
GRANT SELECT ON public.metas_sucursal TO authenticated;

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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol TEXT := public.get_user_rol();
  v_dueno_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para guardar una meta.'
      USING ERRCODE = '42501';
  END IF;
  IF v_rol IS NULL OR v_rol NOT IN ('dueno', 'administrador') THEN
    RAISE EXCEPTION 'Solo el dueño o el administrador puede guardar metas.'
      USING ERRCODE = '42501';
  END IF;
  IF p_sucursal_id IS NULL OR p_sucursal_id <= 0 THEN
    RAISE EXCEPTION 'Selecciona una sucursal válida.';
  END IF;
  IF p_mes IS NULL OR p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'El mes debe tener el formato AAAA-MM.';
  END IF;
  IF p_meta_unidades IS NULL OR p_meta_unidades < 0 THEN
    RAISE EXCEPTION 'La meta de unidades no puede ser negativa.';
  END IF;
  IF v_rol = 'dueno' THEN
    SELECT pu.dueno_id INTO v_dueno_id
      FROM public.perfiles_usuario pu
     WHERE pu.usuario_id = auth.uid();
    IF NOT EXISTS (
      SELECT 1
        FROM public.sucursal_duenos sd
       WHERE sd.sucursal_id = p_sucursal_id
         AND sd.dueno_id = v_dueno_id
    ) THEN
      RAISE EXCEPTION 'No tienes permiso para cambiar la meta de esta sucursal.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.metas_sucursal (sucursal_id, mes, meta_unidades, meta_kilos, actualizado_en)
  VALUES (p_sucursal_id, p_mes, p_meta_unidades, NULL, now())
  ON CONFLICT (sucursal_id, mes)
  DO UPDATE SET
    meta_unidades = p_meta_unidades,
    meta_kilos = NULL,
    actualizado_en = now();
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_meta_sucursal(BIGINT, TEXT, INTEGER, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_meta_sucursal(BIGINT, TEXT, INTEGER, NUMERIC) TO authenticated;

-- 4. Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'metas_sucursal'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.metas_sucursal;
  END IF;
END;
$$;
