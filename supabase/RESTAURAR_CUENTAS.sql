INSERT INTO public.roles (nombre) VALUES
  ('administrador'),
  ('operador_planta'),
  ('despachador'),
  ('sucursal')
ON CONFLICT (nombre) DO NOTHING;

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
       COALESCE(NULLIF(u.raw_user_meta_data ->> 'nombre_compleno', ''), u.email),
       r.id
  FROM asignacion a
  JOIN auth.users u ON u.email = a.email
  JOIN public.roles r ON r.nombre = a.rol
ON CONFLICT (usuario_id) DO UPDATE
   SET rol_id = EXCLUDED.rol_id;


SELECT u.email,
       COALESCE(r.nombre, 'SIN ROL') AS rol,
       p.sucursal_id
  FROM auth.users u
  LEFT JOIN public.perfiles_usuario p ON p.usuario_id = u.id
  LEFT JOIN public.roles r ON r.id = p.rol_id
 ORDER BY r.nombre NULLS LAST, u.email;

-- B) cuentas que todavia no pueden entrar
--    tiene que dar 1, la de distribuidor
SELECT count(*) AS cuentas_sin_rol
  FROM auth.users u
  LEFT JOIN public.perfiles_usuario p ON p.usuario_id = u.id
 WHERE p.id IS NULL OR p.rol_id IS NULL;

-- C) datos de prueba que quedaron tras el instalador
--    pedidos NO se borra en instalar.sql, deberia seguir having data
SELECT 'pedidos' AS tabla, count(*) AS filas FROM public.pedidos
UNION ALL
SELECT 'sucursales', count(*) FROM public.sucursales;

NOTIFY pgrst, 'reload schema';