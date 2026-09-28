-- ============================================================
--  LOS TRES FORMULARIOS DEL POLLO  (ejecutar en la BD)
-- ============================================================
--  1) PROVEEDOR -> PLANTA      foto + 2 firmas + precio
--  2) PLANTA -> DISTRIBUIDOR   foto + firma + precio + transportista
--  3) DISTRIBUIDOR -> SUCURSAL foto + firma   (tambien en ARREGLOS)
--
--  Ademas, hasta 7 fotos de apoyo en las observaciones de
--  cada formulario, aparte de la foto principal.
--
--  ORDEN:  1) ARREGLOS_PENDIENTES.sql    2) ESTE ARCHIVO
--  No borra datos. Se puede volver a correr.
-- ============================================================
-- ============================================================
--  LOS TRES FORMULARIOS DEL POLLO  (ejecutar en la BD)
-- ============================================================
--  1) PROVEEDOR -> PLANTA      foto + 2 firmas + precio
--  2) PLANTA -> DISTRIBUIDOR   foto + firma + precio + transportista
--  3) DISTRIBUIDOR -> SUCURSAL foto + firma   (ya en ARREGLOS)
--
--  ORDEN:  1) ARREGLOS_PENDIENTES.sql    2) ESTE ARCHIVO
--  No borra datos. Se puede volver a correr.
-- ============================================================
-- ============================================================
--  LOS TRES FORMULARIOS DEL POLLO  (ejecutar en la BD)
-- ============================================================
--  1) PROVEEDOR -> PLANTA      foto + 2 firmas + precio
--  2) PLANTA -> DISTRIBUIDOR   foto + firma + precio
--  3) DISTRIBUIDOR -> SUCURSAL foto + firma   (ya en ARREGLOS)
--
--  ORDEN:  1) ARREGLOS_PENDIENTES.sql    2) ESTE ARCHIVO
--  No borra datos. Se puede volver a correr.
-- ============================================================
-- ============================================================
--  LOS TRES FORMULARIOS DEL POLLO
-- ============================================================
--  Todo el recorrido del pollo lleva evidencia: foto y firma.
--
--  1) PROVEEDOR -> PLANTA   (recibe el encargado de planta)
--     Lote, proveedor, kilos, unidades, precio, total, foto,
--     y DOS firmas: la de quien trae y la de quien recibe.
--
--  2) PLANTA -> DISTRIBUIDOR (carga el despachador)
--     Kilos, unidades, precio, total, a que sucursal, con quien
--     va, foto y firma de quien autoriza la salida.
--
--  3) DISTRIBUIDOR -> SUCURSAL (recibe el usuario de la sucursal)
--     Unidades recibidas, quien recibio, observaciones, foto y
--     firma. Solo ahi el pedido queda entregado.
--
--  Ejecutar DESPUES de ARREGLOS_PENDIENTES.sql
--  No borra datos. Se puede volver a correr.
-- ============================================================


-- ------------------------------------------------------------
-- 0) FOTOS EXTRA EN OBSERVACIONES
-- Ademas de la foto principal, se pueden adjuntar hasta 7 fotos
-- mas de apoyo en las observaciones. Son opcionales.
-- ------------------------------------------------------------
ALTER TABLE public.recepcion_pollo
  ADD COLUMN IF NOT EXISTS fotos_extra TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.despacho_pollo
  ADD COLUMN IF NOT EXISTS fotos_extra TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.pedido_recepciones
  ADD COLUMN IF NOT EXISTS fotos_extra TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.recepcion_pollo.fotos_extra IS
  'Fotos de apoyo en las observaciones, hasta 7, aparte de la foto principal';

-- El limite de 7 lo pone la base, no solo el formulario.
-- p_prefijo es el inicio de la ruta y DEBE traer el separador que le
-- sigue en la ruta real, porque el cliente le agrega un sello de tiempo:
--   lotes  -> 'lote-123-'   (la ruta es lote-123-1699999999/...)
--   pedidos-> 'pedido-123/' (la ruta es pedido-123/...)
-- Asi una foto del pedido 1234 no pasa por el control del pedido 123.
CREATE OR REPLACE FUNCTION public.validar_fotos_extra(p_fotos TEXT[], p_prefijo TEXT)
RETURNS TEXT[] AS $$
DECLARE
  v_limpias TEXT[] := '{}';
  v_foto TEXT;
BEGIN
  IF p_fotos IS NULL OR cardinality(p_fotos) = 0 THEN
    RETURN v_limpias;
  END IF;

  IF cardinality(p_fotos) > 7 THEN
    RAISE EXCEPTION 'Solo se pueden adjuntar 7 fotos de apoyo, van %', cardinality(p_fotos);
  END IF;

  FOREACH v_foto IN ARRAY p_fotos LOOP
    IF v_foto IS NULL OR btrim(v_foto) = '' THEN
      CONTINUE;
    END IF;
    -- la foto tiene que ir en la carpeta de su propio registro
    IF p_prefijo IS NOT NULL AND v_foto NOT LIKE p_prefijo || '%' THEN
      RAISE EXCEPTION 'La foto % no pertenece a este registro', v_foto;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects
       WHERE bucket_id = 'evidencias' AND name = v_foto
    ) THEN
      RAISE EXCEPTION 'La foto % no se subio, volvela a adjuntar', v_foto;
    END IF;
    v_limpias := array_append(v_limpias, v_foto);
  END LOOP;

  RETURN v_limpias;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 1) COLUMNAS
-- ------------------------------------------------------------

-- FORMULARIO 1: lo que llega del proveedor
ALTER TABLE public.recepcion_pollo
  ADD COLUMN IF NOT EXISTS observaciones TEXT,
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS firma_entrega_url TEXT,      -- firma de quien trae
  ADD COLUMN IF NOT EXISTS firma_recepcion_url TEXT,   -- firma del encargado
  ADD COLUMN IF NOT EXISTS entregado_por_nombre TEXT,   -- chofer del proveedor
  ADD COLUMN IF NOT EXISTS recibido_por_nombre TEXT,    -- encargado de planta
  ADD COLUMN IF NOT EXISTS recibido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.recepcion_pollo.firma_entrega_url IS
  'Firma de quien trae el pollo a la planta';
COMMENT ON COLUMN public.recepcion_pollo.firma_recepcion_url IS
  'Firma del encargado de planta que recibe';

-- FORMULARIO 2: lo que sale de la planta
ALTER TABLE public.despacho_pollo
  ADD COLUMN IF NOT EXISTS precio_por_kilo NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS transportista TEXT,          -- con quien va
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS firma_url TEXT,              -- quien autoriza la salida
  ADD COLUMN IF NOT EXISTS entregado_por_nombre TEXT,   -- encargado de planta
  ADD COLUMN IF NOT EXISTS pedido_id INT REFERENCES public.pedidos(id) ON DELETE SET NULL;

-- un pedido se carga una sola vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_despacho_pedido
  ON public.despacho_pollo(pedido_id) WHERE pedido_id IS NOT NULL;

-- El total lo calcula la base, no lo escribe el usuario
ALTER TABLE public.despacho_pollo
  DROP COLUMN IF EXISTS total_monto;

ALTER TABLE public.despacho_pollo
  ADD COLUMN IF NOT EXISTS total_monto NUMERIC(14,2)
    GENERATED ALWAYS AS (ROUND(kilos * COALESCE(precio_por_kilo, 0), 2)) STORED;

COMMENT ON COLUMN public.despacho_pollo.transportista IS
  'Nombre del distribuidor o chofer que se lleva la carga';
COMMENT ON COLUMN public.despacho_pollo.firma_url IS
  'Firma de quien autoriza la salida del pollo de la planta';


-- ------------------------------------------------------------
-- 2) LA EVIDENCIA NO ES OPCIONAL
-- Si alguien inserta o edita una recepcion o un despacho sin
-- foto y firma, la base lo rechaza. Asi no se puede esquivar
-- el formulario yendo directo por la API.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.exigir_evidencia_movimiento()
RETURNS TRIGGER AS $$
DECLARE
  v_tabla TEXT := TG_TABLE_NAME;
BEGIN
  -- En un UPDATE la evidencia ya puesta no se puede sacar
  IF TG_OP = 'UPDATE' THEN
    -- Cada campo se compara solo con los de su propia tabla
    IF NEW.foto_url IS DISTINCT FROM OLD.foto_url THEN
      RAISE EXCEPTION 'La foto de un movimiento no se puede cambiar ni quitar';
    END IF;
    IF NEW.fotos_extra IS DISTINCT FROM OLD.fotos_extra THEN
      RAISE EXCEPTION 'Las fotos de apoyo no se pueden cambiar ni quitar';
    END IF;
    IF v_tabla = 'recepcion_pollo' THEN
      IF NEW.firma_entrega_url IS DISTINCT FROM OLD.firma_entrega_url
         OR NEW.firma_recepcion_url IS DISTINCT FROM OLD.firma_recepcion_url THEN
        RAISE EXCEPTION 'Las firmas de un lote no se pueden cambiar ni quitar';
      END IF;
    ELSE
      IF NEW.firma_url IS DISTINCT FROM OLD.firma_url THEN
        RAISE EXCEPTION 'La firma de una carga no se puede cambiar ni quitar';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_tabla = 'recepcion_pollo' THEN
    IF NEW.foto_url IS NULL OR btrim(NEW.foto_url) = '' THEN
      RAISE EXCEPTION 'Adjunta la foto del lote que esta llegando';
    END IF;
    IF NEW.firma_entrega_url IS NULL OR btrim(NEW.firma_entrega_url) = '' THEN
      RAISE EXCEPTION 'Falta la firma de quien trae el pollo';
    END IF;
    IF NEW.firma_recepcion_url IS NULL OR btrim(NEW.firma_recepcion_url) = '' THEN
      RAISE EXCEPTION 'Falta la firma del encargado que recibe';
    END IF;
    IF NEW.entregado_por_nombre IS NULL OR btrim(NEW.entregado_por_nombre) = '' THEN
      RAISE EXCEPTION 'Escribe el nombre de quien trae el pollo';
    END IF;
  END IF;

  IF v_tabla = 'despacho_pollo' THEN
    IF NEW.foto_url IS NULL OR btrim(NEW.foto_url) = '' THEN
      RAISE EXCEPTION 'Adjunta la foto de la carga que se lleva el distribuidor';
    END IF;
    IF NEW.firma_url IS NULL OR btrim(NEW.firma_url) = '' THEN
      RAISE EXCEPTION 'Falta la firma de quien autoriza la salida';
    END IF;
    IF NEW.transportista IS NULL OR btrim(NEW.transportista) = '' THEN
      RAISE EXCEPTION 'Escribe con quien va el pollo, el nombre del distribuidor';
    END IF;
    IF NEW.precio_por_kilo IS NULL OR NEW.precio_por_kilo < 0 THEN
      RAISE EXCEPTION 'Ingresa el precio por kilo de la venta';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_evidencia_recepcion ON public.recepcion_pollo;
CREATE TRIGGER t_evidencia_recepcion
  BEFORE INSERT OR UPDATE ON public.recepcion_pollo
  FOR EACH ROW EXECUTE FUNCTION public.exigir_evidencia_movimiento();

DROP TRIGGER IF EXISTS t_evidencia_despacho ON public.despacho_pollo;
CREATE TRIGGER t_evidencia_despacho
  BEFORE INSERT OR UPDATE ON public.despacho_pollo
  FOR EACH ROW EXECUTE FUNCTION public.exigir_evidencia_movimiento();


-- ------------------------------------------------------------
-- 3) COMPROBAR QUE LAS FIRMAS EXISTEN DE VERDAD
-- Con que manden una ruta inventada no alcanza: el archivo
-- tiene que estar de verdad en el almacen.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verificar_archivo(p_bucket TEXT, p_nombre TEXT, p_que TEXT)
RETURNS VOID AS $$
BEGIN
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'Falta %', p_que;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
     WHERE bucket_id = p_bucket AND name = p_nombre
  ) THEN
    RAISE EXCEPTION '% no se subio, volvela a adjuntar', p_que;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 4) FORMULARIO 1: LOTE QUE LLEGA DEL PROVEEDOR
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.registrar_lote_proveedor(
  TEXT, INT, NUMERIC, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
);
DROP FUNCTION IF EXISTS public.registrar_lote_proveedor(
  TEXT, INT, NUMERIC, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);
DROP FUNCTION IF EXISTS public.registrar_lote_proveedor(
  TEXT, INT, NUMERIC, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.registrar_lote_proveedor(
  p_numero_recibo TEXT,
  p_proveedor_id INT,
  p_kilos NUMERIC,
  p_unidades INT,
  p_precio_por_kilo NUMERIC,
  p_foto_url TEXT,
  p_firma_entrega_url TEXT,
  p_firma_recepcion_url TEXT,
  p_entregado_por TEXT,
  p_observaciones TEXT DEFAULT NULL,
  p_recibido_por TEXT DEFAULT NULL,
  p_fotos_extra TEXT[] DEFAULT NULL
)
RETURNS public.recepcion_pollo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_creado_por INT;
  v_id INT;
  v_recibe TEXT;
  v_fotos TEXT[];
BEGIN
  IF public.get_user_rol() NOT IN ('operador_planta','administrador') THEN
    RAISE EXCEPTION 'Solo el encargado de planta puede registrar la llegada de un lote';
  END IF;

  IF p_numero_recibo IS NULL OR btrim(p_numero_recibo) = '' THEN
    RAISE EXCEPTION 'Ingresa el numero de recibo o lote';
  END IF;
  IF p_proveedor_id IS NULL THEN
    RAISE EXCEPTION 'Elige el proveedor';
  END IF;
  IF p_kilos IS NULL OR p_kilos <= 0 THEN
    RAISE EXCEPTION 'Los kilos tienen que ser mas de cero';
  END IF;
  IF p_unidades IS NULL OR p_unidades <= 0 THEN
    RAISE EXCEPTION 'Las unidades tienen que ser mas de cero';
  END IF;
  IF p_precio_por_kilo IS NULL OR p_precio_por_kilo < 0 THEN
    RAISE EXCEPTION 'Ingresa el precio por kilo';
  END IF;
  IF p_entregado_por IS NULL OR btrim(p_entregado_por) = '' THEN
    RAISE EXCEPTION 'Escribe el nombre de quien trae el pollo';
  END IF;

  PERFORM public.verificar_archivo('evidencias', p_foto_url, 'la foto del lote');
  PERFORM public.verificar_archivo('evidencias', p_firma_entrega_url, 'la firma de quien entrega');
  PERFORM public.verificar_archivo('evidencias', p_firma_recepcion_url, 'la firma de quien recibe');

  SELECT id INTO v_creado_por
    FROM public.perfiles_usuario
   WHERE usuario_id = auth.uid();

  -- Si no se escribe, el que registra es el que recibe
  v_recibe := COALESCE(NULLIF(btrim(p_recibido_por), ''), (SELECT nombre_completo FROM public.perfiles_usuario WHERE usuario_id = auth.uid()));

  v_fotos := public.validar_fotos_extra(p_fotos_extra, 'lote-' || btrim(p_numero_recibo) || '-');

  INSERT INTO public.recepcion_pollo (
    numero_recibo, fecha, kilos, unidades, precio_por_kilo, proveedor_id,
    creado_por, observaciones, foto_url,
    firma_entrega_url, firma_recepcion_url,
    entregado_por_nombre, recibido_por_nombre, recibido_por,
    fotos_extra
  )
  VALUES (
    btrim(p_numero_recibo), CURRENT_DATE, p_kilos, p_unidades, p_precio_por_kilo,
    p_proveedor_id, v_creado_por, p_observaciones, p_foto_url,
    p_firma_entrega_url, p_firma_recepcion_url,
    btrim(p_entregado_por), v_recibe, auth.uid(),
    v_fotos
  )
  RETURNING id INTO v_id;

  RETURN (SELECT r FROM public.recepcion_pollo r WHERE r.id = v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_lote_proveedor(
  TEXT, INT, NUMERIC, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
) TO authenticated;


-- ------------------------------------------------------------
-- 5) FORMULARIO 2: LO QUE SALE HACIA LA SUCURSAL
-- Reemplaza recoger_pedido: ahora lleva precio, con quien va,
-- foto y firma, no solo el peso.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.recoger_pedido(INT, NUMERIC);
DROP FUNCTION IF EXISTS public.despachar_pedido(
  INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
);
DROP FUNCTION IF EXISTS public.despachar_pedido(
  INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.despachar_pedido(
  p_pedido_id INT,
  p_unidades INT,
  p_kilos NUMERIC,
  p_precio_por_kilo NUMERIC,
  p_transportista TEXT,
  p_foto_url TEXT,
  p_firma_url TEXT,
  p_entregado_por TEXT,
  p_observaciones TEXT DEFAULT NULL,
  p_fotos_extra TEXT[] DEFAULT NULL
)
RETURNS public.despacho_pollo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado TEXT;
  v_sucursal INT;
  v_creado_por INT;
  v_id INT;
  v_fotos TEXT[];
BEGIN
  IF public.get_user_rol() NOT IN ('despachador','administrador') THEN
    RAISE EXCEPTION 'Solo el despachador puede registrar la salida del pollo';
  END IF;

  SELECT estado, sucursal_id INTO v_estado, v_sucursal
    FROM public.pedidos WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;
  IF v_estado <> 'LISTO' THEN
    RAISE EXCEPTION 'El pedido no esta listo para cargarse (estado actual: %)', v_estado;
  END IF;
  IF p_unidades IS NULL OR p_unidades <= 0 THEN
    RAISE EXCEPTION 'Las unidades tienen que ser mas de cero';
  END IF;
  IF p_kilos IS NULL OR p_kilos <= 0 THEN
    RAISE EXCEPTION 'Ingresa el peso que sale de la planta';
  END IF;
  IF p_precio_por_kilo IS NULL OR p_precio_por_kilo < 0 THEN
    RAISE EXCEPTION 'Ingresa el precio por kilo de la venta';
  END IF;
  IF p_transportista IS NULL OR btrim(p_transportista) = '' THEN
    RAISE EXCEPTION 'Escribe con quien va el pollo';
  END IF;
  IF p_entregado_por IS NULL OR btrim(p_entregado_por) = '' THEN
    RAISE EXCEPTION 'Falta el nombre de quien autoriza la salida';
  END IF;

  PERFORM public.verificar_archivo('evidencias', p_foto_url, 'la foto de la carga');
  PERFORM public.verificar_archivo('evidencias', p_firma_url, 'la firma de quien autoriza');

  SELECT id INTO v_creado_por
    FROM public.perfiles_usuario
   WHERE usuario_id = auth.uid();

  v_fotos := public.validar_fotos_extra(p_fotos_extra, 'pedido-' || p_pedido_id || '/');

  -- Primero queda el registro con la evidencia
  INSERT INTO public.despacho_pollo (
    fecha, kilos, unidades, sucursal_id, estado_recepcion,
    precio_por_kilo, transportista, foto_url, firma_url,
    entregado_por_nombre, observaciones,
    despachado_por, pedido_id, fotos_extra
  )
  VALUES (
    CURRENT_DATE, p_kilos, p_unidades, v_sucursal, 'PENDIENTE',
    p_precio_por_kilo, btrim(p_transportista), p_foto_url, p_firma_url,
    btrim(p_entregado_por), p_observaciones,
    v_creado_por, p_pedido_id, v_fotos
  )
  RETURNING id INTO v_id;

  -- Peso y estado juntos, en un solo paso
  UPDATE public.pedidos
     SET kilos_despachados = p_kilos,
         estado = 'RECOGIDO'
   WHERE id = p_pedido_id;

  RETURN (SELECT d FROM public.despacho_pollo d WHERE d.id = v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.despachar_pedido(
  INT, INT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]
) TO authenticated;


-- ------------------------------------------------------------
-- 5c) FORMULARIO 3: ENTREGA EN LA SUCURSAL
--
-- Esta es la version final, corre despues de ARREGLOS_PENDIENTES
-- y reemplaza la de alli. Corrige un error grave: aquella version
-- insertaba una fila NUEVA en despacho_pollo al recibir el pedido.
-- Como el inventario suma todas las filas del dia
-- (instalar.sql:154), el pollo se contaba DOS VECES al despacho,
-- y ademas chocaba con el indice unico de un despacho por pedido.
--
-- Ahora la recepcion solo marca la carga existente como recibida.
-- Lo que de verdad llego queda en pedido_recepciones.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(
  INT, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC
);
DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(
  INT, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT[]
);

CREATE OR REPLACE FUNCTION public.confirmar_recepcion_pedido(
  p_pedido_id INT,
  p_unidades_recibidas INT,
  p_foto_url TEXT,
  p_firma_url TEXT,
  p_recibido_por TEXT DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitud NUMERIC DEFAULT NULL,
  p_fotos_extra TEXT[] DEFAULT NULL
)
RETURNS public.pedido_recepciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido_sucursal  INT;
  v_pedido_unidades  INT;
  v_pedido_estado    TEXT;
  v_perfil_id        INT;
  v_perfil_sucursal  INT;
  v_faltantes        BOOLEAN;
  v_id_recepcion     INT;
  v_fotos            TEXT[];
BEGIN
  SELECT p.sucursal_id, p.unidades, p.estado
    INTO v_pedido_sucursal, v_pedido_unidades, v_pedido_estado
    FROM public.pedidos p
   WHERE p.id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;

  SELECT pr.id, pr.sucursal_id
    INTO v_perfil_id, v_perfil_sucursal
    FROM public.perfiles_usuario pr
   WHERE pr.usuario_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF public.get_user_rol() <> 'administrador'
     AND v_pedido_sucursal <> v_perfil_sucursal THEN
    RAISE EXCEPTION 'No tenes permiso para recibir este pedido';
  END IF;

  IF v_pedido_estado <> 'RECOGIDO' THEN
    RAISE EXCEPTION 'El pedido aun no fue recogido (estado actual: %)', v_pedido_estado;
  END IF;

  IF p_unidades_recibidas IS NULL OR p_unidades_recibidas < 0 THEN
    RAISE EXCEPTION 'Las unidades recibidas no pueden ser negativas';
  END IF;

  IF p_foto_url IS NULL OR btrim(p_foto_url) = '' THEN
    RAISE EXCEPTION 'Adjunta la foto de la entrega, es la evidencia de que llego el pedido';
  END IF;
  IF p_firma_url IS NULL OR btrim(p_firma_url) = '' THEN
    RAISE EXCEPTION 'Falta la firma de quien recibio el pedido';
  END IF;
  IF p_recibido_por IS NULL OR btrim(p_recibido_por) = '' THEN
    RAISE EXCEPTION 'Escribe el nombre de quien recibio el pedido';
  END IF;

  PERFORM public.verificar_archivo('evidencias', p_foto_url, 'la foto de la entrega');
  PERFORM public.verificar_archivo('evidencias', p_firma_url, 'la firma de quien recibio');

  v_fotos := public.validar_fotos_extra(p_fotos_extra, 'pedido-' || p_pedido_id || '/');

  v_faltantes := p_unidades_recibidas < v_pedido_unidades;

  -- La carga que ya existe queda como recibida. No se inserta otra
  -- fila, porque el inventario sumaria los kilos dos veces.
  UPDATE public.despacho_pollo
     SET estado_recepcion = 'RECIBIDO'
   WHERE pedido_id = p_pedido_id;

  INSERT INTO public.pedido_recepciones (
    pedido_id, unidades_recibidas, faltantes, observaciones,
    recibido_por, recibido_por_nombre, foto_url, firma_url,
    latitude, longitud, fotos_extra
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
    p_longitud,
    v_fotos
  )
  RETURNING id INTO v_id_recepcion;

  UPDATE public.pedidos SET estado = 'ENTREGADO' WHERE id = p_pedido_id;

  RETURN (SELECT r FROM public.pedido_recepciones r WHERE r.id = v_id_recepcion);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_recepcion_pedido(
  INT, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT[]
) TO authenticated;


-- ------------------------------------------------------------
-- 5b) DEJAR PASAR LA CARGA, PERO SOLO CON EVIDENCIA
-- El trigger de pedidos antes bloqueaba cambiar el peso a
-- cualquiera que no fuera administrador, y eso rompia al
-- despachador. Se abre una sola excepcion: pasar de LISTO a
-- RECOGIDO, y solo si ya existe la carga con foto y firma.
-- Si alguien tries hacerlo por la API sin el formulario, aqui
-- se corta.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guardar_pedido()
RETURNS TRIGGER AS $$
DECLARE
  v_rol TEXT := public.get_user_rol();
  v_cargado BOOLEAN;
BEGIN
  IF v_rol = 'administrador' THEN
    RETURN NEW;
  END IF;

  -- Hay carga registrada con foto y firma?
  SELECT EXISTS (
    SELECT 1 FROM public.despacho_pollo d
     WHERE d.pedido_id = OLD.id
       AND d.foto_url IS NOT NULL AND d.firma_url IS NOT NULL
  ) INTO v_cargado;

  IF NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
     OR NEW.unidades IS DISTINCT FROM OLD.unidades
     OR NEW.fecha IS DISTINCT FROM OLD.fecha
     OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
     OR (NEW.kilos_despachados IS DISTINCT FROM OLD.kilos_despachados
         AND NOT (v_rol = 'despachador' AND OLD.estado = 'LISTO'
                  AND NEW.estado = 'RECOGIDO' AND v_cargado)) THEN
    RAISE EXCEPTION 'Solo el administrador puede modificar los datos de un pedido';
  END IF;

  IF v_rol = 'sucursal' AND NEW.estado <> 'CANCELADO' THEN
    IF NEW.estado = 'ENTREGADO'
       AND EXISTS (SELECT 1 FROM public.pedido_recepciones r WHERE r.pedido_id = OLD.id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'La sucursal solo puede cancelar el pedido';
  END IF;

  -- No se puede retroceder el estado
  IF NEW.estado = 'PENDIENTE' AND OLD.estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'El estado del pedido no puede retroceder';
  END IF;

  -- Para marcarlo recogido hace falta el peso real
  IF NEW.estado = 'RECOGIDO' AND OLD.estado <> 'RECOGIDO'
     AND (NEW.kilos_despachados IS NULL OR NEW.kilos_despachados <= 0) THEN
    RAISE EXCEPTION 'Registra el peso que sale de la planta antes de marcar el pedido como recogido';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------
-- 6) QUIEN VE QUE
-- ------------------------------------------------------------

-- La evidencia es privada, pero url_evidencia corre como
-- SECURITY DEFINER, asi que las politicas de storage no la frenan:
-- hay que revisar aqui a quien se le da el enlace.
-- Admin, planta y despachador ven todo. La sucursal solo ve los
-- pedidos que son suyos.
CREATE OR REPLACE FUNCTION public.url_evidencia(p_ruta TEXT, p_segundos INT DEFAULT 900)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_url TEXT;
  v_rol TEXT := public.get_user_rol();
  v_sucursal INT := public.get_user_sucursal();
  v_pedido INT;
BEGIN
  IF p_ruta IS NULL OR btrim(p_ruta) = '' THEN
    RETURN NULL;
  END IF;

  IF p_ruta LIKE '%..%' THEN
    RAISE EXCEPTION 'Ruta de evidencia invalida';
  END IF;

  IF v_rol = 'sucursal' THEN
    -- solo las suyas: la ruta tiene que ser de un pedido de su sucursal
    BEGIN
      v_pedido := substring(p_ruta FROM '^pedido-([0-9]+)/')::INT;
    EXCEPTION WHEN others THEN
      v_pedido := NULL;
    END;

    IF v_pedido IS NULL THEN
      RAISE EXCEPTION 'No tienes permiso para ver esa evidencia';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.pedidos p
       WHERE p.id = v_pedido AND p.sucursal_id = v_sucursal
    ) THEN
      RAISE EXCEPTION 'No tienes permiso para ver esa evidencia';
    END IF;
  ELSIF v_rol NOT IN ('administrador','operador_planta','despachador') THEN
    RAISE EXCEPTION 'No tienes permiso para ver esa evidencia';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
     WHERE bucket_id = 'evidencias' AND name = p_ruta
  ) THEN
    RAISE EXCEPTION 'La evidencia no existe o fue borrada';
  END IF;

  -- el enlace no vive mas de 15 minutos
  SELECT s.url INTO v_url
    FROM storage.create_signed_url('evidencias', p_ruta, LEAST(GREATEST(COALESCE(p_segundos, 900), 60), 900)) AS s;

  IF v_url IS NULL THEN
    RAISE EXCEPTION 'No se pudo generar el enlace de la evidencia';
  END IF;

  RETURN v_url;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.url_evidencia(TEXT, INT) TO authenticated;

DROP POLICY IF EXISTS despacho_evidencia_ver ON public.despacho_pollo;
CREATE POLICY despacho_evidencia_ver ON public.despacho_pollo
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() IN ('administrador','operador_planta','despachador')
    OR sucursal_id = public.get_user_sucursal()
  );

DROP POLICY IF EXISTS recepcion_evidencia_ver ON public.recepcion_pollo;
CREATE POLICY recepcion_evidencia_ver ON public.recepcion_pollo
  FOR SELECT TO authenticated
  USING (public.get_user_rol() IN ('administrador','operador_planta','despachador'));

-- La escritura directa queda solo para el administrador.
-- Planta y despachador pasan por las funciones, que exigen evidencia.
DROP POLICY IF EXISTS recepcion_write ON public.recepcion_pollo;
CREATE POLICY recepcion_write ON public.recepcion_pollo
  FOR ALL TO authenticated
  USING (public.get_user_rol() = 'administrador')
  WITH CHECK (public.get_user_rol() = 'administrador');

DROP POLICY IF EXISTS despacho_write ON public.despacho_pollo;
CREATE POLICY despacho_write ON public.despacho_pollo
  FOR ALL TO authenticated
  USING (public.get_user_rol() = 'administrador')
  WITH CHECK (public.get_user_rol() = 'administrador');

-- El historico de recepciones sigue visible para todos
DROP POLICY IF EXISTS recepcion_read ON public.recepcion_pollo;
CREATE POLICY recepcion_read ON public.recepcion_pollo
  FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';


-- ------------------------------------------------------------
-- 7) VERIFICACION
-- ------------------------------------------------------------
SELECT id, numero_recibo, fecha, kilos, unidades, precio_por_kilo,
       total_monto, proveedor_id, entregado_por_nombre
  FROM public.recepcion_pollo
 ORDER BY id DESC LIMIT 5;

SELECT id, fecha, kilos, unidades, precio_por_kilo, total_monto,
       transportista, sucursal_id, pedido_id
  FROM public.despacho_pollo
 ORDER BY id DESC LIMIT 5;
