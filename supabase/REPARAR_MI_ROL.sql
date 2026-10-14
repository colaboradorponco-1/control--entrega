
SELECT au.email,
       au.id AS auth_id,
       p.id  AS perfil_id,
       p.rol_id,
       r.nombre AS rol_actual
  FROM auth.users au
  LEFT JOIN public.perfiles_usuario p ON p.usuario_id = au.id
  LEFT JOIN public.roles r ON r.id = p.rol_id
 ORDER BY au.created_at;

INSERT INTO public.perfiles_usuario (usuario_id, nombre_completo, rol_id)
SELECT au.id,
       -- Si el usuario se creo sin nombre en los metadatos, se usa
       -- el correo. La columna nombre_completo es NOT NULL y sin
       -- esto fallaria con "violates not-null constraint".
       COALESCE(NULLIF(au.raw_user_meta_data ->> 'nombre_completo', ''), au.email),
       r.id
  FROM auth.users au
  CROSS JOIN public.roles r
 WHERE au.email = 'TU_CORREO@EMAIL.COM'
   AND r.nombre = 'administrador'
ON CONFLICT (usuario_id) DO UPDATE
   SET rol_id         = EXCLUDED.rol_id,
       nombre_completo = EXCLUDED.nombre_completo;


-- ------------------------------------------------------------
-- 4) VERIFICAR: tiene que salir tu correo con el rol puesto
-- ------------------------------------------------------------

SELECT au.email, p.id AS perfil_id, r.nombre AS rol
  FROM auth.users au
  JOIN public.perfiles_usuario p ON p.usuario_id = au.id
  LEFT JOIN public.roles r ON r.id = p.rol_id
 WHERE au.email = 'TU_CORREO@EMAIL.COM';


-- ------------------------------------------------------------
-- 5) Refrescar la cache de PostgREST
-- ------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
