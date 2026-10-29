-- ============================================================
--  SEMÁFORO DE STOCK — Panel del dueño
-- ============================================================
--  Ejecutar en el SQL Editor de Supabase.
--
--  1) Agrega el mínimo de unidades por sucursal.
--  2) Hace que el dueño reciba ese mínimo en su lista de sucursales,
--     para poder compararlo contra el inventario de planta.
--
--  El mínimo lo define el administrador en:
--  Administración → Sucursales → Stock mínimo (Alerta)
-- ============================================================

-- 1) Columna stock_minimo -------------------------------------
ALTER TABLE public.sucursales
  ADD COLUMN IF NOT EXISTS stock_minimo INT NOT NULL DEFAULT 0;

ALTER TABLE public.sucursales
  DROP CONSTRAINT IF EXISTS sucursales_stock_minimo_check;

ALTER TABLE public.sucursales
  ADD CONSTRAINT sucursales_stock_minimo_check CHECK (stock_minimo >= 0);

-- 2) Lista de sucursales del dueño, ahora con stock_minimo -----
DROP FUNCTION IF EXISTS public.listar_sucursales_pedido_dueno();

CREATE OR REPLACE FUNCTION public.listar_sucursales_pedido_dueno()
RETURNS TABLE (id INT, nombre TEXT, sector TEXT, stock_minimo INT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.id, s.nombre, s.sector, COALESCE(s.stock_minimo, 0)
  FROM public.sucursales s
  JOIN public.sucursal_duenos sd ON sd.sucursal_id = s.id
  WHERE public.get_user_es_dueno()
    AND sd.dueno_id = public.get_user_dueno_id()
  ORDER BY s.nombre;
$$;

GRANT EXECUTE ON FUNCTION public.listar_sucursales_pedido_dueno() TO authenticated;

-- 3) Realtime para que el panel se actualice en vivo -----------
--    (sucursales: cambios de stock_minimo; inventario: stock de planta)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'sucursales'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.sucursales;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'control_inventario_diario'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.control_inventario_diario;
    END IF;
  END IF;
END $$;
