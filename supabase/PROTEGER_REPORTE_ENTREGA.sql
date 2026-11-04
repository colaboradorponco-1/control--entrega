-- ============================================================
--  PROTEGER EL REPORTE DE ENTREGA
-- ------------------------------------------------------------
--  El reporte de entrega (estado del pollo, observaciones y
--  fotos) es informacion reservada del ADMINISTRADOR. Antes
--  vivia en public.pedido_recepciones y, como RLS trabaja por
--  fila y no por columna, el superadmin podia leer esas
--  columnas por la API igual que el administrador.
--
--  Aqui el reporte se muda a su propia tabla:
--
--    public.pedido_reportes_entrega
--      - la escribe solo la RPC de envio (SECURITY DEFINER)
--      - la leen el administrador, la sucursal del pedido y el
--        dueno de esa sucursal
--      - el superadmin queda afuera, sin excepciones
--
--  1) Helper get_user_rol_exacto(): el rol real, sin el mapeo
--     de get_user_rol() (que convierte superadmin en administrador)
--  2) Tabla public.pedido_reportes_entrega con RLS
--  3) Se pasa a la tabla nueva lo que ya habia
--  4) RPC nueva: enviar_observaciones_entrega_pedido
--  5) Se borran del pedido_recepciones las columnas del reporte
--  6) Politicas del bucket: el superadmin no descarga las fotos
--     del reporte
--
--  Requiere:
--    - public.notificaciones y get_user_es_admin() (REPORTE_ENTREGA_ADMIN.sql)
--    - public.validar_fotos_extra(...)             (ARREGLAR_HELPERS_EVIDENCIA.sql)
--
--  IMPORTANTE: este script va AL FINAL de la lista. Si despues
--  se corre REPORTE_ENTREGA_SUCURSAL.sql o REPORTE_ENTREGA_ADMIN.sql,
--  la RPC vuelve a escribir el reporte en pedido_recepciones (y
--  esas columnas ya no existen, asi que falla): hay que correr
--  este script otra vez para dejar la proteccion puesta.
--
--  Ejecutar en Supabase > SQL Editor. Es seguro correrlo dos veces.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Helper: el rol real del usuario
--    get_user_rol() devuelve 'administrador' tambien para el
--    superadmin, asi que para separar los dos hace falta el
--    nombre del rol tal cual esta en la tabla public.roles.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_rol_exacto()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.nombre
    FROM public.perfiles_usuario pu
    JOIN public.roles r ON r.id = pu.rol_id
   WHERE pu.usuario_id = auth.uid()
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_rol_exacto() TO authenticated;

-- Helper del administrador: TRUE solo para el rol 'administrador'
-- (el superadmin tiene rol 'superadmin', asi que queda fuera). Se
-- define aqui para que el script no dependa del orden.
CREATE OR REPLACE FUNCTION public.get_user_es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.perfiles_usuario pu
      JOIN public.roles r ON r.id = pu.rol_id
     WHERE pu.usuario_id = auth.uid()
       AND r.nombre = 'administrador'
       AND pu.activo IS NOT FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_es_admin() TO authenticated;

-- ------------------------------------------------------------
-- 2) La tabla del reporte, con su RLS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pedido_reportes_entrega (
  id BIGSERIAL PRIMARY KEY,
  pedido_id INT NOT NULL UNIQUE REFERENCES public.pedidos(id) ON DELETE CASCADE,
  sucursal_id INT REFERENCES public.sucursales(id) ON DELETE SET NULL,
  observaciones TEXT,
  estado_producto TEXT,
  fotos TEXT[] NOT NULL DEFAULT '{}',
  enviado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  enviado_por_nombre TEXT
);

CREATE INDEX IF NOT EXISTS idx_pedido_reportes_entrega_sucursal
  ON public.pedido_reportes_entrega (sucursal_id);

ALTER TABLE public.pedido_reportes_entrega ENABLE ROW LEVEL SECURITY;

-- Lectura: el administrador, la sucursal del pedido y el dueno de
-- esa sucursal. El superadmin no entra por ningun lado: su rol se
-- llama 'superadmin' y get_user_es_admin() solo es TRUE para
-- 'administrador'.
DROP POLICY IF EXISTS reportes_entrega_leer ON public.pedido_reportes_entrega;
CREATE POLICY reportes_entrega_leer ON public.pedido_reportes_entrega
  FOR SELECT TO authenticated
  USING (
    public.get_user_es_admin()
    OR (
      public.get_user_rol_exacto() = 'sucursal'
      AND sucursal_id = public.get_user_sucursal()
    )
    OR (
      public.get_user_es_dueno()
      AND sucursal_id = ANY(public.get_user_sucursales_dueno())
    )
  );

-- No hay politica de INSERT, UPDATE ni DELETE: el reporte lo
-- escribe la RPC de abajo (SECURITY DEFINER) y nadie mas.
GRANT SELECT ON public.pedido_reportes_entrega TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pedido_reportes_entrega_id_seq TO authenticated;

COMMENT ON TABLE public.pedido_reportes_entrega IS
  'Reporte de entrega de cada pedido. Lo lee el administrador, la sucursal del pedido y el dueno de esa sucursal; el superadmin no.';

-- ------------------------------------------------------------
-- 3) Lo que ya habia en pedido_recepciones pasa a la tabla nueva
--    Va dentro de un bloque porque, si el script ya se corrio una
--    vez, estas columnas ya no existen (se borran en el paso 5) y
--    la sentencia no se puede preparar.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pedido_recepciones'
       AND column_name = 'observaciones_entrega'
  ) THEN
    INSERT INTO public.pedido_reportes_entrega (
      pedido_id, sucursal_id, observaciones, estado_producto, fotos, enviado_en
    )
    SELECT DISTINCT ON (r.pedido_id)
           r.pedido_id,
           p.sucursal_id,
           r.observaciones_entrega,
           r.estado_producto,
           COALESCE(r.fotos_observaciones, '{}'::text[]),
           COALESCE(r.observaciones_entrega_en, now())
      FROM public.pedido_recepciones r
      JOIN public.pedidos p ON p.id = r.pedido_id
     WHERE r.observaciones_entrega IS NOT NULL
        OR r.estado_producto IS NOT NULL
        OR COALESCE(cardinality(r.fotos_observaciones), 0) > 0
     ORDER BY r.pedido_id, r.id DESC
    ON CONFLICT (pedido_id) DO UPDATE
       SET observaciones   = EXCLUDED.observaciones,
           estado_producto = EXCLUDED.estado_producto,
           fotos           = EXCLUDED.fotos,
           enviado_en      = EXCLUDED.enviado_en;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4) La RPC del reporte: ahora escribe en la tabla nueva
-- ------------------------------------------------------------
--  Antes de reemplazar la RPC conviene ver cual estaba viva: se
--  deja el aviso de la version que habia (y si frenaba por rol).
--  NOTA: la version que estaba en la base NO frenaba por rol (el
--  guard usaba una comparacion que con NULL no se dispara), asi
--  que cualquier usuario autenticado podia enviar el reporte de
--  un pedido ajeno. La de abajo ya usa IS DISTINCT FROM.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       position('IS DISTINCT FROM' IN pg_get_functiondef(p.oid)) > 0 AS frena_por_rol
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'enviar_observaciones_entrega_pedido'
 ORDER BY argumentos;

-- Se borran TODAS las versiones de la RPC (las de 2, 3 y 4
-- argumentos) sin importar si sus argumentos son TEXT o VARCHAR:
-- si queda una version con otra firma, el CREATE de abajo falla con
-- "cannot change return type of existing function".
DO $$
DECLARE
  v_oid OID;
BEGIN
  FOR v_oid IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'enviar_observaciones_entrega_pedido'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', v_oid::regprocedure);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.enviar_observaciones_entrega_pedido(
  p_pedido_id INT,
  p_observaciones TEXT DEFAULT NULL,
  p_estado_producto TEXT DEFAULT NULL,
  p_fotos TEXT[] DEFAULT NULL
)
RETURNS public.pedido_reportes_entrega
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reporte public.pedido_reportes_entrega;
  v_estado TEXT;
  v_sucursal_id INT;
  v_sucursal_nombre TEXT;
  v_recibido_en TIMESTAMPTZ;
  v_limite TIMESTAMPTZ;
  v_fotos TEXT[];
  v_observaciones TEXT;
  v_origen_nombre TEXT;
BEGIN
  -- IS DISTINCT FROM y no <>: con rol NULL (usuario sin perfil o
  -- llamada sin sesion) la comparacion da NULL y el IF no se
  -- dispara, dejando pasar a cualquiera.
  IF public.get_user_rol() IS DISTINCT FROM 'sucursal' THEN
    RAISE EXCEPTION 'Solo la sucursal receptora puede enviar este reporte';
  END IF;

  IF p_observaciones IS NOT NULL AND length(btrim(p_observaciones)) > 2000 THEN
    RAISE EXCEPTION 'Las observaciones no pueden superar 2000 caracteres';
  END IF;

  IF p_estado_producto IS NOT NULL
     AND p_estado_producto NOT IN ('FRESCO', 'TIBIO', 'EMBALAJE', 'DETERIORO', 'OTRO') THEN
    RAISE EXCEPTION 'El estado del producto no es valido';
  END IF;

  SELECT p.estado, p.sucursal_id, r.recibido_en
    INTO v_estado, v_sucursal_id, v_recibido_en
    FROM public.pedidos p
    JOIN public.pedido_recepciones r ON r.pedido_id = p.id
   WHERE p.id = p_pedido_id
   FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontro la recepcion de este pedido';
  END IF;
  IF v_sucursal_id IS DISTINCT FROM public.get_user_sucursal() THEN
    RAISE EXCEPTION 'Solo la sucursal del pedido puede enviar este reporte';
  END IF;
  IF v_estado <> 'ENTREGADO' THEN
    RAISE EXCEPTION 'El pedido debe estar entregado antes de enviar el reporte';
  END IF;

  -- El reporte ya no vive en pedido_recepciones: se mira en su
  -- propia tabla, que es la que el superadmin no puede leer.
  IF EXISTS (
    SELECT 1 FROM public.pedido_reportes_entrega WHERE pedido_id = p_pedido_id
  ) THEN
    RAISE EXCEPTION 'El reporte de este pedido ya fue enviado';
  END IF;

  -- Con al menos un dato alcanza: el estado, una observacion o una foto.
  IF p_estado_producto IS NULL
     AND (p_observaciones IS NULL OR btrim(p_observaciones) = '')
     AND (p_fotos IS NULL OR cardinality(p_fotos) = 0) THEN
    RAISE EXCEPTION 'Marca el estado del pollo, escribe una observacion o adjunta una foto';
  END IF;

  -- 7 dias desde la recepcion. El reporte documenta como llego el
  -- pollo, asi que la sucursal necesita margen para revisarlo.
  v_limite := v_recibido_en + INTERVAL '7 days';
  IF now() > v_limite THEN
    RAISE EXCEPTION 'El plazo para enviar el reporte vencio (7 dias despues de recibir el pedido)';
  END IF;

  v_fotos := public.validar_fotos_extra(
    p_fotos,
    'pedido-' || p_pedido_id || '/observaciones/'
  );

  v_observaciones := NULLIF(btrim(COALESCE(p_observaciones, '')), '');

  SELECT pu.nombre_completo INTO v_origen_nombre
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  INSERT INTO public.pedido_reportes_entrega (
    pedido_id, sucursal_id, observaciones, estado_producto, fotos,
    enviado_en, enviado_por, enviado_por_nombre
  )
  VALUES (
    p_pedido_id, v_sucursal_id, v_observaciones, p_estado_producto, v_fotos,
    now(), auth.uid(), v_origen_nombre
  )
  RETURNING * INTO v_reporte;

  SELECT s.nombre INTO v_sucursal_nombre
    FROM public.sucursales s
   WHERE s.id = v_sucursal_id;

  -- El aviso va a cada administrador activo. El superadmin no entra
  -- porque su rol se llama 'superadmin', no 'administrador'.
  INSERT INTO public.notificaciones (
    tipo, titulo, mensaje, pedido_id, sucursal_id, sucursal_nombre,
    estado_producto, observaciones_entrega, fotos_observaciones,
    origen_usuario_id, origen_nombre, destinatario_usuario_id
  )
  SELECT
    'REPORTE_ENTREGA',
    'Reporte de entrega - Pedido #' || p_pedido_id,
    'La sucursal ' || COALESCE(v_sucursal_nombre, 'sin nombre') || ' reportó en qué estado recibió el pollo.',
    p_pedido_id,
    v_sucursal_id,
    v_sucursal_nombre,
    p_estado_producto,
    v_observaciones,
    v_fotos,
    auth.uid(),
    v_origen_nombre,
    pu.usuario_id
  FROM public.perfiles_usuario pu
  JOIN public.roles r ON r.id = pu.rol_id
 WHERE r.nombre = 'administrador'
   AND pu.activo IS NOT FALSE
   AND pu.usuario_id IS NOT NULL;

  RETURN v_reporte;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enviar_observaciones_entrega_pedido(
  INT, TEXT, TEXT, TEXT[]
) TO authenticated;

-- ------------------------------------------------------------
-- 5) Las columnas del reporte salen de pedido_recepciones
--    Ahora que el reporte esta en su propia tabla, estas columnas
--    soloarian de callejon: sin ellas el superadmin deja de tener
--    algo que leer en esa tabla.
-- ------------------------------------------------------------
ALTER TABLE public.pedido_recepciones
  DROP COLUMN IF EXISTS observaciones_entrega,
  DROP COLUMN IF EXISTS observaciones_entrega_en,
  DROP COLUMN IF EXISTS estado_producto,
  DROP COLUMN IF EXISTS fotos_observaciones;

-- ------------------------------------------------------------
-- 6) Politicas del bucket 'evidencias'
--    Las fotos del reporte viven en 'pedido-<id>/observaciones/'.
--    El superadmin sigue viendo la evidencia operativa, pero de
--    ahi no: esas fotos son del administrador.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS evidencias_ver ON storage.objects;
CREATE POLICY evidencias_ver ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidencias'
    AND public.get_user_rol_exacto() IN ('administrador', 'operador_planta', 'despachador', 'sucursal')
    AND (
      public.get_user_rol_exacto() <> 'superadmin'
      OR storage.objects.name NOT LIKE '%/observaciones/%'
    )
  );

DROP POLICY IF EXISTS evidencias_administrar ON storage.objects;
CREATE POLICY evidencias_administrar ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'evidencias'
    AND public.get_user_rol_exacto() IN ('administrador', 'operador_planta', 'despachador', 'sucursal', 'superadmin')
    AND (
      public.get_user_rol_exacto() <> 'superadmin'
      OR storage.objects.name NOT LIKE '%/observaciones/%'
    )
  )
  WITH CHECK (
    bucket_id = 'evidencias'
    AND public.get_user_rol_exacto() IN ('administrador', 'operador_planta', 'despachador', 'sucursal', 'superadmin')
    AND (
      public.get_user_rol_exacto() <> 'superadmin'
      OR storage.objects.name NOT LIKE '%/observaciones/%'
    )
  );

DROP POLICY IF EXISTS evidencias_subir ON storage.objects;
CREATE POLICY evidencias_subir ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidencias'
    AND public.get_user_rol_exacto() IN ('sucursal', 'despachador', 'operador_planta', 'administrador')
  );

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Verificacion
--   - debe quedar UNA sola version de la RPC, la de 4 argumentos,
--     y tiene que frenar por rol
--   - las columnas del reporte ya no pueden existir en
--     pedido_recepciones (la consulta tiene que devolver 0 filas)
-- ------------------------------------------------------------
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       position('IS DISTINCT FROM' IN pg_get_functiondef(p.oid)) > 0 AS frena_por_rol
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'enviar_observaciones_entrega_pedido'
 ORDER BY argumentos;

SELECT count(*) AS columnas_del_reporte_que_quedan
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'pedido_recepciones'
   AND column_name IN ('observaciones_entrega', 'observaciones_entrega_en', 'estado_producto', 'fotos_observaciones');

SELECT count(*) AS politicas_del_bucket
  FROM pg_policies
 WHERE schemaname = 'storage'
   AND tablename = 'objects'
   AND policyname IN ('evidencias_ver', 'evidencias_administrar', 'evidencias_subir');
