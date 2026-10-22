-- ============================================================
--  AVISOS PARA EL ROL SUCURSAL
-- ------------------------------------------------------------
--  El administrador ya recibe reportes y faltantes. La sucursal
--  tambien necesita una bandeja: si el pedido se aprobo, esta
--  listo, va en camino o llego con faltantes, el aviso queda
--  guardado (no es un banner de 8 segundos).
--
--  1) Funcion para avisar a los usuarios de la sucursal
--  2) Trigger: cambio de estado del pedido
--  3) Trigger: recepcion con faltantes
--
--  Ejecutar en Supabase > SQL Editor. Es seguro correrlo dos veces.
--  Requiere: tabla public.notificaciones (REPORTE_ENTREGA_ADMIN.sql)
-- ============================================================

CREATE OR REPLACE FUNCTION public.avisar_usuarios_sucursal(
  p_sucursal_id INT,
  p_tipo TEXT,
  p_titulo TEXT,
  p_mensaje TEXT,
  p_pedido_id INT,
  p_sucursal_nombre TEXT DEFAULT NULL,
  p_unidades_pedidas INT DEFAULT NULL,
  p_unidades_recibidas INT DEFAULT NULL,
  p_faltantes INT DEFAULT NULL,
  p_recibido_por TEXT DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total INT := 0;
  v_nombre TEXT;
BEGIN
  IF p_sucursal_id IS NULL THEN
    RETURN 0;
  END IF;

  v_nombre := p_sucursal_nombre;
  IF v_nombre IS NULL THEN
    SELECT s.nombre INTO v_nombre
      FROM public.sucursales s
     WHERE s.id = p_sucursal_id;
  END IF;

  INSERT INTO public.notificaciones (
    tipo, titulo, mensaje, pedido_id, sucursal_id, sucursal_nombre,
    unidades_pedidas, unidades_recibidas, faltantes,
    recibido_por, observaciones_recepcion,
    origen_usuario_id, origen_nombre, destinatario_usuario_id
  )
  SELECT
    p_tipo,
    p_titulo,
    p_mensaje,
    p_pedido_id,
    p_sucursal_id,
    v_nombre,
    p_unidades_pedidas,
    p_unidades_recibidas,
    p_faltantes,
    p_recibido_por,
    p_observaciones,
    auth.uid(),
    (
      SELECT pu.nombre_completo
        FROM public.perfiles_usuario pu
       WHERE pu.usuario_id = auth.uid()
       LIMIT 1
    ),
    dest.usuario_id
  FROM public.perfiles_usuario dest
  JOIN public.roles r ON r.id = dest.rol_id
 WHERE r.nombre = 'sucursal'
   AND dest.sucursal_id = p_sucursal_id
   AND dest.activo IS NOT FALSE
   AND dest.usuario_id IS NOT NULL;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.avisar_usuarios_sucursal(
  INT, TEXT, TEXT, TEXT, INT, TEXT, INT, INT, INT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.avisar_usuarios_sucursal(
  INT, TEXT, TEXT, TEXT, INT, TEXT, INT, INT, INT, TEXT, TEXT
) TO authenticated;

-- ------------------------------------------------------------
-- 2) Cuando el pedido cambia de estado
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avisar_sucursal_cambio_estado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo TEXT;
  v_titulo TEXT;
  v_mensaje TEXT;
  v_nombre TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF NEW.estado = 'APROBADO' THEN
    v_tipo := 'PEDIDO_APROBADO';
    v_titulo := 'Tu pedido #' || NEW.id || ' fue aprobado';
    v_mensaje := 'El administrador aprobo el pedido de '
      || COALESCE(NEW.unidades, 0)
      || ' unidades. Planta ya puede prepararlo.';
  ELSIF NEW.estado = 'LISTO' THEN
    v_tipo := 'PEDIDO_LISTO';
    v_titulo := 'Tu pedido #' || NEW.id || ' esta listo';
    v_mensaje := 'El pedido de '
      || COALESCE(NEW.unidades, 0)
      || ' unidades ya esta listo para despacho.';
  ELSIF NEW.estado = 'RECOGIDO' THEN
    v_tipo := 'PEDIDO_EN_CAMINO';
    v_titulo := 'Tu pedido #' || NEW.id || ' va en camino';
    v_mensaje := 'El pedido de '
      || COALESCE(NEW.unidades, 0)
      || ' unidades salio hacia la sucursal. Cuando llegue, confirma la recepcion.';
  ELSE
    RETURN NEW;
  END IF;

  SELECT s.nombre INTO v_nombre
    FROM public.sucursales s
   WHERE s.id = NEW.sucursal_id;

  PERFORM public.avisar_usuarios_sucursal(
    NEW.sucursal_id,
    v_tipo,
    v_titulo,
    v_mensaje,
    NEW.id,
    v_nombre
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pedidos_avisar_sucursal ON public.pedidos;
CREATE TRIGGER pedidos_avisar_sucursal
  AFTER UPDATE OF estado ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.avisar_sucursal_cambio_estado();

-- ------------------------------------------------------------
-- 3) Recepcion con faltantes: aviso para la sucursal
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avisar_sucursal_faltantes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unidades INT;
  v_sucursal INT;
  v_nombre TEXT;
  v_faltantes INT;
BEGIN
  SELECT p.unidades, p.sucursal_id, s.nombre
    INTO v_unidades, v_sucursal, v_nombre
    FROM public.pedidos p
    LEFT JOIN public.sucursales s ON s.id = p.sucursal_id
   WHERE p.id = NEW.pedido_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_unidades := COALESCE(v_unidades, 0);
  v_faltantes := GREATEST(v_unidades - COALESCE(NEW.unidades_recibidas, 0), 0);

  IF v_faltantes <= 0 THEN
    RETURN NEW;
  END IF;

  PERFORM public.avisar_usuarios_sucursal(
    v_sucursal,
    'RECEPCION_FALTANTES',
    'Faltan unidades en el pedido #' || NEW.pedido_id,
    'Recibiste '
      || COALESCE(NEW.unidades_recibidas, 0)
      || ' de '
      || v_unidades
      || ' unidades: faltan '
      || v_faltantes
      || '.',
    NEW.pedido_id,
    v_nombre,
    v_unidades,
    NEW.unidades_recibidas,
    v_faltantes,
    NEW.recibido_por_nombre,
    NEW.observaciones
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recepciones_avisar_sucursal ON public.pedido_recepciones;
CREATE TRIGGER recepciones_avisar_sucursal
  AFTER INSERT ON public.pedido_recepciones
  FOR EACH ROW
  EXECUTE FUNCTION public.avisar_sucursal_faltantes();

NOTIFY pgrst, 'reload schema';
