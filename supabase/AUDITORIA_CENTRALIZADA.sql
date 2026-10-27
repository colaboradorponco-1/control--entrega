-- ============================================================
-- AUDITORIA CENTRALIZADA
-- ------------------------------------------------------------
-- Crea la tabla de auditoria unica y una funcion de trigger
-- generica para registrar cambios en cualquier tabla.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.auditoria (
  id BIGSERIAL PRIMARY KEY,
  tabla TEXT NOT NULL,
  registro_id INT NOT NULL,
  accion TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  datos_old JSONB,
  datos_new JSONB,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nombre TEXT,
  creado_en TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_tabla_registro 
  ON public.auditoria(tabla, registro_id);

-- ------------------------------------------------------------
-- Funcion generica para registrar auditoria
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usuario_id UUID := auth.uid();
  v_usuario_nombre TEXT;
BEGIN
  -- Intentar obtener el nombre del usuario
  SELECT nombre_completo INTO v_usuario_nombre
    FROM public.perfiles_usuario
   WHERE usuario_id = v_usuario_id;

  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.auditoria(tabla, registro_id, accion, datos_old, usuario_id, usuario_nombre)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), v_usuario_id, v_usuario_nombre);
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.auditoria(tabla, registro_id, accion, datos_old, datos_new, usuario_id, usuario_nombre)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_usuario_id, v_usuario_nombre);
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO public.auditoria(tabla, registro_id, accion, datos_new, usuario_id, usuario_nombre)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), v_usuario_id, v_usuario_nombre);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
