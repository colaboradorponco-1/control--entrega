CREATE TABLE IF NOT EXISTS public.pedidos (
  id SERIAL PRIMARY KEY,
  sucursal_id INT NOT NULL REFERENCES public.sucursales(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  unidades INT NOT NULL CHECK (unidades > 0),
  -- El peso no se pide: lo anota el despachador al recoger.
  -- Sin el, el inventario de la planta no podria descontarse en kilos.
  kilos_despachados NUMERIC(10,2),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','EN_PREPARACION','LISTO','RECOGIDO','ENTREGADO','CANCELADO')),
  observaciones TEXT,
  creado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON public.pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_sucursal ON public.pedidos(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON public.pedidos(fecha);


ALTER TABLE public.despacho_pollo
  ADD COLUMN IF NOT EXISTS pedido_id INT
  REFERENCES public.pedidos(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_despacho_pedido
  ON public.despacho_pollo(pedido_id) WHERE pedido_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS public.pedido_recepciones (
  id SERIAL PRIMARY KEY,
  pedido_id INT NOT NULL UNIQUE REFERENCES public.pedidos(id) ON DELETE CASCADE,
  unidades_recibidas INT NOT NULL CHECK (unidades_recibidas >= 0),
  faltantes BOOLEAN NOT NULL DEFAULT FALSE,
  observaciones TEXT,
  recibido_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recibido_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.autofill_pedido()
RETURNS TRIGGER AS $$
BEGIN
  NEW.creado_por := auth.uid();

  IF public.get_user_rol() = 'administrador' THEN
    NEW.sucursal_id := COALESCE(NEW.sucursal_id, public.get_user_sucursal());
  ELSE
    NEW.sucursal_id := public.get_user_sucursal();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_pedidos_autofill ON public.pedidos;
CREATE TRIGGER t_pedidos_autofill
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.autofill_pedido();


CREATE OR REPLACE FUNCTION public.touch_actualizado()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_pedidos_touch ON public.pedidos;
CREATE TRIGGER t_pedidos_touch
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.touch_actualizado();

-- Control de cambios permitidos segun el rol
-- La sucursal solo puede cancelar; no puede alterar lo pedido.
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
       AND EXISTS (
         SELECT 1 FROM public.pedido_recepciones r WHERE r.pedido_id = OLD.id
       ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'La sucursal solo puede cancelar el pedido';
  END IF;

  -- No se puede retroceder el estado
  IF NEW.estado = 'PENDIENTE' AND OLD.estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'El estado del pedido no puede retroceder';
  END IF;

  -- Recoger sin peso no sirve: el inventario de la planta se descuenta en kilos
  IF NEW.estado = 'RECOGIDO' AND NEW.kilos_despachados IS NULL THEN
    RAISE EXCEPTION 'Registra el peso que sale de la planta antes de marcar el pedido como recogido';
  END IF;

  IF NEW.estado = 'ENTREGADO' AND OLD.estado = 'ENTREGADO' THEN
    RAISE EXCEPTION 'El pedido ya fue entregado';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_pedidos_guardar ON public.pedidos;
CREATE TRIGGER t_pedidos_guardar
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.guardar_pedido();

-- ------------------------------------------------------------
-- 5) FUNCION DE RECEPCION
-- Cierra el pedido, guarda lo recibido y descuenta el inventario
-- en una sola transaccion reutilizando el trigger de despacho.
-- ------------------------------------------------------------
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
-- 5b) FUNCION DE PESAJE
-- Solo el despachador (o el admin) anota el peso real que sale
-- de la planta. El trigger se encarga de validarlo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recoger_pedido(
  p_pedido_id INT,
  p_kilos NUMERIC
)
RETURNS public.pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido public.pedidos;
  v_rol TEXT;
BEGIN
  v_rol := public.get_user_rol();

  IF v_rol NOT IN ('despachador','administrador') THEN
    RAISE EXCEPTION 'Solo el despachador puede recoger el pedido';
  END IF;

  IF p_kilos IS NULL OR p_kilos <= 0 THEN
    RAISE EXCEPTION 'Ingresa el peso que sale de la planta';
  END IF;

  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;

  IF v_pedido.estado <> 'LISTO' THEN
    RAISE EXCEPTION 'El pedido no esta listo para recogerse (estado actual: %)', v_pedido.estado;
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
-- 6) SEGURIDAD (RLS)
-- ------------------------------------------------------------
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_recepciones ENABLE ROW LEVEL SECURITY;

-- Lectura: planta, despachador y admin ven todo; la sucursal solo lo suyo
DROP POLICY IF EXISTS pedidos_read ON public.pedidos;
CREATE POLICY pedidos_read ON public.pedidos
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() IN ('administrador','operador_planta','despachador')
    OR sucursal_id = public.get_user_sucursal()
  );

-- Crear: la sucursal crea para si misma, el admin para cualquiera
DROP POLICY IF EXISTS pedidos_insert ON public.pedidos;
CREATE POLICY pedidos_insert ON public.pedidos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_rol() = 'administrador'
    OR (public.get_user_rol() = 'sucursal' AND sucursal_id = public.get_user_sucursal())
  );

-- Cambiar estado: planta, despachador y admin
DROP POLICY IF EXISTS pedidos_update ON public.pedidos;
CREATE POLICY pedidos_update ON public.pedidos
  FOR UPDATE TO authenticated
  USING (public.get_user_rol() IN ('administrador','operador_planta','despachador'))
  WITH CHECK (public.get_user_rol() IN ('administrador','operador_planta','despachador'));

-- Cancelar: la sucursal solo su pedido (el trigger impide cambiar otros datos)
DROP POLICY IF EXISTS pedidos_cancelar ON public.pedidos;
CREATE POLICY pedidos_cancelar ON public.pedidos
  FOR UPDATE TO authenticated
  USING (public.get_user_rol() = 'sucursal' AND sucursal_id = public.get_user_sucursal())
  WITH CHECK (public.get_user_rol() = 'sucursal' AND sucursal_id = public.get_user_sucursal());

-- Borrar: unicamente el administrador
DROP POLICY IF EXISTS pedidos_delete ON public.pedidos;
CREATE POLICY pedidos_delete ON public.pedidos
  FOR DELETE TO authenticated
  USING (public.get_user_rol() = 'administrador');

-- Recepciones
DROP POLICY IF EXISTS recepciones_read ON public.pedido_recepciones;
CREATE POLICY recepciones_read ON public.pedido_recepciones
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() IN ('administrador','operador_planta','despachador')
    OR EXISTS (
      SELECT 1 FROM public.pedidos p
      WHERE p.id = pedido_id AND p.sucursal_id = public.get_user_sucursal()
    )
  );

DROP POLICY IF EXISTS recepciones_write ON public.pedido_recepciones;
CREATE POLICY recepciones_write ON public.pedido_recepciones
  FOR ALL TO authenticated
  USING (public.get_user_rol() = 'administrador')
  WITH CHECK (public.get_user_rol() = 'administrador');

-- ------------------------------------------------------------
-- 7) PERMISOS
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedidos TO authenticated;
GRANT SELECT ON public.pedido_recepciones TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pedidos_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pedido_recepciones_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_recepcion_pedido(INT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recoger_pedido(INT, NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 8) VERIFICACION
-- ------------------------------------------------------------
SELECT estado, COUNT(*) AS pedidos FROM public.pedidos GROUP BY estado ORDER BY estado;
