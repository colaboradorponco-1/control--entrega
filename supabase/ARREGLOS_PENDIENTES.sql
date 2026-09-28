-- ============================================================================
--  ARREGLOS PENDIENTES: EJECUTAR UNA SOLA VEZ
-- ============================================================================
--  1. Recupera el peso que se perdio del pedido #1
--  2. Diagnostico de la funcion de recepcion  <-- LEER Y PASAR
--  3. Reconstruye la funcion de recepcion
--  4. La confirmacion de entrega avisa si el despacho no existe
--
--  No borra pedidos, sucursales ni usuarios.
-- ============================================================================

-- ############################################################################
--  recuperar_peso.sql
-- ############################################################################
-- ============================================================
--  RECUPERAR EL PESO DEL PEDIDO #1
-- ============================================================
--  Al correr la migracion de pedidos, la columna vieja 'kilos'
--  se borro antes de copiarse a 'kilos_despachados', y el peso
--  del pedido #1 se quedo en NULL.
--
--  El valor original era 240.50 kg, confirmado antes de la
--  migracion. Se restaura ahi.
--  Ejecutar en Supabase > SQL Editor
-- ============================================================

-- El trigger bloquea cambiar el peso a mano, que es lo correcto
-- en el uso diario, asi que se apaga solo durante este arreglo.
ALTER TABLE public.pedidos DISABLE TRIGGER t_pedidos_guardar;

UPDATE public.pedidos
   SET kilos_despachados = 240.50
 WHERE id = 1
   AND kilos_despachados IS NULL;

ALTER TABLE public.pedidos ENABLE TRIGGER t_pedidos_guardar;

-- Verificacion
SELECT p.id,
       p.unidades,
       p.kilos_despachados,
       p.estado,
       s.nombre AS sucursal,
       ROUND(p.kilos_despachados / NULLIF(p.unidades, 0), 3) AS kg_por_unidad
  FROM public.pedidos p
  LEFT JOIN public.sucursales s ON s.id = p.sucursal_id
 ORDER BY p.id;


-- ############################################################################
--  arreglo_recepcion.sql
-- ############################################################################
-- ============================================================
--  DIAGNOSTICO + ARREGLO DE confirmar_recepcion_pedido
-- ============================================================
--  Sintoma: al llamar la funcion, la base responde
--  42P01  relation "public.profiles_usuario" does not exist
--  aunque esa tabla existe y se puede leer sin problema.
--
--  Este script muestra el estado real y luego deja la funcion
--  escrita con variables sueltas, el mismo patron que ya usan
--  get_user_rol() y get_user_sucursal(), que si funcionan.
--
--  Ejecutar en Supabase > SQL Editor
-- ============================================================


-- ------------------------------------------------------------
-- 1) DIAGNOSTICO: leer esto y pasamelo
-- ------------------------------------------------------------
SELECT p.proname                       AS funcion,
       pg_get_function_identity_arguments(p.oid) AS parametros,
       l.lanname                        AS lenguaje,
       p.prosecdef                      AS es_security_definer,
       p.proconfig                      AS search_path_configurado
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
 WHERE n.nspname = 'public'
   AND p.proname IN ('confirmar_recepcion_pedido','recoger_pedido','get_user_rol')
 ORDER BY p.proname, parametros;

-- La tabla existe? Debe salir 'si'
SELECT 'perfiles_usuario existe' AS chequeo,
       to_regclass('public.profiles_usuario') IS NOT NULL AS resultado;

-- Quien es el dueno de la funcion? Si no es postgres, puede que
-- no tenga permiso sobre el schema public.
SELECT p.proname AS funcion,
       pg_get_userbyid(p.proowner) AS dueno,
       has_schema_privilege(p.proowner, 'public', 'USAGE') AS dueno_tiene_uso_de_public,
       has_table_privilege(p.proowner, 'public.perfiles_usuario', 'SELECT') AS dueno_puede_leer_perfiles
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'confirmar_recepcion_pedido';


-- ------------------------------------------------------------
-- 2) RECONSTRUCCION DE LA FUNCION
-- Mismas reglas y validaciones, sin variable de tipo tabla.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(INT, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION public.confirmar_recepcion_pedido(
  p_pedido_id INT,
  p_unidades_recibidas INT,
  p_foto_url TEXT,
  p_firma_url TEXT,
  p_recibido_por TEXT DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitud NUMERIC DEFAULT NULL
)
RETURNS public.pedido_recepciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido_sucursal  INT;
  v_pedido_unidades  INT;
  v_pedido_kilos     NUMERIC;
  v_pedido_estado    TEXT;
  v_perfil_id        INT;
  v_perfil_sucursal  INT;
  v_despachado_por   INT;
  v_faltantes        BOOLEAN;
  v_id_recepcion     INT;
BEGIN
  -- El pedido tiene que existir
  SELECT p.sucursal_id, p.unidades, p.kilos_despachados, p.estado
    INTO v_pedido_sucursal, v_pedido_unidades, v_pedido_kilos, v_pedido_estado
    FROM public.pedidos p
   WHERE p.id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;

  -- El perfil tiene que existir
  SELECT pr.id, pr.sucursal_id
    INTO v_perfil_id, v_perfil_sucursal
    FROM public.perfiles_usuario pr
   WHERE pr.usuario_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  -- Solo la sucursal del pedido, o el administrador
  IF public.get_user_rol() <> 'administrador'
     AND v_pedido_sucursal <> v_perfil_sucursal THEN
    RAISE EXCEPTION 'No tenes permiso para recibir este pedido';
  END IF;

  IF v_pedido_estado <> 'RECOGIDO' THEN
    RAISE EXCEPTION 'El pedido aun no fue recogido (estado actual: %)', v_pedido_estado;
  END IF;

  IF v_pedido_kilos IS NULL THEN
    RAISE EXCEPTION 'El pedido no tiene peso registrado, pedi al despachador que lo registre';
  END IF;

  IF p_unidades_recibidas IS NULL OR p_unidades_recibidas < 0 THEN
    RAISE EXCEPTION 'Las unidades recibidas no pueden ser negativas';
  END IF;

  -- La evidencia es obligatoria
  IF p_foto_url IS NULL OR btrim(p_foto_url) = '' THEN
    RAISE EXCEPTION 'Adjunta la foto de la entrega, es la evidencia de que llego el pedido';
  END IF;

  IF p_firma_url IS NULL OR btrim(p_firma_url) = '' THEN
    RAISE EXCEPTION 'Falta la firma de quien recibio el pedido';
  END IF;

  IF p_recibido_por IS NULL OR btrim(p_recibido_por) = '' THEN
    RAISE EXCEPTION 'Escribe el nombre de quien recibio el pedido';
  END IF;

  -- Y tiene que existir de verdad, no basta con inventar la ruta
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
     WHERE bucket_id = 'evidencias' AND name = p_foto_url
  ) THEN
    RAISE EXCEPTION 'La foto no se subio, volvela a adjuntar';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
     WHERE bucket_id = 'evidencias' AND name = p_firma_url
  ) THEN
    RAISE EXCEPTION 'La firma no se subio, volvela a dibujar';
  END IF;

  v_faltantes := p_unidades_recibidas < v_pedido_unidades;

  -- El inventario solo se descuenta si hay unidades de verdad
  IF p_unidades_recibidas > 0 THEN
    INSERT INTO public.despacho_pollo (
      fecha, kilos, unidades, sucursal_id, estado_recepcion,
      observaciones, despachado_por, pedido_id
    )
    VALUES (
      CURRENT_DATE,
      v_pedido_kilos,
      p_unidades_recibidas,
      v_pedido_sucursal,
      'RECIBIDO',
      p_observaciones,
      v_perfil_id,
      p_pedido_id
    )
    RETURNING id INTO v_despachado_por;
  END IF;

  INSERT INTO public.pedido_recepciones (
    pedido_id, unidades_recibidas, faltantes, observaciones,
    recibido_por, recibido_por_nombre, foto_url, firma_url,
    latitude, longitud
  )
  VALUES (
    p_pedido_id,
    p_unidades_recibidas,
    v_faltantes,
    p_observaciones,
    auth.uid(),
    btrim(p_recibido_por),
    p_foto_url,
    p_firma_url,
    p_latitude,
    p_longitud
  )
  RETURNING id INTO v_id_recepcion;

  UPDATE public.pedidos SET estado = 'ENTREGADO' WHERE id = p_pedido_id;

  RETURN (SELECT r FROM public.pedido_recepciones r WHERE r.id = v_id_recepcion);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_recepcion_pedido(
  INT, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC
) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 3) COMPROBACION
-- ------------------------------------------------------------
-- Tiene que responder con un error de negocio, no con 42P01.
-- Expected: "El pedido no existe"
SELECT 'funcion reconstruida' AS estado;


-- ############################################################################
--  arreglo_rls.sql
-- ############################################################################
-- ============================================================
-- CIERRE DE SEGURIDAD: la sucursal solo confirma la entrega
--
-- La politica RLS protegia la FILA, pero no las COLUMNAS.
-- Un usuario de sucursal podia enviar su propia peticion y
-- cambiar los kilos o las unidades de un despacho.
--
-- RLS no permite restringir columnas, asi que se quita la
-- politica de UPDATE para el rol sucursal y se usa una funcion
-- que solo toca estado_recepcion y observaciones.
--
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1) FUNCION SEGURA DE CONFIRMACION
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_entrega_despacho(
  p_despacho_id INT,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS public.despacho_pollo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_despacho public.despacho_pollo;
BEGIN
  IF public.get_user_rol() <> 'administrador' THEN
    IF public.get_user_rol() <> 'sucursal' THEN
      RAISE EXCEPTION 'Solo la sucursal receptora o un administrador pueden confirmar la entrega';
    END IF;

    SELECT * INTO v_despacho
      FROM public.despacho_pollo
     WHERE id = p_despacho_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El despacho no existe';
    END IF;

    IF v_despacho.sucursal_id IS DISTINCT FROM public.get_user_sucursal() THEN
      RAISE EXCEPTION 'Ese despacho no pertenece a tu sucursal';
    END IF;
  END IF;

  -- Solo se modifican estos dos campos. Kilos y unidades quedan intactos.
  UPDATE public.despacho_pollo
     SET estado_recepcion = 'RECIBIDO',
         observaciones = COALESCE(NULLIF(TRIM(p_observaciones), ''), NULL)
   WHERE id = p_despacho_id
  RETURNING * INTO v_despacho;

  -- Si no se actualizo ninguna fila es que el despacho no existe.
  -- Para el administrador esta era la unica comprobacion: la de
  -- arriba solo corre cuando el que llama no es admin.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El despacho no existe';
  END IF;

  RETURN v_despacho;
END;
$$;

-- ------------------------------------------------------------
-- 2) QUITAR EL UPDATE DIRECTO DE LA SUCURSAL
-- El despachador y el administrador conservan el acceso normal.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS despacho_confirmar ON public.despacho_pollo;

GRANT EXECUTE ON FUNCTION public.confirmar_entrega_despacho(INT, TEXT) TO authenticated;

-- La tabla sigue sin UPDATE directo para el rol sucursal:
-- la unica via es la funcion de arriba.

