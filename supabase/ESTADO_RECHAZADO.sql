-- ============================================================
--  ESTADO RECHAZADO EN LOS PEDIDOS
-- ------------------------------------------------------------
--  Antes un pedido que la sucursal no queria solo se podia
--  "cancelar", sin dejar razon. Este script agrega el estado
--  RECHAZADO: la sucursal (o el administrador) rechaza el pedido
--  escribiendo el motivo, el motivo queda guardado y el
--  administrador recibe un aviso.
--
--  El estado RECHAZADO solo se puede poner desde la funcion
--  rechazar_pedido: un trigger lo impide para que nadie lo
--  escriba a mano con un UPDATE.
--
--  1) Columna motivo_rechazo
--  2) CHECK de estado (pedidos e historial) con RECHAZADO
--  3) Trigger: el rechazo necesita motivo y viene de la RPC
--  4) RPC rechazar_pedido + aviso al administrador
--
--  Requiere:
--    - public.notificaciones        (REPORTE_ENTREGA_ADMIN.sql)
--
--  Ejecutar en Supabase > SQL Editor. Es seguro correrlo dos veces.
-- ============================================================

-- ------------------------------------------------------------
-- 1) El motivo del rechazo
-- ------------------------------------------------------------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;

-- ------------------------------------------------------------
-- 2) El CHECK de estado: se reemplaza el que haya (con el
--    nombre que le dio Postgres o con otro) por uno que acepte
--    RECHAZADO. Se hace por columna, para no tocar otros CHECK.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_reg RECORD;
  v_reg2 RECORD;
  v_attnum SMALLINT;
  v_nombre TEXT;
  v_lista TEXT;
BEGIN
  FOR v_reg IN
    SELECT * FROM (VALUES
      ('public.pedidos', 'estado',
       'PENDIENTE,APROBADO,EN_PREPARACION,LISTO,RECOGIDO,ENTREGADO,CANCELADO,RECHAZADO'),
      ('public.pedido_estado_historial', 'estado',
       'PENDIENTE,APROBADO,EN_PREPARACION,LISTO,RECOGIDO,ENTREGADO,CANCELADO,RECHAZADO')
    ) AS t(tabla, columna, estados)
  LOOP
    IF to_regclass(v_reg.tabla) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT attnum INTO v_attnum
      FROM pg_attribute
     WHERE attrelid = v_reg.tabla::regclass
       AND attname = v_reg.columna
       AND NOT attisdropped;

    IF v_attnum IS NULL THEN
      CONTINUE;
    END IF;

    -- Se borran los CHECK que solo miren a esa columna.
    FOR v_reg2 IN
      SELECT conname
        FROM pg_constraint
       WHERE conrelid = v_reg.tabla::regclass
         AND contype = 'c'
         AND conkey = ARRAY[v_attnum]
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_reg.tabla, v_reg2.conname);
    END LOOP;

    v_nombre := split_part(v_reg.tabla, '.', 2) || '_' || v_reg.columna || '_check';

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', v_reg.tabla, v_nombre);

    -- La lista de estados, con comillas: 'PENDIENTE','APROBADO',...
    SELECT string_agg(quote_literal(e), ', ')
      INTO v_lista
      FROM unnest(string_to_array(v_reg.estados, ',')) AS e;

    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I CHECK (%I IN (%s))',
      v_reg.tabla, v_nombre, v_reg.columna, v_lista
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3) Trigger: RECHAZADO solo con motivo y solo desde la RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pedidos_validar_rechazo()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_autorizado TEXT;
BEGIN
  IF NEW.estado = 'RECHAZADO'
     AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'RECHAZADO') THEN

    -- La RPC publica el permiso con set_config; si no esta, el
    -- rechazo vino de un UPDATE suelto y se frena.
    v_autorizado := current_setting('app.rechazo_autorizado', true);
    IF coalesce(v_autorizado, '') <> '1' THEN
      RAISE EXCEPTION 'Los pedidos se rechazan desde la opcion "Rechazar pedido"';
    END IF;

    IF NEW.motivo_rechazo IS NULL OR btrim(NEW.motivo_rechazo) = '' THEN
      RAISE EXCEPTION 'El rechazo necesita un motivo';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pedidos_validar_rechazo ON public.pedidos;
CREATE TRIGGER pedidos_validar_rechazo
  BEFORE INSERT OR UPDATE OF estado ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.pedidos_validar_rechazo();

-- ------------------------------------------------------------
-- 4) La RPC que rechaza el pedido
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

-- Se borra la RPC si ya existe, sin importar la firma exacta: si
-- queda una version con otro tipo de retorno, el CREATE de abajo
-- falla con "cannot change return type of existing function".
DO $$
DECLARE
  v_oid OID;
BEGIN
  FOR v_oid IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'rechazar_pedido'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', v_oid::regprocedure);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.rechazar_pedido(
  p_pedido_id INT,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rol TEXT;
  v_estado TEXT;
  v_sucursal_id INT;
  v_sucursal_nombre TEXT;
  v_motivo TEXT;
  v_origen_nombre TEXT;
BEGIN
  v_rol := public.get_user_rol_exacto();

  -- El superadmin no entra: el rol se compara por su nombre exacto.
  IF v_rol IS DISTINCT FROM 'sucursal' AND v_rol IS DISTINCT FROM 'administrador' THEN
    RAISE EXCEPTION 'Solo la sucursal del pedido o el administrador pueden rechazarlo';
  END IF;

  v_motivo := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  IF v_motivo IS NULL OR length(v_motivo) < 5 THEN
    RAISE EXCEPTION 'Escribe el motivo del rechazo (minimo 5 caracteres)';
  END IF;
  IF length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar 500 caracteres';
  END IF;

  SELECT p.estado, p.sucursal_id
    INTO v_estado, v_sucursal_id
    FROM public.pedidos p
   WHERE p.id = p_pedido_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontro el pedido';
  END IF;

  IF v_rol = 'sucursal' AND v_sucursal_id IS DISTINCT FROM public.get_user_sucursal() THEN
    RAISE EXCEPTION 'Solo la sucursal del pedido puede rechazarlo';
  END IF;

  -- Si ya fue aprobado, la planta ya lo esta preparando: no se
  -- rechaza, se cancela (eso lo ve el administrador).
  IF v_estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden rechazar los pedidos que siguen pendiente';
  END IF;

  -- Permiso para el trigger: el estado RECHAZADO solo se pone aca.
  PERFORM set_config('app.rechazo_autorizado', '1', true);

  UPDATE public.pedidos
     SET estado = 'RECHAZADO',
         motivo_rechazo = v_motivo,
         actualizado_en = now()
   WHERE id = p_pedido_id;

  SELECT s.nombre INTO v_sucursal_nombre
    FROM public.sucursales s
   WHERE s.id = v_sucursal_id;

  SELECT pu.nombre_completo INTO v_origen_nombre
    FROM public.perfiles_usuario pu
   WHERE pu.usuario_id = auth.uid();

  -- Aviso para los administradores (el superadmin no esta).
  INSERT INTO public.notificaciones (
    tipo, titulo, mensaje, pedido_id, sucursal_id, sucursal_nombre,
    origen_usuario_id, origen_nombre, destinatario_usuario_id
  )
  SELECT
    'PEDIDO_RECHAZADO',
    'Pedido #' || p_pedido_id || ' rechazado',
    'La sucursal ' || COALESCE(v_sucursal_nombre, 'sin nombre')
      || ' rechazó el pedido: ' || v_motivo,
    p_pedido_id,
    v_sucursal_id,
    v_sucursal_nombre,
    auth.uid(),
    v_origen_nombre,
    pu.usuario_id
  FROM public.perfiles_usuario pu
  JOIN public.roles r ON r.id = pu.rol_id
 WHERE r.nombre = 'administrador'
   AND pu.activo IS NOT FALSE
   AND pu.usuario_id IS NOT NULL;

  RETURN jsonb_build_object(
    'pedido_id', p_pedido_id,
    'estado', 'RECHAZADO',
    'motivo', v_motivo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rechazar_pedido(INT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- Verificacion
--   - el CHECK de pedidos.estado tiene que aceptar RECHAZADO
--   - la RPC tiene que existir
-- ------------------------------------------------------------
SELECT conname, pg_get_constraintdef(oid) AS definicion
  FROM pg_constraint
 WHERE conrelid = 'public.pedidos'::regclass
   AND contype = 'c'
   AND conname = 'pedidos_estado_check';

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'rechazar_pedido';
