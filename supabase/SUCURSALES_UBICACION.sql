
ALTER TABLE public.sucursales
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS map_url TEXT;

COMMENT ON COLUMN public.sucursales.latitude IS
  'Latitud GPS de la sucursal para visualizacion de rutas.';
COMMENT ON COLUMN public.sucursales.longitude IS
  'Longitud GPS de la sucursal para visualizacion de rutas.';

NOTIFY pgrst, 'reload schema';
