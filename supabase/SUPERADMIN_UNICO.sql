BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roles WHERE nombre = 'superadmin') THEN
    RAISE EXCEPTION
      'Ejecuta supabase/RENOMBRAR_SUPERADMINISTRADOR.sql antes de esta migracion.';
  END IF;
END;
$$;

INSERT INTO public.roles (nombre)
VALUES ('superadministrador')
ON CONFLICT (nombre) DO NOTHING;

DO $$
DECLARE
  v_cantidad INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_cantidad
    FROM public.perfiles_usuario p
    JOIN public.roles r ON r.id = p.rol_id
   WHERE r.nombre = 'superadministrador';

  IF v_cantidad > 1 THEN
    RAISE EXCEPTION
      'Ya existen % usuarios con rol superadministrador. Deja solo uno antes de volver a ejecutar esta migracion.',
      v_cantidad;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.impedir_superadmin_duplicado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol_superadmin INT;
BEGIN
  SELECT id
    INTO v_rol_superadmin
    FROM public.roles
   WHERE nombre = 'superadministrador';

  IF NEW.rol_id IS DISTINCT FROM v_rol_superadmin THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(721093, 1);

  IF EXISTS (
    SELECT 1
      FROM public.perfiles_usuario p
     WHERE p.rol_id = v_rol_superadmin
       AND p.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Solo puede haber un usuario con rol superadministrador.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_superadmin_duplicado() FROM PUBLIC;

DROP TRIGGER IF EXISTS perfiles_usuario_unico_superadmin ON public.perfiles_usuario;
CREATE TRIGGER perfiles_usuario_unico_superadmin
  BEFORE INSERT OR UPDATE ON public.perfiles_usuario
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_superadmin_duplicado();

CREATE OR REPLACE FUNCTION public.get_user_rol()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN r.nombre = 'superadministrador' THEN 'administrador'
           ELSE r.nombre
         END
    FROM public.perfiles_usuario p
    JOIN public.roles r ON r.id = p.rol_id
   WHERE p.usuario_id = auth.uid()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_es_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.perfiles_usuario p
      JOIN public.roles r ON r.id = p.rol_id
     WHERE p.usuario_id = auth.uid()
       AND r.nombre = 'superadministrador'
  );
$$;

CREATE OR REPLACE FUNCTION public.perfil_es_administrador_privilegiado(p_usuario_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.perfiles_usuario p
      JOIN public.roles r ON r.id = p.rol_id
     WHERE p.usuario_id = p_usuario_id
       AND r.nombre IN ('administrador', 'superadministrador')
  );
$$;

REVOKE ALL ON FUNCTION public.get_user_es_superadmin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perfil_es_administrador_privilegiado(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_es_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.perfil_es_administrador_privilegiado(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.proteger_roles_administrativos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nuevo_privilegiado BOOLEAN;
  v_anterior_privilegiado BOOLEAN;
BEGIN
  -- Las escrituras de la Edge Function con service_role no tienen auth.uid().
  IF auth.uid() IS NULL OR public.get_user_es_superadmin() THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.roles
     WHERE id = NEW.rol_id
       AND nombre IN ('administrador', 'superadministrador')
  ) INTO v_nuevo_privilegiado;

  IF TG_OP = 'INSERT' THEN
    IF v_nuevo_privilegiado THEN
      RAISE EXCEPTION 'Solo el Superadmin puede asignar roles administrativos.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.roles
     WHERE id = OLD.rol_id
       AND nombre IN ('administrador', 'superadministrador')
  ) INTO v_anterior_privilegiado;

  IF NEW.rol_id IS DISTINCT FROM OLD.rol_id
     AND (v_nuevo_privilegiado OR v_anterior_privilegiado) THEN
    RAISE EXCEPTION 'Solo el Superadmin puede cambiar roles administrativos.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_roles_administrativos() FROM PUBLIC;

DROP TRIGGER IF EXISTS perfiles_usuario_proteger_roles_administrativos
  ON public.perfiles_usuario;
CREATE TRIGGER perfiles_usuario_proteger_roles_administrativos
  BEFORE INSERT OR UPDATE ON public.perfiles_usuario
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_roles_administrativos();

CREATE OR REPLACE FUNCTION public.impedir_aprobacion_pedido_superadmin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.get_user_es_superadmin()
     AND OLD.estado = 'PENDIENTE'
     AND NEW.estado = 'APROBADO' THEN
    RAISE EXCEPTION 'El Superadmin puede consultar pedidos, pero no aprobarlos.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.impedir_aprobacion_pedido_superadmin() FROM PUBLIC;
DROP TRIGGER IF EXISTS pedidos_impedir_aprobacion_superadmin ON public.pedidos;
CREATE TRIGGER pedidos_impedir_aprobacion_superadmin
  BEFORE UPDATE OF estado ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_aprobacion_pedido_superadmin();

DROP POLICY IF EXISTS perfiles_update ON public.perfiles_usuario;
DROP POLICY IF EXISTS perfiles_admin ON public.perfiles_usuario;
DROP POLICY IF EXISTS perfiles_update_restringido ON public.perfiles_usuario;
CREATE POLICY perfiles_update_restringido ON public.perfiles_usuario
  FOR UPDATE TO authenticated
  USING (
    usuario_id = auth.uid()
    OR (
      public.get_user_rol() = 'administrador'
      AND (
        public.get_user_es_superadmin()
        OR NOT public.perfil_es_administrador_privilegiado(usuario_id)
      )
    )
  )
  WITH CHECK (
    usuario_id = auth.uid()
    OR (
      public.get_user_rol() = 'administrador'
      AND (
        public.get_user_es_superadmin()
        OR NOT public.perfil_es_administrador_privilegiado(usuario_id)
      )
    )
  );

COMMIT;
