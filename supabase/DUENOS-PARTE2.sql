-- ============================================================
--  DUENOS - PARTE 2: funciones de lectura del dueño
-- ============================================================
--  ESTE ARCHIVO DEPENDE DE DUENOS-PARTE1.sql
--
--  Si lo corres solo, revienta con:
--    ERROR: column p.dueno_id does not exist
--  porque la columna dueno_id y la tabla duenos las crea la
--  parte 1. Corré la parte 1 primero, una sola vez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_es_dueno()
RETURNS BOOLEAN AS $$
  SELECT public.get_user_rol() = 'dueno'
     AND EXISTS (
       SELECT 1
         FROM public.perfiles_usuario p
         JOIN public.duenos d ON d.id = p.dueno_id
        WHERE p.usuario_id = auth.uid()
          AND d.activo = TRUE
     );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_sucursales_dueno()
RETURNS INT[] AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT sd.sucursal_id
        FROM public.sucursal_duenos sd
        JOIN public.duenos d ON d.id = sd.dueno_id
       WHERE sd.dueno_id = (
         SELECT p.dueno_id
           FROM public.perfiles_usuario p
          WHERE p.usuario_id = auth.uid()
       )
         AND d.activo = TRUE
    ),
    '{}'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_dueno_id()
RETURNS INT AS $$
  SELECT CASE
    WHEN public.get_user_rol() = 'dueno' THEN p.dueno_id
    ELSE NULL
  END
  FROM public.perfiles_usuario p
 WHERE p.usuario_id = auth.uid()
 LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

SELECT p.proname, pg_get_function_result(p.oid) AS devuelve
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'get_user_dueno_id',
     'get_user_es_dueno',
     'get_user_sucursales_dueno'
   )
 ORDER BY p.proname;

