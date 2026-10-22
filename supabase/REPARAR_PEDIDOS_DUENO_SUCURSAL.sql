BEGIN;

CREATE OR REPLACE FUNCTION public.autofill_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.creado_por := auth.uid();

  IF public.get_user_rol() = 'administrador' THEN
    NEW.sucursal_id := COALESCE(NEW.sucursal_id, public.get_user_sucursal());
  ELSIF public.get_user_rol() = 'dueno' THEN
    IF NEW.sucursal_id IS NULL
       OR NOT public.get_user_es_dueno()
       OR NOT (NEW.sucursal_id = ANY(public.get_user_sucursales_dueno())) THEN
      RAISE EXCEPTION 'Selecciona una sucursal asignada a tu cuenta de dueño';
    END IF;
  ELSE
    NEW.sucursal_id := public.get_user_sucursal();
  END IF;

  IF NEW.sucursal_id IS NULL THEN
    RAISE EXCEPTION 'El pedido necesita una sucursal';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_pedido_dueno(
  p_sucursal_id INT,
  p_unidades INT,
  p_fecha DATE DEFAULT CURRENT_DATE,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS public.pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos;
BEGIN
  IF p_sucursal_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona una sucursal para el pedido';
  END IF;

  IF NOT public.get_user_es_dueno()
     OR NOT (p_sucursal_id = ANY(public.get_user_sucursales_dueno())) THEN
    RAISE EXCEPTION 'No tienes permiso para pedir para esa sucursal';
  END IF;

  IF p_unidades IS NULL OR p_unidades <= 0 THEN
    RAISE EXCEPTION 'Las unidades deben ser mayores que cero';
  END IF;

  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'Selecciona la fecha que necesitas el pedido';
  END IF;

  IF p_fecha < (now() AT TIME ZONE 'America/La_Paz')::DATE THEN
    RAISE EXCEPTION 'La fecha del pedido no puede estar en el pasado';
  END IF;

  INSERT INTO public.pedidos (sucursal_id, fecha, unidades, observaciones)
  VALUES (p_sucursal_id, p_fecha, p_unidades, NULLIF(btrim(p_observaciones), ''))
  RETURNING * INTO v_pedido;

  RETURN v_pedido;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_pedido_dueno(INT, INT, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_pedido_dueno(INT, INT, DATE, TEXT) TO authenticated;

COMMIT;
