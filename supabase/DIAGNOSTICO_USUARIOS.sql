

SELECT columna,
       CASE WHEN existe THEN 'si' ELSE 'no' END AS esta
  FROM (
    SELECT 'perfiles_usuario.dueno_id' AS columna,
           EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name   = 'perfiles_usuario'
                      AND column_name  = 'dueno_id') AS existe
    UNION ALL
    SELECT 'perfiles_usuario.activo',
           EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name   = 'perfiles_usuario'
                      AND column_name  = 'activo')
    UNION ALL
    SELECT 'tabla duenos',
           EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'duenos')
    UNION ALL
    SELECT 'tabla sucursal_duenos',
           EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'sucursal_duenos')
    UNION ALL
    SELECT 'despacho_pollo.latitude',
           EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name   = 'despacho_pollo'
                      AND column_name  = 'latitude')
  ) migraciones;


-- ------------------------------------------------------------
-- 2) CADA CUENTA CON SU PERFIL Y SU ROL
-- ------------------------------------------------------------
--  Esta es la tabla clave. Fijate en la columna 'rol':
--
--    SIN ROL = la fila existe pero el rol quedo en null, o la
--              cuenta ni siquiera tiene perfil. Eso es lo que
--              hace que el login la rechace.
--
--    con rol = todo bien, y entonces el problema es otro.
--
--  'dueno' y 'activo' salen en null si esas columnas todavia no
--  existen. No es un error del archivo.

SELECT
  p.id                                    AS perfil_id,
  p.nombre_completo,
  r.nombre                                AS rol,
  p.rol_id,
  p.sucursal_id,
  to_jsonb(p) ->> 'dueno_id'              AS dueno_id,
  to_jsonb(p) ->> 'activo'                AS activo,
  au.email                                AS correo
FROM public.perfiles_usuario p
LEFT JOIN public.roles r ON r.id = p.rol_id
LEFT JOIN auth.users au  ON au.id = p.usuario_id
ORDER BY r.nombre NULLS LAST, p.nombre_completo;


-- ------------------------------------------------------------
-- 3) CUENTAS DE SUPABASE SIN PERFIL
-- ------------------------------------------------------------
--  Estas cuentas existen para entrar pero nunca se les creo el
--  perfil. Son las que el login rechaza con "no tiene un rol".

SELECT au.email, au.created_at
  FROM auth.users au
  LEFT JOIN public.perfiles_usuario p ON p.usuario_id = au.id
 WHERE p.id IS NULL
 ORDER BY au.created_at;


-- ------------------------------------------------------------
-- 4) CUENTAS DESACTIVADAS
-- ------------------------------------------------------------
--  Solo tiene sentido si la migracion USUARIOS_ACTIVO.sql esta
--  aplicada. Si en la consulta 1 'activo' dice 'no', esto sale
--  vacio y es lo esperado.

SELECT p.nombre_completo, au.email, to_jsonb(p) ->> 'activo' AS activo
  FROM public.perfiles_usuario p
  JOIN auth.users au ON au.id = p.usuario_id
 WHERE to_jsonb(p) ->> 'activo' = 'false';


-- ------------------------------------------------------------
-- 5) ROLES DISPONIBLES
-- ------------------------------------------------------------
--  'dueno' deberia aparecer si ya corriste DUENOS-PARTE1.
--  Si no aparece, esa migracion esta pendiente.

SELECT id, nombre FROM public.roles ORDER BY id;