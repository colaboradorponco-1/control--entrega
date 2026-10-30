
INSERT INTO public.roles (nombre) VALUES ('dueno')
ON CONFLICT (nombre) DO NOTHING;


-- ------------------------------------------------------------
-- 2) TABLA DE DUENOS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.duenos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  -- documento opcional, por si mas adelante hace falta
  documento TEXT,
  telefono TEXT,
  email TEXT,
  -- activo = false esconde al dueño sin borrar su historial
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  notas TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Que no haya dos dueños con el mismo nombre sin tildes distintos
CREATE UNIQUE INDEX IF NOT EXISTS duenos_nombre_unico
  ON public.duenos (lower(btrim(nombre)));


-- ------------------------------------------------------------
-- 3) TABLA PUENTE: que sucursales tiene cada dueño
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sucursal_duenos (
  sucursal_id INT NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  dueno_id    INT NOT NULL REFERENCES public.duenos(id)       ON DELETE CASCADE,
  -- desde cuando es dueño de esa sucursal
  asignado_en TIMESTAMPTZ DEFAULT NOW(),
  -- la misma sucursal no puede repetirse para el mismo dueño
  PRIMARY KEY (sucursal_id, dueno_id)
);

-- Para buscar rapido "que sucursales tiene el dueño X"
CREATE INDEX IF NOT EXISTS sucursal_duenos_dueno_idx
  ON public.sucursal_duenos (dueno_id);


-- ------------------------------------------------------------
-- 4) HELPERS DE APOYO
-- ------------------------------------------------------------

-- ¿El usuario actual es dueño ACTIVO? (para no repetir la consulta)
-- Se exige que el dueño este activo, igual que
-- get_user_sucursales_dueno(). Si no, un dueño desactivado
-- seguiria entrando por esta puerta.
CREATE OR REPLACE FUNCTION public.get_user_es_dueno()
RETURNS BOOLEAN AS $$
  SELECT public.get_user_rol() = 'dueno'
     AND EXISTS (
       SELECT 1
         FROM public.perfiles_usuario p
         JOIN public.duenos d ON d.id = p.dueno_id
        WHERE p.usuario_id = auth.uid()
          AND d.activo = TRUE
     );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_sucursales_dueno()
RETURNS INT[] AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT sd.sucursal_id
        FROM public.sucursal_duenos sd
        JOIN public.duenos d ON d.id = sd.dueno_id
       WHERE sd.dueno_id = (
         SELECT p.dueno_id
           FROM public.perfiles_usuario p
          WHERE p.usuario_id = auth.uid()
       )
         AND d.activo = TRUE
    ),
    '{}'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_dueno_id()
RETURNS INT AS $$
  SELECT CASE
    WHEN public.get_user_rol() = 'dueno' THEN p.dueno_id
    ELSE NULL
  END
  FROM public.perfiles_usuario p
 WHERE p.usuario_id = auth.uid()
 LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE public.perfiles_usuario
  ADD COLUMN IF NOT EXISTS dueno_id INT REFERENCES public.duenos(id) ON DELETE SET NULL;



ALTER TABLE public.duenos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sucursal_duenos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duenos_admin ON public.duenos;
CREATE POLICY duenos_admin ON public.duenos
  FOR ALL TO authenticated
  USING (public.get_user_rol() = 'administrador')
  WITH CHECK (public.get_user_rol() = 'administrador');

DROP POLICY IF EXISTS duenos_read ON public.duenos;
CREATE POLICY duenos_read ON public.duenos
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() = 'administrador'
    OR id = public.get_user_dueno_id()
  );

-- El puente: solo el administrador lo modifica.
DROP POLICY IF EXISTS sucursal_duenos_admin ON public.sucursal_duenos;
CREATE POLICY sucursal_duenos_admin ON public.sucursal_duenos
  FOR ALL TO authenticated
  USING (public.get_user_rol() = 'administrador')
  WITH CHECK (public.get_user_rol() = 'administrador');

DROP POLICY IF EXISTS sucursal_duenos_leer ON public.sucursal_duenos;
CREATE POLICY sucursal_duenos_leer ON public.sucursal_duenos
  FOR SELECT TO authenticated
  USING (
    public.get_user_es_dueno()
    AND dueno_id = public.get_user_dueno_id()
  );

DROP POLICY IF EXISTS perfiles_dueno_update ON public.perfiles_usuario;
CREATE POLICY perfiles_dueno_update ON public.perfiles_usuario
  FOR UPDATE TO authenticated
  USING (public.get_user_es_dueno() AND usuario_id = auth.uid())
  WITH CHECK (public.get_user_es_dueno() AND usuario_id = auth.uid());


DROP POLICY IF EXISTS pedidos_read ON public.pedidos;
CREATE POLICY pedidos_read ON public.pedidos
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() IN ('administrador','operador_planta','despachador')
    OR sucursal_id = public.get_user_sucursal()
    OR (public.get_user_es_dueno() AND sucursal_id = ANY(public.get_user_sucursales_dueno()))
  );


DROP POLICY IF EXISTS despacho_read ON public.despacho_pollo;
CREATE POLICY despacho_read ON public.despacho_pollo
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() IN ('administrador','despachador','operador_planta')
    OR sucursal_id = public.get_user_sucursal()
    OR (public.get_user_es_dueno() AND sucursal_id = ANY(public.get_user_sucursales_dueno()))
  );

DROP POLICY IF EXISTS recepcion_read ON public.recepcion_pollo;
CREATE POLICY recepcion_read ON public.recepcion_pollo
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() IN ('administrador','operador_planta','despachador')
    OR (
      public.get_user_es_dueno()
      AND EXISTS (
        SELECT 1 FROM public.despacho_pollo d
         WHERE d.fecha = recepcion_pollo.fecha
           AND d.sucursal_id = ANY(public.get_user_sucursales_dueno())
      )
    )
  );

DROP POLICY IF EXISTS recepciones_read ON public.pedido_recepciones;
CREATE POLICY recepciones_read ON public.pedido_recepciones
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() IN ('administrador','operador_planta','despachador')
    OR EXISTS (
      SELECT 1 FROM public.pedidos p
       WHERE p.id = pedido_recepciones.pedido_id
         AND (
           p.sucursal_id = public.get_user_sucursal()
           OR (public.get_user_es_dueno() AND p.sucursal_id = ANY(public.get_user_sucursales_dueno()))
         )
    )
  );

DROP POLICY IF EXISTS inventario_read ON public.control_inventario_diario;
CREATE POLICY inventario_read ON public.control_inventario_diario
  FOR SELECT TO authenticated USING (true);


SELECT public.get_user_es_dueno() AS soy_dueno,
       public.get_user_sucursales_dueno() AS mis_sucursales,
       (SELECT COUNT(*) FROM public.duenos) AS duenos_totales,
       (SELECT COUNT(*) FROM public.sucursal_duenos) AS asignaciones;

SELECT s.id, s.nombre, s.sector
  FROM public.sucursales s
  LEFT JOIN public.sucursal_duenos sd ON sd.sucursal_id = s.id
 WHERE sd.sucursal_id IS NULL
 ORDER BY s.sector, s.nombre;

SELECT d.id, d.nombre, d.activo, COUNT(sd.sucursal_id) AS sucursales
  FROM public.duenos d
  LEFT JOIN public.sucursal_duenos sd ON sd.dueno_id = d.id
 GROUP BY d.id, d.nombre, d.activo
 ORDER BY d.nombre;

NOTIFY pgrst, 'reload schema';
