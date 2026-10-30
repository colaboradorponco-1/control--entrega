SELECT p.id,
       p.nombre_completo,
       s.nombre AS sucursal_asignada,
       s.sector AS ruta
  FROM public.perfiles_usuario p
  JOIN public.roles r ON r.id = p.rol_id
  LEFT JOIN public.sucursales s ON s.id = p.sucursal_id
 WHERE r.nombre = 'dueno'
   AND p.sucursal_id IS NOT NULL
 ORDER BY p.nombre_completo;

CREATE OR REPLACE FUNCTION public.get_user_sucursal()
RETURNS INT AS $$
  SELECT p.sucursal_id
    FROM public.perfiles_usuario p
   WHERE p.usuario_id = auth.uid()
   
     AND public.get_user_rol() IS DISTINCT FROM 'dueno'
   LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

UPDATE public.perfiles_usuario p
   SET sucursal_id = NULL
  FROM public.roles r
 WHERE r.id = p.rol_id
   AND r.nombre = 'dueno'
   AND p.sucursal_id IS NOT NULL;

SELECT position('dueno' in pg_get_functiondef('public.get_user_sucursal()'::regprocedure)) > 0
  AS regla_aplicada;

SELECT count(*) AS duenos_con_sucursal
  FROM public.perfiles_usuario p
  JOIN public.roles r ON r.id = p.rol_id
 WHERE r.nombre = 'dueno'
   AND p.sucursal_id IS NOT NULL;

SELECT count(*) AS usuarios_sucursal_con_sucursal
  FROM public.perfiles_usuario p
  JOIN public.roles r ON r.id = p.rol_id
 WHERE r.nombre = 'sucursal'
   AND p.sucursal_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';