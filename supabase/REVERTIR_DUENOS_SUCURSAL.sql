

CREATE OR REPLACE FUNCTION public.get_user_sucursal()
RETURNS INT AS $$
  SELECT p.sucursal_id
    FROM public.perfiles_usuario p
   WHERE p.usuario_id = auth.uid()
   LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- para confirmar que quedo como la original
SELECT pg_get_functiondef('public.get_user_sucursal()'::regprocedure) AS definicion;

NOTIFY pgrst, 'reload schema';