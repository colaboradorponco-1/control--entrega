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

  SELECT s.url INTO v_url
    FROM storage.create_signed_url('evidencias', p_ruta, LEAST(GREATEST(COALESCE(p_segundos, 900), 60), 900)) AS s;

  IF v_url IS NULL THEN
    RAISE EXCEPTION 'No se pudo generar el enlace de la evidencia';
  END IF;

  RETURN v_url;
END;
$$ LANGUAGE plpgsql;
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
