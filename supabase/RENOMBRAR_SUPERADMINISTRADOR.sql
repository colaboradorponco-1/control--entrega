-- Unifica el nombre historico del rol y conserva las cuentas existentes.
-- Ejecutar en Supabase > SQL Editor antes de usar la version nueva de la app.
BEGIN;

LOCK TABLE public.roles IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.perfiles_usuario IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_rol_antiguo INT;
  v_rol_correcto INT;
  v_cantidad_usuarios INT;
BEGIN
  SELECT COUNT(*)
    INTO v_cantidad_usuarios
    FROM public.perfiles_usuario p
    JOIN public.roles r ON r.id = p.rol_id
   WHERE r.nombre IN ('superadmin', 'superadministrador');

  IF v_cantidad_usuarios > 1 THEN
    RAISE EXCEPTION
      'Hay % cuentas asignadas entre los dos nombres de rol. Deja una sola cuenta superadministradora y vuelve a ejecutar.',
      v_cantidad_usuarios;
  END IF;

  SELECT id INTO v_rol_antiguo
    FROM public.roles WHERE nombre = 'superadmin';
  SELECT id INTO v_rol_correcto
    FROM public.roles WHERE nombre = 'superadministrador';

  IF v_rol_antiguo IS NOT NULL AND v_rol_correcto IS NOT NULL THEN
    UPDATE public.perfiles_usuario
       SET rol_id = v_rol_correcto
     WHERE rol_id = v_rol_antiguo;
    DELETE FROM public.roles WHERE id = v_rol_antiguo;
  ELSIF v_rol_antiguo IS NOT NULL THEN
    UPDATE public.roles
       SET nombre = 'superadministrador'
     WHERE id = v_rol_antiguo;
  ELSIF v_rol_correcto IS NULL THEN
    INSERT INTO public.roles (nombre) VALUES ('superadministrador');
  END IF;
END;
$$;

-- Actualiza las funciones activas que comparaban el nombre anterior.
DO $$
DECLARE
  v_funcion RECORD;
  v_definicion TEXT;
BEGIN
  FOR v_funcion IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
       AND p.prokind = 'f'
       AND strpos(p.prosrc, '''superadmin''') > 0
  LOOP
    v_definicion := pg_get_functiondef(v_funcion.oid);
    EXECUTE replace(v_definicion, '''superadmin''', '''superadministrador''');
  END LOOP;
END;
$$;

-- Mantiene las mismas politicas RLS cambiando solo el nombre comparado.
DO $$
DECLARE
  v_politica RECORD;
  v_roles TEXT;
  v_using TEXT;
  v_check TEXT;
BEGIN
  FOR v_politica IN
    SELECT *
      FROM pg_policies
     WHERE strpos(COALESCE(qual, '') || COALESCE(with_check, ''), '''superadmin''') > 0
  LOOP
    SELECT string_agg(
             CASE WHEN rol = 'public' THEN 'PUBLIC' ELSE quote_ident(rol::TEXT) END,
             ', '
           )
      INTO v_roles
      FROM unnest(v_politica.roles) AS roles(rol);

    v_using := CASE
      WHEN v_politica.qual IS NULL THEN ''
      ELSE format(' USING (%s)', replace(v_politica.qual, '''superadmin''', '''superadministrador'''))
    END;
    v_check := CASE
      WHEN v_politica.with_check IS NULL THEN ''
      ELSE format(' WITH CHECK (%s)', replace(v_politica.with_check, '''superadmin''', '''superadministrador'''))
    END;

    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      v_politica.policyname,
      v_politica.schemaname,
      v_politica.tablename
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      v_politica.policyname,
      v_politica.schemaname,
      v_politica.tablename,
      v_politica.permissive,
      v_politica.cmd,
      v_roles,
      v_using,
      v_check
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
