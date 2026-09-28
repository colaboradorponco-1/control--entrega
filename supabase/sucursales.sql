-- ============================================================
-- 1) PERMISOS: habilitar INSERT / UPDATE / DELETE (solo admin)
-- 2) CARGA: las 18 sucursales reales
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1) POLITICAS DE ESCRITURA
-- Las tablas de referencia solo tenian politica de lectura,
-- por eso el CRUD devolvia: 42501 row-level security policy
-- ------------------------------------------------------------

DROP POLICY IF EXISTS sucursales_write ON public.sucursales;
CREATE POLICY sucursales_write ON public.sucursales
  FOR ALL TO authenticated
  USING (public.get_user_rol() = 'administrador')
  WITH CHECK (public.get_user_rol() = 'administrador');

DROP POLICY IF EXISTS proveedores_write ON public.proveedores;
CREATE POLICY proveedores_write ON public.proveedores
  FOR ALL TO authenticated
  USING (public.get_user_rol() = 'administrador')
  WITH CHECK (public.get_user_rol() = 'administrador');

-- ------------------------------------------------------------
-- 2) SUCURSALES REALES
-- Rutas: ESTE (8) | OESTE (7) | PARTICULAR (3) = 18 sucursales
-- ------------------------------------------------------------

-- Desvincular perfiles que apunten a sucursales viejas
UPDATE public.perfiles_usuario SET sucursal_id = NULL WHERE sucursal_id IS NOT NULL;

-- Borrar las sucursales de prueba
DELETE FROM public.sucursales;

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

-- ------------------------------------------------------------
-- 3) VERIFICACION
-- ------------------------------------------------------------
SELECT sector, COUNT(*) AS sucursales, string_agg(nombre, ', ' ORDER BY nombre) AS nombres
FROM public.sucursales
GROUP BY sector
ORDER BY sector;
