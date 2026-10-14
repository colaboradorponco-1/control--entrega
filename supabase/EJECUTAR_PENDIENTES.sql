
ALTER TABLE public.pedidos
  DROP COLUMN IF EXISTS kilos;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS kilos_despachados NUMERIC(10,2);

ALTER TABLE public.pedido_recepciones
  DROP COLUMN IF EXISTS kilos_recibidas;


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

DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(INT, INT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.confirmar_recepcion_pedido(
  p_pedido_id INT,
  p_unidades_recibidas INT,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS public.pedido_recepciones
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pedido    public.pedidos;
  v_perfil   public.perfiles_usuario;
  v_recepcion public.pedido_recepciones;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;

  SELECT * INTO v_perfil FROM public.perfiles_usuario WHERE usuario_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF public.get_user_rol() <> 'administrador'
     AND v_pedido.sucursal_id <> v_perfil.sucursal_id THEN
    RAISE EXCEPTION 'No tenes permiso para recibir este pedido';
  END IF;

  IF v_pedido.estado <> 'RECOGIDO' THEN
    RAISE EXCEPTION 'El pedido todavia no fue recogido por el despachador';
  END IF;

  IF p_unidades_recibidas < 0 THEN
    RAISE EXCEPTION 'Las unidades recibidas no pueden ser negativas';
  END IF;

  IF p_unidades_recibidas > 0 THEN
    INSERT INTO public.despacho_pollo (
      fecha, kilos, unidades, sucursal_id, estado_recepcion,
      observaciones, despachado_por, pedido_id
    )
    VALUES (
      CURRENT_DATE,
      v_pedido.kilos_despachados,
      p_unidades_recibidas,
      v_pedido.sucursal_id,
      'RECIBIDO',
      p_observaciones,
      v_perfil.id,
      v_pedido.id
    );
  END IF;

  INSERT INTO public.pedido_recepciones (
    pedido_id, unidades_recibidas, faltantes, observaciones, recibido_por
  )
  VALUES (
    v_pedido.id,
    p_unidades_recibidas,
    p_unidades_recibidas < v_pedido.unidades,
    p_observaciones,
    auth.uid()
  )
  RETURNING * INTO v_recepcion;

  UPDATE public.pedidos SET estado = 'ENTREGADO' WHERE id = v_pedido.id;

  RETURN v_recepcion;
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


-- ############################################################################
--  2) recepcion_con_evidencia.sql
-- ############################################################################

-- ============================================================
-- RECEPCION CON EVIDENCIA
-- Cuando el despachador llega a la sucursal, se llena un
-- comprobante: a quien se entrego, cuantas unidades,
-- observaciones, foto y firma de quien recibio.
-- ============================================================

-- ------------------------------------------------------------
-- 1) CAMPOS DEL COMPROBANTE
-- Van primero, porque las politicas de abajo ya los consultan.
-- ------------------------------------------------------------
ALTER TABLE public.pedido_recepciones
  ADD COLUMN IF NOT EXISTS recibido_por_nombre TEXT,
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS firma_url TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitud NUMERIC(10,7);

COMMENT ON COLUMN public.pedido_recepciones.recibido_por_nombre IS
  'Nombre de la persona que recibio el pedido en la sucursal';
COMMENT ON COLUMN public.pedido_recepciones.foto_url IS
  'Ruta dentro del bucket evidencias, de la foto de la entrega';
COMMENT ON COLUMN public.pedido_recepciones.firma_url IS
  'Ruta dentro del bucket evidencias, de la firma de quien recibio';
COMMENT ON COLUMN public.pedido_recepciones.latitude IS
  'Coordenada aproximada de la entrega, si el celular la entrego';

-- ------------------------------------------------------------
-- 2) ALMACENAMIENTO DE LAS FOTOS Y FIRMAS
-- Privado: solo los autorizados pueden verlas, y por tiempo
-- limitado (URL firmada), no enlaces publicos eternal.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidencias',
  'evidencias',
  FALSE,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Solo el administrador administra los archivos
DROP POLICY IF EXISTS evidencias_administrar ON storage.objects;
CREATE POLICY evidencias_administrar ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'evidencias' AND public.get_user_rol() = 'administrador')
  WITH CHECK (bucket_id = 'evidencias' AND public.get_user_rol() = 'administrador');

-- Para subir, el usuario tiene que tener un pedido suyo
DROP POLICY IF EXISTS evidencias_subir ON storage.objects;
CREATE POLICY evidencias_subir ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidencias'
    AND public.get_user_rol() IN ('sucursal','administrador')
  );

-- Para ver: el admin, la planta y el despachador ven todo;
-- la sucursal solo lo de su propia sucursal.
DROP POLICY IF EXISTS evidencias_ver ON storage.objects;
CREATE POLICY evidencias_ver ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidencias'
    AND (
      public.get_user_rol() IN ('administrador','operador_planta','despachador')
      OR EXISTS (
        SELECT 1
          FROM public.pedidos p
          JOIN public.pedido_recepciones r ON r.pedido_id = p.id
         WHERE r.foto_url = name
            OR r.firma_url = name
      )
    )
  );

-- ------------------------------------------------------------
-- 3) FUNCION QUE ARMA UNA URL FIRMADA
-- Las fotos y firmas no son publicas: se entregan con
-- enlace temporal para que no se puedan compartir de ahi.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.url_evidencia(p_ruta TEXT, p_segundos INT DEFAULT 900)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_url TEXT;
BEGIN
  IF p_ruta IS NULL OR btrim(p_ruta) = '' THEN
    RETURN NULL;
  END IF;

  -- El archivo tiene que existir, si no se avisa claro
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
     WHERE bucket_id = 'evidencias' AND name = p_ruta
  ) THEN
    RAISE EXCEPTION 'La evidencia no existe o fue borrada';
  END IF;

  SELECT s.url INTO v_url
    FROM storage.create_signed_url('evidencias', p_ruta, p_segundos) AS s;

  IF v_url IS NULL THEN
    RAISE EXCEPTION 'No se pudo generar el enlace de la evidencia';
  END IF;

  RETURN v_url;
END;
$$;

GRANT EXECUTE ON FUNCTION public.url_evidencia(TEXT, INT) TO authenticated;

-- ------------------------------------------------------------
-- 4) RECIBIR PEDIDO CON EVIDENCIA
-- Reemplaza confirmar_recepcion_pedido. Ahora si o si exige
-- foto y firma: es la prueba de que el pollo llego.
-- ------------------------------------------------------------

-- Primero se borran las versiones anteriores. Si quedara alguna,
-- un cliente podria llamar la vieja y cerrar la recepcion
-- sin foto ni firma, esquivando la evidencia.
DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(INT, INT, TEXT);
DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(INT, INT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.confirmar_recepcion_pedido(INT, INT, TEXT, TEXT);
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
SET search_path = public
AS $$
DECLARE
  v_pedido public.pedidos;
  v_perfil public.perfiles_usuario;
  v_recepcion public.pedido_recepciones;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido no existe';
  END IF;

  SELECT * INTO v_perfil FROM public.profiles_usuario WHERE usuario_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado';
  END IF;

  IF public.get_user_rol() <> 'administrador'
     AND v_pedido.sucursal_id <> v_perfil.sucursal_id THEN
    RAISE EXCEPTION 'No tenes permiso para recibir este pedido';
  END IF;

  IF v_pedido.estado <> 'RECOGIDO' THEN
    RAISE EXCEPTION 'El pedido aun no fue recogido (estado actual: %)', v_pedido.estado;
  END IF;

  IF v_pedido.kilos_despachados IS NULL THEN
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

  -- La foto y la firma tienen que existir de verdad
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

  -- El inventario solo se descuenta si hay unidades de verdad
  IF p_unidades_recibidas > 0 THEN
    INSERT INTO public.despacho_pollo (
      fecha, kilos, unidades, sucursal_id, estado_recepcion,
      observaciones, despachado_por, pedido_id
    )
    VALUES (
      CURRENT_DATE,
      v_pedido.kilos_despachados,
      p_unidades_recibidas,
      v_pedido.sucursal_id,
      'RECIBIDO',
      p_observaciones,
      v_perfil.id,
      v_pedido.id
    );
  END IF;

  INSERT INTO public.pedido_recepciones (
    pedido_id, unidades_recibidas, faltantes, observaciones,
    recibido_por, recibido_por_nombre, foto_url, firma_url,
    latitude, longitud
  )
  VALUES (
    v_pedido.id,
    p_unidades_recibidas,
    p_unidades_recibidas < v_pedido.unidades,
    p_observaciones,
    auth.uid(),
    btrim(p_recibido_por),
    p_foto_url,
    p_firma_url,
    p_latitude,
    p_longitud
  )
  RETURNING * INTO v_recepcion;

  UPDATE public.pedidos SET estado = 'ENTREGADO' WHERE id = v_pedido.id;

  RETURN v_recepcion;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_recepcion_pedido(
  INT, INT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC
) TO authenticated;

-- ------------------------------------------------------------
-- 5) LA EVIDENCIA NO SE PUEDE CAMBIAR DESPUES
-- Si alguien manipulase la foto o la firma por debajo, se avisa.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proteger_evidencia()
RETURNS TRIGGER AS $$
DECLARE
  v_rol TEXT := public.get_user_rol();
BEGIN
  -- El admin puede corregir datos; el resto, no.
  IF v_rol = 'administrador' THEN
    RETURN NEW;
  END IF;

  IF NEW.unidades_recibidas IS DISTINCT FROM OLD.unidades_recibidas
     OR NEW.recibido_por_nombre IS DISTINCT FROM OLD.recibido_por_nombre
     OR NEW.foto_url IS DISTINCT FROM OLD.foto_url
     OR NEW.firma_url IS DISTINCT FROM OLD.firma_url
     OR NEW.observaciones IS DISTINCT FROM OLD.observaciones
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitud IS DISTINCT FROM OLD.longitud THEN
    RAISE EXCEPTION 'La evidencia de una entrega no se puede modificar';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_recepciones_evidencia ON public.pedido_recepciones;
CREATE TRIGGER t_recepciones_evidencia
  BEFORE UPDATE ON public.pedido_recepciones
  FOR EACH ROW EXECUTE FUNCTION public.proteger_evidencia();

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 6) VERIFICACION
-- ------------------------------------------------------------
SELECT id, pedido_id, unidades_recibidas, recibido_por_nombre,
       foto_url, firma_url, recibido_en
  FROM public.pedido_recepciones
 ORDER BY recibido_en DESC
 LIMIT 5;


-- ############################################################################
--  3) arreglo_inventario.sql
-- ############################################################################

-- ============================================================
-- ARREGLO DEL INVENTARIO DIARIO
--
-- 1) BUG QUE ROMPIA EL SISTEMA
--    "null value in column kilos_iniciales violates not-null"
--    SELECT ... INTO con LIMIT 1 y sin filas asigna NULL a la
--    variable (el COALESCE no ayuda: no hay fila que evaluar).
--    pasaba al registrar la primera recepcion o el primer despacho,
--    porque no existia un dia previo del cual copiar el saldo.
--
-- 2) BUG DE UNIDADES
--    unidades_saldo sumaba lo recibido y nunca restaba lo
--    despachado, asi que el stock en unidades solo subia.
--
-- 3) FECHAS ANTIGUAS
--    al cargar un movimiento con fecha pasada solo se recalculaba
--    ese dia; los dias siguientes quedaban con el saldo viejo.
--
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1) RECALCULO DE UN DIA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_inventario(p_fecha DATE)
RETURNS VOID AS $$
DECLARE
  v_recibidos        NUMERIC(10,2) := 0;
  v_despachados      NUMERIC(10,2) := 0;
  v_unidades_recib   INT := 0;
  v_unidades_desp    INT := 0;
  v_kilos_inicial    NUMERIC(10,2) := 0;
  v_unidades_inicial INT := 0;
BEGIN
  -- Lo recibido del dia
  SELECT COALESCE(SUM(r.kilos), 0), COALESCE(SUM(r.unidades), 0)
    INTO v_recibidos, v_unidades_recib
    FROM public.recepcion_pollo r
   WHERE r.fecha = p_fecha;

  -- Lo despachado del dia
  SELECT COALESCE(SUM(d.kilos), 0), COALESCE(SUM(d.unidades), 0)
    INTO v_despachados, v_unidades_desp
    FROM public.despacho_pollo d
   WHERE d.fecha = p_fecha;

  -- Saldo del dia anterior (COALESCE por fuera: si no hay dia
  -- previo devuelve NULL y se convierte en 0)
  v_kilos_inicial := COALESCE((
      SELECT c.kilos_saldo
        FROM public.control_inventario_diario c
       WHERE c.fecha < p_fecha
       ORDER BY c.fecha DESC
       LIMIT 1
    ), 0);

  v_unidades_inicial := COALESCE((
      SELECT c.unidades_saldo
        FROM public.control_inventario_diario c
       WHERE c.fecha < p_fecha
       ORDER BY c.fecha DESC
       LIMIT 1
    ), 0);

  INSERT INTO public.control_inventario_diario
    (fecha, kilos_iniciales, kilos_recibidos, kilos_despachados,
     kilos_saldo, unidades_saldo, actualizado_en)
  VALUES
    (p_fecha,
     v_kilos_inicial,
     v_recibidos,
     v_despachados,
     v_kilos_inicial + v_recibidos - v_despachados,
     GREATEST(v_unidades_inicial + v_unidades_recib - v_unidades_desp, 0),
     NOW())
  ON CONFLICT (fecha) DO UPDATE SET
    kilos_iniciales  = EXCLUDED.kilos_iniciales,
    kilos_recibidos  = EXCLUDED.kilos_recibidos,
    kilos_despachados= EXCLUDED.kilos_despachados,
    kilos_saldo      = EXCLUDED.kilos_saldo,
    unidades_saldo   = EXCLUDED.unidades_saldo,
    actualizado_en   = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 2) RECALCULO EN CADENA (para fechas antigas)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalcular_inventario_desde(p_fecha DATE)
RETURNS VOID AS $$
DECLARE
  v_dia DATE;
BEGIN
  -- Primero el dia afectado, para que exista como punto de partida.
  -- Si se hiciera al final, los dias posteriores se calcularian
  -- sin el y quedarian con saldos equivocados.
  PERFORM public.recalcular_inventario(p_fecha);

  -- Despues, en cadena, cada dia siguiente hasta el ultimo
  FOR v_dia IN
    SELECT c.fecha
      FROM public.control_inventario_diario c
     WHERE c.fecha > p_fecha
     ORDER BY c.fecha ASC
  LOOP
    PERFORM public.recalcular_inventario(v_dia);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 3) TRIGGERS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_inventario()
RETURNS TRIGGER AS $$
DECLARE
  v_desde DATE;
BEGIN
  -- En un UPDATE puede cambiar la fecha: se recalcula desde la mas antigua
  v_desde := COALESCE(NEW.fecha, CURRENT_DATE);
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.fecha IS NOT NULL AND OLD.fecha < v_desde THEN
    v_desde := OLD.fecha;
  END IF;

  PERFORM public.recalcular_inventario_desde(v_desde);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 4) RECONSTRUIR EL INVENTARIO EXISTENTE
-- ------------------------------------------------------------
DO $$
DECLARE
  v_dia DATE;
BEGIN
  FOR v_dia IN SELECT DISTINCT fecha FROM public.control_inventario_diario ORDER BY fecha ASC
  LOOP
    PERFORM public.recalcular_inventario(v_dia);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 5) VERIFICACION
-- ------------------------------------------------------------
SELECT fecha, kilos_iniciales, kilos_recibidos, kilos_despachados, kilos_saldo, unidades_saldo
FROM public.control_inventario_diario
ORDER BY fecha;


-- ############################################################################
--  4) arreglo_rls.sql
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


-- ############################################################################
--  FIN
-- ############################################################################

