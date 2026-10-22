-- 1) crear los roles que faltan
INSERT INTO public.roles (nombre) VALUES
  ('administrador'), ('operador_planta'), ('despachador'), ('sucursal')
ON CONFLICT (nombre) DO NOTHING;

-- 2) crear o arreglar el perfil de cada cuenta
WITH asignacion (email, rol) AS (
  VALUES
    ('admin@sistema.com',      'administrador'),
    ('admin2@sistema.com',     'administrador'),
    ('planta@sistema.com',     'operador_planta'),
    ('despachador@sistema.com','despachador'),
    ('sucursal@sistema.com',   'sucursal'),
    ('jordan@sistema.com',     'sucursal')
)
INSERT INTO public.perfiles_usuario (usuario_id, nombre_completo, rol_id)
SELECT u.id,
       COALESCE(NULLIF(u.raw_user_meta_data ->> 'nombre_comple',''), u.raw_user_meta_data ->> 'nombre_completo', u.email),
       r.id
  FROM asignacion a
  JOIN auth.users u ON u.email = a.email
  JOIN public.roles r ON r.nombre = a.rol
ON CONFLICT (usuario_id) DO UPDATE SET rol_id = EXCLUDED.rol_id;

-- 3) ver como quedo
SELECT u.email,
       COALESCE(r.nombre, 'SIN ROL') AS rol,
       p.sucursal_id
  FROM auth.users u
  LEFT JOIN public.perfiles_usuario p ON p.usuario_id = u.id
  LEFT JOIN public.roles r ON r.id = p.rol_id
 ORDER BY r.nombre NULLS LAST, u.email;
