-- ============================================================
--  REPARAR ROLES: "Rol de usuario no reconocido" / sin rol
-- ============================================================
--  El problema
--  El sistema solo entiende estos cinco roles:
--    administrador, operador_planta, despachador, sucursal, dueno
--
--  Pero en la base de datos las cuentas tienen:
--    ADMIN, ABOGADO, AYUDANTE_ADMIN
--  Que son de otro sistema. No aparecen en ningun archivo de
--  este proyecto. Con esos roles el login no puede decidir a
--  que pantalla mandarte, asi que ninguna cuenta entra.
--
--  Que hace este archivo
--    1) Crea los roles que el sistema necesita, si no existen.
--    2) Le asigna el rol correcto a cada cuenta por su correo.
--    3) Te muestra como quedo todo.
--
--  Que NO hace, a proposito
--    - No borra los roles viejos (ADMIN, ABOGADO, AYUDANTE_ADMIN).
--      Quedan sin uso, pero borrarlos podria romper algo que no
--      vemos. Cuando confirmemos que nada los usa, se limpian.
--    - No asigna sucursal_id. Eso se hace desde "Gestion de
--      Usuarios" una vez entres como administrador. Asi no te
--      asigno una sucursal al azar.
--
--  QUE NECESITA
--  Solo la instalacion base: auth.users, perfiles_usuario y
--  roles. No depende de ninguna migracion pendiente.
--
--  Idempotente: correrlo dos veces deja lo mismo.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Crear los roles que el sistema entiende
-- ------------------------------------------------------------
--  ON CONFLICT porque 'nombre' es UNIQUE. Si el rol ya existe no
--  pasa nada.

INSERT INTO public.roles (nombre) VALUES
  ('administrador'),
  ('operador_planta'),
  ('despachador'),
  ('sucursal')
ON CONFLICT (nombre) DO NOTHING;


-- ------------------------------------------------------------
-- 2) Asignar el rol de cada cuenta
-- ------------------------------------------------------------
--  Cada linea es una cuenta. El que entras vos es
--  admin@sistema.com, que queda como administrador.
--
--  distribuidor@sistema.com NO aparece: el sistema no tiene un
--  rol de distribuidor, asi que se queda sin rol y no entra.
--  Antes le ponian ABOGADO, que no significa nada aca.
--  Cuando quieras darle acceso, decime que rol corresponde y lo
--  agregamos.

WITH asignacion (email, rol) AS (
  VALUES
    ('admin@sistema.com',      'administrador'),
    ('admin2@sistema.com',     'administrador'),
    ('planta@sistema.com',     'operador_planta'),
    ('despachador@sistema.com','despachador'),
    ('sucursal@sistema.com',   'sucursal'),
    ('jordan@sistema.com',     'sucursal')
)
UPDATE public.perfiles_usuario p
   SET rol_id = r.id
  FROM asignacion a
  JOIN auth.users u ON u.email = a.email
  JOIN public.roles  r ON r.nombre = a.rol
 WHERE p.usuario_id = u.id
   AND p.rol_id IS DISTINCT FROM r.id;


-- ------------------------------------------------------------
-- 3) Verificar
-- ------------------------------------------------------------

-- A) como quedo cada cuenta
SELECT u.email,
       p.nombre_completo,
       COALESCE(r.nombre, 'SIN ROL') AS rol,
       p.sucursal_id
  FROM auth.users u
  LEFT JOIN public.perfiles_usuario p ON p.usuario_id = u.id
  LEFT JOIN public.roles r ON r.id = p.rol_id
 ORDER BY r.nombre NULLS LAST, u.email;

-- B) cuentas que todavia no pueden entrar → tiene que dar 1
--    (la de distribuidor, que todavia no tiene rol asignado)
SELECT count(*) AS cuentas_sin_rol
  FROM auth.users u
  LEFT JOIN public.perfiles_usuario p ON p.usuario_id = u.id
 WHERE p.id IS NULL OR p.rol_id IS NULL;

-- C) roles viejos que quedaron sin uso
SELECT nombre, 'sin usar' AS estado
  FROM public.roles
 WHERE nombre NOT IN ('administrador', 'operador_planta',
                      'despachador', 'sucursal', 'dueno')
 ORDER BY nombre;

NOTIFY pgrst, 'reload schema';