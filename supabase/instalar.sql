
DROP TABLE IF EXISTS public.auditoria CASCADE;
DROP TABLE IF EXISTS public.control_inventario_diario CASCADE;
DROP TABLE IF EXISTS public.despacho_pollo CASCADE;
DROP TABLE IF EXISTS public.recepcion_pollo CASCADE;
DROP TABLE IF EXISTS public.perfiles_usuario CASCADE;
DROP TABLE IF EXISTS public.proveedores CASCADE;
DROP TABLE IF EXISTS public.sucursales CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP FUNCTION IF EXISTS public.crear_perfil_automatico() CASCADE;
DROP FUNCTION IF EXISTS public.recalcular_inventario(DATE) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_rol() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_sucursal() CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- PASO 1: Tablas
-- ------------------------------------------------------------
CREATE TABLE public.roles (
  id SERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL
);

CREATE TABLE public.sucursales (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  sector TEXT NOT NULL
);

CREATE TABLE public.proveedores (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL
);

CREATE TABLE public.perfiles_usuario (
  id SERIAL PRIMARY KEY,
  usuario_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_completo TEXT NOT NULL,
  rol_id INT REFERENCES public.roles(id) ON DELETE SET NULL,
  sucursal_id INT REFERENCES public.sucursales(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.recepcion_pollo (
  id SERIAL PRIMARY KEY,
  numero_recibo TEXT NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  kilos NUMERIC(10,2) NOT NULL CHECK (kilos > 0),
  unidades INT NOT NULL CHECK (unidades > 0),
  precio_por_kilo NUMERIC(10,2) NOT NULL CHECK (precio_por_kilo >= 0),
  proveedor_id INT REFERENCES public.proveedores(id) ON DELETE SET NULL,
  creado_por INT REFERENCES public.perfiles_usuario(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Columnas calculadas por PostgreSQL: inalterables desde el frontend
  total_monto NUMERIC(14,2)
    GENERATED ALWAYS AS (ROUND(kilos * precio_por_kilo, 2)) STORED,
  promedio_kilo_unidad NUMERIC(10,4)
    GENERATED ALWAYS AS (ROUND(kilos / NULLIF(unidades, 0), 4)) STORED
);

CREATE TABLE public.despacho_pollo (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  kilos NUMERIC(10,2) NOT NULL CHECK (kilos > 0),
  unidades INT NOT NULL CHECK (unidades > 0),
  sucursal_id INT REFERENCES public.sucursales(id) ON DELETE SET NULL,
  estado_recepcion TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_recepcion IN ('PENDIENTE','RECIBIDO')),
  observaciones TEXT,
  despachado_por INT REFERENCES public.perfiles_usuario(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.control_inventario_diario (
  id SERIAL PRIMARY KEY,
  fecha DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  kilos_iniciales NUMERIC(10,2) NOT NULL DEFAULT 0,
  kilos_recibidos  NUMERIC(10,2) NOT NULL DEFAULT 0,
  kilos_despachados NUMERIC(10,2) NOT NULL DEFAULT 0,
  kilos_saldo NUMERIC(10,2) NOT NULL DEFAULT 0,
  unidades_saldo INT NOT NULL DEFAULT 0,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.auditoria (
  id SERIAL PRIMARY KEY,
  tabla TEXT NOT NULL,
  accion TEXT NOT NULL,
  registro_id INT,
  usuario_id UUID,
  usuario_nombre TEXT,
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- PASO 2: Permisos
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ------------------------------------------------------------
-- PASO 3: Helpers de seguridad
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_rol()
RETURNS TEXT AS $$
  SELECT CASE
           WHEN r.nombre = 'superadministrador' THEN 'administrador'
           ELSE r.nombre
         END
    FROM public.perfiles_usuario p
    JOIN public.roles r ON r.id = p.rol_id
   WHERE p.usuario_id = auth.uid()
   LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.impedir_superadmin_duplicado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol_superadmin INT;
BEGIN
  SELECT id INTO v_rol_superadmin
    FROM public.roles
   WHERE nombre = 'superadministrador';

  IF NEW.rol_id IS DISTINCT FROM v_rol_superadmin THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(721093, 1);

  IF EXISTS (
    SELECT 1 FROM public.perfiles_usuario p
     WHERE p.rol_id = v_rol_superadmin
       AND p.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Solo puede haber un usuario con rol superadministrador.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER perfiles_usuario_unico_superadmin
  BEFORE INSERT OR UPDATE ON public.perfiles_usuario
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_superadmin_duplicado();

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

REVOKE ALL ON FUNCTION public.get_user_es_superadmin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perfil_es_administrador_privilegiado(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.proteger_roles_administrativos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_es_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.perfil_es_administrador_privilegiado(UUID) TO authenticated;

CREATE TRIGGER perfiles_usuario_proteger_roles_administrativos
  BEFORE INSERT OR UPDATE ON public.perfiles_usuario
  FOR EACH ROW
  EXECUTE FUNCTION public.proteger_roles_administrativos();

CREATE OR REPLACE FUNCTION public.get_user_sucursal()
RETURNS INT AS $$
  SELECT p.sucursal_id
    FROM public.perfiles_usuario p
   WHERE p.usuario_id = auth.uid()
   LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- PASO 4: Inventario automatico
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_inventario(p_fecha DATE)
RETURNS VOID AS $$
DECLARE
  v_recibidos        NUMERIC(10,2) := 0;
  v_despachados      NUMERIC(10,2) := 0;
  v_unidades_recib   INT := 0;
  v_unidades_desp    INT := 0;
  v_kilos_inicial    NUMERIC(10,2) := 0;
  v_unidades_inicial INT := 0;
BEGIN
  SELECT COALESCE(SUM(r.kilos), 0), COALESCE(SUM(r.unidades), 0)
    INTO v_recibidos, v_unidades_recib
    FROM public.recepcion_pollo r
   WHERE r.fecha = p_fecha;

  SELECT COALESCE(SUM(d.kilos), 0), COALESCE(SUM(d.unidades), 0)
    INTO v_despachados, v_unidades_desp
    FROM public.despacho_pollo d
   WHERE d.fecha = p_fecha;

  -- El COALESCE va POR FUERA de la subconsulta: si no existe un dia
  -- previo, SELECT INTO devuelve NULL y el COALESCE interno no aplica.
  v_kilos_inicial := COALESCE((
      SELECT c.kilos_saldo
        FROM public.control_inventario_diario c
       WHERE c.fecha < p_fecha
       ORDER BY c.fecha DESC LIMIT 1
    ), 0);

  v_unidades_inicial := COALESCE((
      SELECT c.unidades_saldo
        FROM public.control_inventario_diario c
       WHERE c.fecha < p_fecha
       ORDER BY c.fecha DESC LIMIT 1
    ), 0);

  INSERT INTO public.control_inventario_diario
    (fecha, kilos_iniciales, kilos_recibidos, kilos_despachados,
     kilos_saldo, unidades_saldo, actualizado_en)
  VALUES
    (p_fecha, v_kilos_inicial, v_recibidos, v_despachados,
     v_kilos_inicial + v_recibidos - v_despachados,
     GREATEST(v_unidades_inicial + v_unidades_recib - v_unidades_desp, 0),
     NOW())
  ON CONFLICT (fecha) DO UPDATE SET
    kilos_iniciales  = EXCLUDED.kilos_iniciales,
    kilos_recibidos  = EXCLUDED.kilos_recibidos,
    kilos_despachados= EXCLUDED.kilos_despachados,
    kilos_saldo      = EXCLUDED.kilos_saldo,
    unidades_saldo   = EXCLUDED.unidades_saldo,
    actualizado_en   = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalcula en cadena: los dias siguientes dependen del anterior
CREATE OR REPLACE FUNCTION public.recalcular_inventario_desde(p_fecha DATE)
RETURNS VOID AS $$
DECLARE
  v_dia DATE;
BEGIN
  FOR v_dia IN
    SELECT c.fecha FROM public.control_inventario_diario c
     WHERE c.fecha >= p_fecha ORDER BY c.fecha ASC
  LOOP
    PERFORM public.recalcular_inventario(v_dia);
  END LOOP;

  PERFORM public.recalcular_inventario(p_fecha);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trg_inventario()
RETURNS TRIGGER AS $$
DECLARE
  v_desde DATE;
BEGIN
  v_desde := COALESCE(NEW.fecha, CURRENT_DATE);
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.fecha IS NOT NULL AND OLD.fecha < v_desde THEN
    v_desde := OLD.fecha;
  END IF;

  PERFORM public.recalcular_inventario_desde(v_desde);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER t_inv_recepcion
  AFTER INSERT OR UPDATE OR DELETE ON public.recepcion_pollo
  FOR EACH ROW EXECUTE FUNCTION public.trg_inventario();

CREATE TRIGGER t_inv_despacho
  AFTER INSERT OR UPDATE OR DELETE ON public.despacho_pollo
  FOR EACH ROW EXECUTE FUNCTION public.trg_inventario();

-- ------------------------------------------------------------
-- PASO 5: Auditoria
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_auditoria()
RETURNS TRIGGER AS $$
DECLARE
  v_accion TEXT; v_ant JSONB; v_nuevo JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_accion := 'INSERT'; v_ant := NULL; v_nuevo := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_accion := 'DELETE'; v_ant := to_jsonb(OLD); v_nuevo := NULL;
  ELSE
    v_accion := 'UPDATE'; v_ant := to_jsonb(OLD); v_nuevo := to_jsonb(NEW);
  END IF;

  INSERT INTO public.auditoria
    (tabla, accion, registro_id, usuario_id, usuario_nombre, datos_anteriores, datos_nuevos)
  VALUES (
    TG_TABLE_NAME, v_accion,
    COALESCE(NULLIF(v_nuevo->>'id','')::INT, NULLIF(v_ant->>'id','')::INT),
    auth.uid(),
    (SELECT nombre_completo FROM public.perfiles_usuario WHERE usuario_id = auth.uid() LIMIT 1),
    v_ant, v_nuevo
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER t_aud_recepcion
  AFTER INSERT OR UPDATE OR DELETE ON public.recepcion_pollo
  FOR EACH ROW EXECUTE FUNCTION public.trg_auditoria();

CREATE TRIGGER t_aud_despacho
  AFTER INSERT OR UPDATE OR DELETE ON public.despacho_pollo
  FOR EACH ROW EXECUTE FUNCTION public.trg_auditoria();

CREATE TRIGGER t_aud_perfiles
  AFTER INSERT OR UPDATE OR DELETE ON public.perfiles_usuario
  FOR EACH ROW EXECUTE FUNCTION public.trg_auditoria();

-- ------------------------------------------------------------
-- PASO 6: Crear perfil automaticamente al registrar usuario
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_perfil_automatico()
RETURNS TRIGGER AS $$
BEGIN
  -- El perfil nace SIN rol a proposito: la Edge Function lo asigna.
  -- Asignar 'administrador' aqui daria acceso total a cualquier
  -- usuario registrado y provocaria llave duplicada al crear usuarios.
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crear_perfil_automatico();

-- ------------------------------------------------------------
-- PASO 7: RLS - permisos por rol
-- ------------------------------------------------------------
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recepcion_pollo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despacho_pollo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_inventario_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

-- Tablas de referencia: lectura para cualquier usuario autenticado
CREATE POLICY ref_read ON public.roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ref_read ON public.sucursales
  FOR SELECT TO authenticated USING (true);
CREATE POLICY ref_read ON public.proveedores
  FOR SELECT TO authenticated USING (true);

-- Las tablas de referencia se administran solo desde el panel de administrador
CREATE POLICY sucursales_write ON public.sucursales
  FOR ALL TO authenticated
  USING (public.get_user_rol() = 'administrador')
  WITH CHECK (public.get_user_rol() = 'administrador');
CREATE POLICY proveedores_write ON public.proveedores
  FOR ALL TO authenticated
  USING (public.get_user_rol() = 'administrador')
  WITH CHECK (public.get_user_rol() = 'administrador');

-- Perfiles
CREATE POLICY perfiles_read ON public.perfiles_usuario
  FOR SELECT TO authenticated USING (true);
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

-- Recepciones: escriben planta y admin
CREATE POLICY recepcion_read ON public.recepcion_pollo
  FOR SELECT TO authenticated USING (true);
CREATE POLICY recepcion_write ON public.recepcion_pollo
  FOR ALL TO authenticated
  USING (public.get_user_rol() IN ('administrador','operador_planta'))
  WITH CHECK (public.get_user_rol() IN ('administrador','operador_planta'));

-- Despachos: sucursal solo ve y confirma los suyos
CREATE POLICY despacho_read ON public.despacho_pollo
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() IN ('administrador','despachador','operador_planta')
    OR sucursal_id = public.get_user_sucursal()
  );
CREATE POLICY despacho_write ON public.despacho_pollo
  FOR ALL TO authenticated
  USING (public.get_user_rol() IN ('administrador','despachador'))
  WITH CHECK (public.get_user_rol() IN ('administrador','despachador'));
CREATE OR REPLACE FUNCTION public.confirmar_entrega_despacho(
  p_despacho_id INT,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS public.despacho_pollo
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_despacho public.despacho_pollo;
BEGIN
  IF public.get_user_rol() <> 'administrador' THEN
    IF public.get_user_rol() <> 'sucursal' THEN
      RAISE EXCEPTION 'Solo la sucursal receptora o un administrador pueden confirmar la entrega';
    END IF;

    SELECT * INTO v_despacho FROM public.despacho_pollo WHERE id = p_despacho_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El despacho no existe';
    END IF;
    IF v_despacho.sucursal_id IS DISTINCT FROM public.get_user_sucursal() THEN
      RAISE EXCEPTION 'Ese despacho no pertenece a tu sucursal';
    END IF;
  END IF;

  UPDATE public.despacho_pollo
     SET estado_recepcion = 'RECIBIDO',
         observaciones = COALESCE(NULLIF(TRIM(p_observaciones), ''), NULL)
   WHERE id = p_despacho_id
  RETURNING * INTO v_despacho;

  RETURN v_despacho;
END;
$$;

-- Inventario y auditoria: solo lectura (admin en auditoria)
CREATE POLICY inventario_read ON public.control_inventario_diario
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auditoria_read ON public.auditoria
  FOR SELECT TO authenticated
  USING (public.get_user_rol() = 'administrador');

-- ------------------------------------------------------------
-- PASO 8: Datos iniciales
-- ------------------------------------------------------------
INSERT INTO public.roles (nombre) VALUES
  ('administrador'), ('superadministrador'), ('operador_planta'), ('despachador'), ('sucursal')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO public.sucursales (nombre, sector) VALUES
  -- RUTA ESTE (8)
  ('Sergio',         'ESTE'),
  ('Sacaba',         'ESTE'),
  ('Evelyn',         'ESTE'),
  ('Marcela',        'ESTE'),
  ('Pagador',        'ESTE'),
  ('Panamericana',   'ESTE'),
  ('Federica',       'ESTE'),
  ('Petrolera',      'ESTE'),
  -- RUTA OESTE (7)
  ('Sergio',         'OESTE'),
  ('Juana',          'OESTE'),
  ('Miriam',         'OESTE'),
  ('Papa Paulo',     'OESTE'),
  ('Antezana',       'OESTE'),
  ('Pulacayo',       'OESTE'),
  ('Ariel',          'OESTE'),
  -- RUTA PARTICULAR (3)
  ('Punata',         'PARTICULAR'),
  ('Sipe Sipe',      'PARTICULAR'),
  ('25 de Jordan',   'PARTICULAR');

INSERT INTO public.proveedores (nombre) VALUES
  ('Avicola San Fernando'),
  ('Avicola El Broaster'),
  ('Granjas Unidas S.A.');

-- Vincular el administrador ya creado en Supabase Auth
INSERT INTO public.perfiles_usuario (usuario_id, nombre_completo, rol_id)
SELECT u.id, 'Administrador Principal',
       (SELECT id FROM public.roles WHERE nombre = 'administrador')
  FROM auth.users u
 WHERE u.email IN ('admin2@sistema.com', 'admin@sistema.com')
ON CONFLICT (usuario_id) DO NOTHING;

-- ------------------------------------------------------------
-- PASO 9: Refrescar la cache de PostgREST (clave para quitar los 404)
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

SELECT 'Instalacion completada' AS resultado,
       (SELECT COUNT(*) FROM public.roles) AS roles,
       (SELECT COUNT(*) FROM public.sucursales) AS sucursales,
       (SELECT COUNT(*) FROM public.proveedores) AS proveedores,
       (SELECT COUNT(*) FROM public.perfiles_usuario) AS perfiles;
