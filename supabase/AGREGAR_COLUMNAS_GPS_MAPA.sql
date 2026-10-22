-- Agrega las coordenadas que consulta el mapa general del administrador.
-- Es seguro ejecutarlo mas de una vez.

ALTER TABLE public.recepcion_pollo
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

ALTER TABLE public.despacho_pollo
  ADD COLUMN IF NOT EXISTS transportista TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

ALTER TABLE public.pedido_recepciones
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitud NUMERIC(10,7);

NOTIFY pgrst, 'reload schema';
