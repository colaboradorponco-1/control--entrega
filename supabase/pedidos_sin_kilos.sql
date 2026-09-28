-- ============================================================
-- PEDIDOS SOLO EN UNIDADES
--
-- El pedido se pide por unidades, no por kilos. Pero el inventario
-- de la planta se lleva en kilos, asi que el peso real que sale
-- de la planta lo anota el DESPACHADOR al recoger el pedido.
--
-- La sucursal, al recibir, cuenta unicamente las unidades.
--
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1) EL PEDIDO PASA A SER SOLO EN UNIDADES
-- El orden importa: primero se agrega la columna nueva y se
-- copia el peso viejo, recien ahi se borra la vieja. Al reves
-- se pierde el peso de los pedidos que ya existian.
-- ------------------------------------------------------------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS kilos_despachados NUMERIC(10,2);

-- Se apaga el trigger un momento: durante la migracion el peso
-- si se esta moviendo, y el trigger lo prohibe por diseÃ±o.
ALTER TABLE public.pedidos DISABLE TRIGGER t_pedidos_guardar;

DO $$
BEGIN
  -- Solo si la columna vieja todavia existe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name  = 'pedidos'
       AND column_name = 'kilos'
  ) THEN
    EXECUTE 'UPDATE public.pedidos
                SET kilos_despachados = kilos
              WHERE kilos_despachados IS NULL';
  END IF;
END $$;

ALTER TABLE public.pedidos ENABLE TRIGGER t_pedidos_guardar;

ALTER TABLE public.pedidos
  DROP COLUMN IF EXISTS kilos;

ALTER TABLE public.pedido_recepciones
  DROP COLUMN IF EXISTS kilos_recibidas;

-- ------------------------------------------------------------
-- 2) RECOGER EL PEDIDO (el despachador anota el peso real)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.recoger_pedido(INT, NUMERIC);

CREATE OR REPLACE FUNCTION public.recoger_pedido(
  p_pedido_id INT,
  p_kilos NUMERIC
)
RETURNS public.pedidos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pedido public.pedidos;
BEGIN
  IF public.get_user_rol() NOT IN ('despachador', 'administrador') THEN
    RAISE EXCEPTION 'Solo el despachador puede recoger un pedido';
  END IF;

  IF p_kilos IS NULL OR p_kilos <= 0 THEN
    RAISE EXCEPTION 'Ingresa el peso que sale de la planta';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;

  IF v_pedido.estado <> 'LISTO' THEN
    RAISE EXCEPTION 'El pedido tiene que estar listo para recogerlo (estado actual: %)', v_pedido.estado;
  END IF;

  UPDATE public.pedidos
     SET estado = 'RECOGIDO',
         kilos_despachados = p_kilos
   WHERE id = p_pedido_id
  RETURNING * INTO v_pedido;

  RETURN v_pedido;
END;
$$;

-- ------------------------------------------------------------
-- 3) RECEPCION: la sucursal cuenta unidades, nada mas
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(INT, INT, NUMERIC, TEXT);

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

-- ------------------------------------------------------------
-- 4) EL GUARDIAN DEBE EXIGIR EL PESO AL RECOGER
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guardar_pedido()
RETURNS TRIGGER AS $$
DECLARE
  v_rol TEXT := public.get_user_rol();
BEGIN
  IF v_rol = 'administrador' THEN
    RETURN NEW;
  END IF;

  IF NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
     OR NEW.unidades IS DISTINCT FROM OLD.unidades
     OR NEW.fecha IS DISTINCT FROM OLD.fecha
     OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
     OR NEW.kilos_despachados IS DISTINCT FROM OLD.kilos_despachados THEN
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
-- 5) PERMISOS
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.recoger_pedido(INT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_recepcion_pedido(INT, INT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 6) VERIFICACION
-- ------------------------------------------------------------
SELECT id, unidades, estado, kilos_despachados FROM public.pedidos ORDER BY id;
