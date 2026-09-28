
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.crear_perfil_automatico() CASCADE;

CREATE OR REPLACE FUNCTION public.crear_perfil_automatico()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfiles_usuario (usuario_id, nombre_completo, rol_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email, 'Usuario'),
    NULL
  )
  ON CONFLICT (usuario_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_automatico();
