-- ============================================================
-- PARTE 5 de 5 : url_evidencia + permisos + diagnostico
-- Lineas 595 a 773 de FORMULARIOS.sql
-- Correlas en orden: 1, 2, 3, 4, 5
-- ============================================================

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
