ALTER TABLE public.pedido_recepciones
  ADD COLUMN IF NOT EXISTS observaciones_entrega TEXT,
  ADD COLUMN IF NOT EXISTS observaciones_entrega_en TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.autofill_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.creado_por := auth.uid();

  IF public.get_user_rol() = 'administrador' THEN
    NEW.sucursal_id := COALESCE(NEW.sucursal_id, public.get_user_sucursal());
  ELSIF public.get_user_rol() = 'dueno' THEN
    IF NOT public.get_user_es_dueno()
       OR NOT (NEW.sucursal_id = ANY(public.get_user_sucursales_dueno())) THEN
      RAISE EXCEPTION 'Solo puedes pedir para una sucursal asignada a tu cuenta';
    END IF;
  ELSE
    NEW.sucursal_id := public.get_user_sucursal();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_sucursales_pedido_dueno()
RETURNS TABLE (id INT, nombre TEXT, sector TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT s.id, s.nombre, s.sector
  FROM public.sucursales s
  JOIN public.sucursal_duenos sd ON sd.sucursal_id = s.id
  WHERE public.get_user_es_dueno()
    AND sd.dueno_id = public.get_user_dueno_id()
  ORDER BY s.nombre;
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
SET search_path = public
AS $$
DECLARE
  v_pedido public.pedidos;
BEGIN
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

CREATE OR REPLACE FUNCTION public.enviar_observaciones_entrega_pedido(
  p_pedido_id INT,
  p_observaciones TEXT
)
RETURNS public.pedido_recepciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recepcion public.pedido_recepciones;
  v_recepcion_id INT;
  v_estado TEXT;
  v_sucursal_id INT;
  v_recibido_en TIMESTAMPTZ;
  v_observaciones_entrega TEXT;
  v_limite TIMESTAMPTZ;
BEGIN
  IF public.get_user_rol() <> 'sucursal' THEN
    RAISE EXCEPTION 'Solo la sucursal receptora puede enviar estas observaciones';
  END IF;

  IF p_observaciones IS NULL OR btrim(p_observaciones) = '' THEN
    RAISE EXCEPTION 'Escribe una observacion o cierra el formulario sin enviarlo';
  END IF;
  IF length(btrim(p_observaciones)) > 2000 THEN
    RAISE EXCEPTION 'Las observaciones no pueden superar 2000 caracteres';
  END IF;

  SELECT p.estado, p.sucursal_id, r.id, r.recibido_en, r.observaciones_entrega
    INTO v_estado, v_sucursal_id, v_recepcion_id, v_recibido_en, v_observaciones_entrega
    FROM public.pedidos p
    JOIN public.pedido_recepciones r ON r.pedido_id = p.id
   WHERE p.id = p_pedido_id
   FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontro la recepcion de este pedido';
  END IF;
  IF v_sucursal_id IS DISTINCT FROM public.get_user_sucursal() THEN
    RAISE EXCEPTION 'Solo la sucursal del pedido puede enviar observaciones';
  END IF;
  IF v_estado <> 'ENTREGADO' THEN
    RAISE EXCEPTION 'El pedido debe estar entregado antes de enviar observaciones';
  END IF;
  IF v_observaciones_entrega IS NOT NULL THEN
    RAISE EXCEPTION 'Las observaciones de este pedido ya fueron enviadas';
  END IF;

  v_limite := (
    (v_recibido_en AT TIME ZONE 'America/La_Paz')::DATE + TIME '18:00'
  ) AT TIME ZONE 'America/La_Paz';
  IF now() > v_limite THEN
    RAISE EXCEPTION 'El plazo para enviar observaciones vencio a las 18:00 de Cochabamba';
  END IF;

  UPDATE public.pedido_recepciones
     SET observaciones_entrega = btrim(p_observaciones),
         observaciones_entrega_en = now()
     WHERE id = v_recepcion_id
   RETURNING * INTO v_recepcion;

  RETURN v_recepcion;
END;
$$;

DROP POLICY IF EXISTS pedidos_read_dueno ON public.pedidos;
CREATE POLICY pedidos_read_dueno ON public.pedidos
  FOR SELECT TO authenticated
  USING (
    public.get_user_es_dueno()
    AND sucursal_id = ANY(public.get_user_sucursales_dueno())
  );

DROP POLICY IF EXISTS pedidos_insert ON public.pedidos;
DROP POLICY IF EXISTS pedidos_insert_dueno ON public.pedidos;
CREATE POLICY pedidos_insert_dueno ON public.pedidos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_es_dueno()
    AND sucursal_id = ANY(public.get_user_sucursales_dueno())
    AND creado_por = auth.uid()
  );

DROP POLICY IF EXISTS pedido_recepciones_read_dueno ON public.pedido_recepciones;
CREATE POLICY pedido_recepciones_read_dueno ON public.pedido_recepciones
  FOR SELECT TO authenticated
  USING (
    public.get_user_es_dueno()
    AND EXISTS (
      SELECT 1
      FROM public.pedidos p
      WHERE p.id = pedido_id
        AND p.sucursal_id = ANY(public.get_user_sucursales_dueno())
    )
  );

GRANT EXECUTE ON FUNCTION public.listar_sucursales_pedido_dueno() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_pedido_dueno(INT, INT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_observaciones_entrega_pedido(INT, TEXT) TO authenticated;
