-- ============================================================
-- PARTE 1 de 5 : Columnas + fotos extra + triggers de evidencia
-- Lineas 1 a 260 de FORMULARIOS.sql
-- Correlas en orden: 1, 2, 3, 4, 5
-- ============================================================

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
