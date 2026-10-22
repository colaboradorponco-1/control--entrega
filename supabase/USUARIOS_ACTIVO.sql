-- ============================================================
--  USUARIOS: PODER DESACTIVAR EN VEZ DE BORRAR
-- ============================================================
--  Por que: dos columnas de tu base impiden borrar fisicamente a
--  un usuario que ya tiene trabajo registrado:
--
--    public.pedidos.creado_por        -> auth.users ON DELETE RESTRICT
--    public.despacho_pollo.recibido_por -> auth.users ON DELETE RESTRICT
--
--  RESTRICT bloquea el borrado. Eso es intencional y esta bien:
--  en un sistema auditable no se debe poder borrar a alguien que
--  registro pedidos, porque se perderia la trazabilidad de quien
--  hizo cada operacion.
--
--  El problema era que la pantalla de administracion ofrecia un
--  boton "Eliminar" que fallaba con un error de Supabase sin
--  explicar nada. La solucion no es aflojar el RESTRICT (eso
--  borraria el rastro), sino offering la via que si corresponde:
--  DESACTIVAR. El usuario deja de poder entrar, pero sus pedidos,
--  despachos y firmas quedan intactos.
--
--  EJECUTAR UNA SOLA VEZ. Es idempotente.
-- ============================================================


-- ------------------------------------------------------------
-- 1) COLUMBA ACTIVO
-- ------------------------------------------------------------
--  activo = FALSE  ->  el usuario no puede iniciar sesion
--  activo = TRUE   ->  todo normal (por defecto, para no romper
--                      a los usuarios que ya existen)

ALTER TABLE public.perfiles_usuario
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;


-- ------------------------------------------------------------
-- 2) QUE NO SE ROMPAN LAS CONSULTAS QUE YA FUNCIONAN
-- ------------------------------------------------------------
--  El listado de usuarios selecciona columnas explicitas en
--  varios lugares. Esta vista no hace falta, pero deja el
--  patron a mano si hay que agregarla.
--
--  Nota: NO se agrego ninguna politica nueva. Las politicas
--  existentes (perfiles_read, perfiles_update, perfiles_admin)
--  no miran la columna activo, asi que un usuario desactivado
--  conserva su sesion hasta que el token vence. El bloqueo real
--  del ingreso esta en el login (Login.jsx). Ver la nota de
--  seguridad del final.

COMMENT ON COLUMN public.perfiles_usuario.activo IS
  'FALSE = usuario desactivado. No puede iniciar seson, pero sus operaciones quedan registradas.';


-- ------------------------------------------------------------
-- 3) CHEQUEO
-- ------------------------------------------------------------
--  Todas deberian salir con activo = true.

SELECT id, nombre_completo, activo
  FROM public.perfiles_usuario
 ORDER BY nombre_completo;

-- cuantos quedaron desactivados (deberia ser 0 recien)
SELECT COUNT(*) AS desactivados
  FROM public.perfiles_usuario
 WHERE activo = FALSE;


-- ------------------------------------------------------------
-- Refrescar la cache de PostgREST
-- ------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
