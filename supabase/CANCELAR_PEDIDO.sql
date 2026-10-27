-- ============================================================
-- RPC: CANCELAR_PEDIDO
-- ------------------------------------------------------------
-- Cancela un pedido (solo si esta PENDIENTE), registra el
-- motivo de la sucursal y avisa a todos los administradores.
--
-- Idempotente: se puede correr varias veces.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancelar_pedido(
  p_pedido_id INT,
  p_motivo TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido_sucursal INT;
  v_pedido_estado   TEXT;
  v_sucursal_nombre TEXT;
  v_origen_nombre   TEXT;
BEGIN
  -- 1) Validar existencia y estado
  SELECT sucursal_id, estado
    INTO v_pedido_sucursal, v_pedido_estado
    FROM public.pedidos
   WHERE id = p_pedido_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;

  IF v_pedido_estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar pedidos pendientes (estado actual: %)', v_pedido_estado;
  END IF;

  -- 2) Validar permiso (sucursal propia o admin)
  IF public.get_user_rol() IS DISTINCT FROM 'administrador'
     AND v_pedido_sucursal IS DISTINCT FROM public.get_user_sucursal() THEN
    RAISE EXCEPTION 'No tenes permiso para cancelar este pedido';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Debes escribir el motivo de la cancelación';
  END IF;

  -- 3) Cancelar
  UPDATE public.pedidos
     SET estado = 'CANCELADO',
         observaciones = COALESCE(observaciones, '') || E'\nMotivo cancelación: ' || btrim(p_motivo)
   WHERE id = p_pedido_id;

  -- 4) Avisar a administradores
  SELECT nombre INTO v_sucursal_nombre FROM public.sucursales WHERE id = v_pedido_sucursal;
  SELECT nombre_completo INTO v_origen_nombre FROM public.perfiles_usuario WHERE usuario_id = auth.uid();

  INSERT INTO public.notificaciones (
    tipo, titulo, mensaje, pedido_id, sucursal_id, sucursal_nombre,
    origen_usuario_id, origen_nombre, destinatario_usuario_id
  )
  SELECT
    'PEDIDO_CANCELADO',
    'Pedido #' || p_pedido_id || ' cancelado por sucursal',
    'La sucursal ' || COALESCE(v_sucursal_nombre, 'sin nombre') || ' cancelo el pedido #' || p_pedido_id || '. Motivo: ' || p_motivo,
    p_pedido_id,
    v_pedido_sucursal,
    v_sucursal_nombre,
    auth.uid(),
    v_origen_nombre,
    pu.usuario_id
  FROM public.perfiles_usuario pu
  JOIN public.roles r ON r.id = pu.rol_id
  WHERE r.nombre = 'administrador'
    AND pu.activo IS NOT FALSE;

END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_pedido(INT, TEXT) TO authenticated;
