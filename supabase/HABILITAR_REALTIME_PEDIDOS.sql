-- Agrega pedidos a Realtime para que las sucursales reciban cambios
-- de estado sin esperar al refresco periodico del navegador.
-- Se puede ejecutar mas de una vez.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'No existe la publicacion supabase_realtime en este proyecto';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pedidos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
  END IF;
END
$$;
