-- Combina datos automaticos y captura manual en las planillas semanales.
-- Ejecutar despues de PLANILLA_VENTAS.sql, PLANILLA_COMPRAS_MANUAL.sql,
-- PLANILLAS_CIERRE.sql, PLANILLAS_COMPRAS_ARCHIVAR.sql y arreglo_inventario.sql.
BEGIN;

ALTER TABLE public.control_inventario_diario
  ADD COLUMN IF NOT EXISTS kilos_ajustados NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidades_ajustadas INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.ajustes_inventario_planta (
  id BIGSERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  ajuste_kilos NUMERIC(10,2) NOT NULL DEFAULT 0,
  ajuste_unidades INT NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL,
  creado_por UUID NOT NULL REFERENCES auth.users(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ajustes_inventario_planta_cantidad_check
    CHECK (ajuste_kilos <> 0 OR ajuste_unidades <> 0),
  CONSTRAINT ajustes_inventario_planta_motivo_check
    CHECK (length(btrim(motivo)) BETWEEN 5 AND 500)
);

CREATE INDEX IF NOT EXISTS ajustes_inventario_planta_fecha_idx
  ON public.ajustes_inventario_planta (fecha, creado_en DESC);

ALTER TABLE public.ajustes_inventario_planta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ajustes_inventario_planta_read
  ON public.ajustes_inventario_planta;
CREATE POLICY ajustes_inventario_planta_read
  ON public.ajustes_inventario_planta
  FOR SELECT TO authenticated
  USING (public.get_user_es_superadmin());

REVOKE ALL ON public.ajustes_inventario_planta FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ajustes_inventario_planta TO authenticated;

CREATE OR REPLACE FUNCTION public.recalcular_inventario(p_fecha DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recibidos NUMERIC(10,2) := 0;
  v_despachados NUMERIC(10,2) := 0;
  v_unidades_recibidas INT := 0;
  v_unidades_despachadas INT := 0;
  v_ajuste_kilos NUMERIC(10,2) := 0;
  v_ajuste_unidades INT := 0;
  v_kilos_iniciales NUMERIC(10,2) := 0;
  v_unidades_iniciales INT := 0;
BEGIN
  SELECT COALESCE(SUM(r.kilos), 0), COALESCE(SUM(r.unidades), 0)
    INTO v_recibidos, v_unidades_recibidas
    FROM public.recepcion_pollo r
   WHERE r.fecha = p_fecha;

  SELECT COALESCE(SUM(d.kilos), 0), COALESCE(SUM(d.unidades), 0)
    INTO v_despachados, v_unidades_despachadas
    FROM public.despacho_pollo d
   WHERE d.fecha = p_fecha;

  SELECT COALESCE(SUM(a.ajuste_kilos), 0), COALESCE(SUM(a.ajuste_unidades), 0)
    INTO v_ajuste_kilos, v_ajuste_unidades
    FROM public.ajustes_inventario_planta a
   WHERE a.fecha = p_fecha;

  v_kilos_iniciales := COALESCE((
    SELECT c.kilos_saldo
      FROM public.control_inventario_diario c
     WHERE c.fecha < p_fecha
     ORDER BY c.fecha DESC
     LIMIT 1
  ), 0);

  v_unidades_iniciales := COALESCE((
    SELECT c.unidades_saldo
      FROM public.control_inventario_diario c
     WHERE c.fecha < p_fecha
     ORDER BY c.fecha DESC
     LIMIT 1
  ), 0);

  INSERT INTO public.control_inventario_diario (
    fecha, kilos_iniciales, kilos_recibidos, kilos_despachados,
    kilos_ajustados, kilos_saldo, unidades_saldo, unidades_ajustadas,
    actualizado_en
  )
  VALUES (
    p_fecha, v_kilos_iniciales, v_recibidos, v_despachados,
    v_ajuste_kilos,
    v_kilos_iniciales + v_recibidos - v_despachados + v_ajuste_kilos,
    GREATEST(v_unidades_iniciales + v_unidades_recibidas - v_unidades_despachadas + v_ajuste_unidades, 0),
    v_ajuste_unidades,
    NOW()
  )
  ON CONFLICT (fecha) DO UPDATE SET
    kilos_iniciales = EXCLUDED.kilos_iniciales,
    kilos_recibidos = EXCLUDED.kilos_recibidos,
    kilos_despachados = EXCLUDED.kilos_despachados,
    kilos_ajustados = EXCLUDED.kilos_ajustados,
    kilos_saldo = EXCLUDED.kilos_saldo,
    unidades_saldo = EXCLUDED.unidades_saldo,
    unidades_ajustadas = EXCLUDED.unidades_ajustadas,
    actualizado_en = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.recalcular_inventario_desde(p_fecha DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dia DATE;
BEGIN
  PERFORM public.recalcular_inventario(p_fecha);
  FOR v_dia IN
    SELECT c.fecha
      FROM public.control_inventario_diario c
     WHERE c.fecha > p_fecha
     ORDER BY c.fecha
  LOOP
    PERFORM public.recalcular_inventario(v_dia);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_inventario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_desde DATE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_desde := NEW.fecha;
  ELSIF TG_OP = 'DELETE' THEN
    v_desde := OLD.fecha;
  ELSE
    v_desde := LEAST(OLD.fecha, NEW.fecha);
  END IF;

  PERFORM public.recalcular_inventario_desde(v_desde);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalcular_inventario_ajuste()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_desde DATE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_desde := NEW.fecha;
  ELSIF TG_OP = 'DELETE' THEN
    v_desde := OLD.fecha;
  ELSE
    v_desde := LEAST(OLD.fecha, NEW.fecha);
  END IF;

  PERFORM public.recalcular_inventario_desde(v_desde);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ajustes_inventario_planta_recalcular
  ON public.ajustes_inventario_planta;
CREATE TRIGGER ajustes_inventario_planta_recalcular
  AFTER INSERT OR UPDATE OR DELETE ON public.ajustes_inventario_planta
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalcular_inventario_ajuste();

DROP TRIGGER IF EXISTS t_inv_recepcion ON public.recepcion_pollo;
CREATE TRIGGER t_inv_recepcion
  AFTER INSERT OR UPDATE OR DELETE ON public.recepcion_pollo
  FOR EACH ROW EXECUTE FUNCTION public.trg_inventario();

DROP TRIGGER IF EXISTS t_inv_despacho ON public.despacho_pollo;
CREATE TRIGGER t_inv_despacho
  AFTER INSERT OR UPDATE OR DELETE ON public.despacho_pollo
  FOR EACH ROW EXECUTE FUNCTION public.trg_inventario();

DO $$
DECLARE
  v_dia DATE;
BEGIN
  FOR v_dia IN
    SELECT fechas.fecha
      FROM (
        SELECT fecha FROM public.control_inventario_diario
        UNION
        SELECT fecha FROM public.recepcion_pollo
        UNION
        SELECT fecha FROM public.despacho_pollo
        UNION
        SELECT fecha FROM public.ajustes_inventario_planta
      ) fechas
     ORDER BY fechas.fecha
  LOOP
    PERFORM public.recalcular_inventario(v_dia);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_entregas_planilla(
  p_desde DATE,
  p_hasta DATE
)
RETURNS TABLE (
  fecha DATE,
  sucursal_id INT,
  unidades_entregadas BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede consultar las planillas.'
      USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta THEN
    RAISE EXCEPTION 'El rango de fechas no es valido.';
  END IF;

  RETURN QUERY
  SELECT (r.recibido_en AT TIME ZONE 'America/La_Paz')::DATE,
         p.sucursal_id,
         SUM(r.unidades_recibidas)::BIGINT
    FROM public.pedidos p
    JOIN public.pedido_recepciones r ON r.pedido_id = p.id
   WHERE p.estado = 'ENTREGADO'
     AND (r.recibido_en AT TIME ZONE 'America/La_Paz')::DATE BETWEEN p_desde AND p_hasta
   GROUP BY 1, 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_inventario_planta_planilla(
  p_desde DATE,
  p_hasta DATE
)
RETURNS TABLE (
  fecha DATE,
  kilos_iniciales NUMERIC,
  kilos_recibidos NUMERIC,
  kilos_despachados NUMERIC,
  kilos_ajustados NUMERIC,
  kilos_saldo NUMERIC,
  unidades_saldo INT,
  unidades_ajustadas INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede consultar las planillas.'
      USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta THEN
    RAISE EXCEPTION 'El rango de fechas no es valido.';
  END IF;

  RETURN QUERY
  SELECT d.dia::DATE,
         COALESCE(c.kilos_iniciales, previo.kilos_saldo, 0),
         COALESCE(c.kilos_recibidos, 0),
         COALESCE(c.kilos_despachados, 0),
         COALESCE(c.kilos_ajustados, 0),
         COALESCE(c.kilos_saldo, previo.kilos_saldo, 0),
         COALESCE(c.unidades_saldo, previo.unidades_saldo, 0),
         COALESCE(c.unidades_ajustadas, 0)
    FROM generate_series(p_desde::TIMESTAMP, p_hasta::TIMESTAMP, INTERVAL '1 day') AS d(dia)
    LEFT JOIN public.control_inventario_diario c ON c.fecha = d.dia::DATE
    LEFT JOIN LATERAL (
      SELECT anterior.kilos_saldo, anterior.unidades_saldo
        FROM public.control_inventario_diario anterior
       WHERE anterior.fecha < d.dia::DATE
       ORDER BY anterior.fecha DESC
       LIMIT 1
    ) previo ON TRUE
   ORDER BY d.dia;
END;
$$;

CREATE OR REPLACE FUNCTION public.listar_ajustes_inventario_planta(
  p_desde DATE,
  p_hasta DATE
)
RETURNS TABLE (
  id BIGINT,
  fecha DATE,
  ajuste_kilos NUMERIC,
  ajuste_unidades INT,
  motivo TEXT,
  creado_en TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede consultar las planillas.'
      USING ERRCODE = '42501';
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta THEN
    RAISE EXCEPTION 'El rango de fechas no es valido.';
  END IF;
  RETURN QUERY
  SELECT a.id, a.fecha, a.ajuste_kilos, a.ajuste_unidades, a.motivo, a.creado_en
    FROM public.ajustes_inventario_planta a
   WHERE a.fecha BETWEEN p_desde AND p_hasta
   ORDER BY a.fecha DESC, a.creado_en DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_ajuste_inventario_planta(
  p_fecha DATE,
  p_ajuste_kilos NUMERIC,
  p_ajuste_unidades INT,
  p_motivo TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock public.control_inventario_diario%ROWTYPE;
  v_kilos_proyectados NUMERIC(10,2);
  v_unidades_proyectadas INT;
BEGIN
  IF NOT public.get_user_es_superadmin() THEN
    RAISE EXCEPTION 'Solo el superadministrador puede ajustar el inventario.'
      USING ERRCODE = '42501';
  END IF;
  IF p_fecha IS NULL
     OR (COALESCE(p_ajuste_kilos, 0) = 0 AND COALESCE(p_ajuste_unidades, 0) = 0)
     OR p_motivo IS NULL
     OR length(btrim(p_motivo)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Ingresa un ajuste distinto de cero y un motivo de 5 a 500 caracteres.';
  END IF;

  SELECT
    COALESCE((SELECT SUM(r.kilos) FROM public.recepcion_pollo r WHERE r.fecha <= p_fecha), 0)
      - COALESCE((SELECT SUM(d.kilos) FROM public.despacho_pollo d WHERE d.fecha <= p_fecha), 0)
      + COALESCE((SELECT SUM(a.ajuste_kilos) FROM public.ajustes_inventario_planta a WHERE a.fecha <= p_fecha), 0)
      + COALESCE(p_ajuste_kilos, 0),
    COALESCE((SELECT SUM(r.unidades) FROM public.recepcion_pollo r WHERE r.fecha <= p_fecha), 0)
      - COALESCE((SELECT SUM(d.unidades) FROM public.despacho_pollo d WHERE d.fecha <= p_fecha), 0)
      + COALESCE((SELECT SUM(a.ajuste_unidades) FROM public.ajustes_inventario_planta a WHERE a.fecha <= p_fecha), 0)
      + COALESCE(p_ajuste_unidades, 0)
    INTO v_kilos_proyectados, v_unidades_proyectadas;

  IF v_kilos_proyectados < 0 OR v_unidades_proyectadas < 0 THEN
    RAISE EXCEPTION 'El ajuste no puede dejar el inventario en negativo.';
  END IF;

  INSERT INTO public.ajustes_inventario_planta (
    fecha, ajuste_kilos, ajuste_unidades, motivo, creado_por
  )
  VALUES (
    p_fecha, COALESCE(p_ajuste_kilos, 0), COALESCE(p_ajuste_unidades, 0),
    btrim(p_motivo), auth.uid()
  );

  SELECT * INTO v_stock
    FROM public.control_inventario_diario
   WHERE fecha = p_fecha;

  IF v_stock.kilos_saldo < 0 OR v_stock.unidades_saldo < 0 THEN
    RAISE EXCEPTION 'El ajuste no puede dejar el inventario en negativo.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_entregas_planilla(DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_inventario_planta_planilla(DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_ajustes_inventario_planta(DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_ajuste_inventario_planta(DATE, NUMERIC, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalcular_inventario(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalcular_inventario_desde(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_inventario() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_recalcular_inventario_ajuste() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.listar_entregas_planilla(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_inventario_planta_planilla(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_ajustes_inventario_planta(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_ajuste_inventario_planta(DATE, NUMERIC, INT, TEXT) TO authenticated;

-- Una recepcion real de planta no se bloquea por el cierre de la planilla;
-- las correcciones manuales siguen sujetas al cierre.
CREATE OR REPLACE FUNCTION public.bloquear_cambios_plantilla_cerrada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tipo TEXT;
  v_fecha DATE;
  v_entidad_id INT;
  v_cerrada BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'recepcion_pollo' THEN
    IF TG_OP = 'INSERT'
       AND public.get_user_rol() IN ('operador_planta', 'administrador')
       AND NEW.origen_registro = 'PLANTA' THEN
      RETURN NEW;
    END IF;
    v_tipo := 'compras';
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_fecha := OLD.fecha;
      v_entidad_id := OLD.proveedor_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_fecha := NEW.fecha;
      v_entidad_id := NEW.proveedor_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'planilla_ventas' THEN
    v_tipo := 'ventas';
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_fecha := OLD.fecha;
      v_entidad_id := OLD.sucursal_id;
    ELSE
      v_fecha := NEW.fecha;
      v_entidad_id := NEW.sucursal_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'planilla_inventario' THEN
    v_tipo := 'inventario';
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_fecha := OLD.fecha;
      v_entidad_id := OLD.proveedor_id;
    ELSE
      v_fecha := NEW.fecha;
      v_entidad_id := NEW.proveedor_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tabla no compatible con el cierre de planillas: %', TG_TABLE_NAME;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.planillas_semanales_cerradas c
       WHERE c.tipo = v_tipo
         AND c.entidad_id = CASE
           WHEN TG_TABLE_NAME = 'recepcion_pollo' THEN OLD.proveedor_id
           WHEN TG_TABLE_NAME = 'planilla_ventas' THEN OLD.sucursal_id
           ELSE OLD.proveedor_id
         END
         AND c.reabierta_en IS NULL
         AND c.semana_inicio = OLD.fecha - (EXTRACT(ISODOW FROM OLD.fecha)::INT - 1)
    ) INTO v_cerrada;
    IF v_cerrada THEN
      RAISE EXCEPTION 'La planilla de esa semana esta cerrada';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.planillas_semanales_cerradas c
       WHERE c.tipo = v_tipo
         AND c.entidad_id = v_entidad_id
         AND c.reabierta_en IS NULL
         AND c.semana_inicio = v_fecha - (EXTRACT(ISODOW FROM v_fecha)::INT - 1)
    ) INTO v_cerrada;
    IF v_cerrada THEN
      RAISE EXCEPTION 'La planilla de esa semana esta cerrada';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Archivar una planilla tampoco debe impedir el registro automatico de
-- nuevas recepciones fisicas por parte de planta.
CREATE OR REPLACE FUNCTION public.bloquear_cambios_planilla_compras_archivada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proveedor_id INT;
  v_fecha DATE;
  v_archivada BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT'
     AND public.get_user_rol() IN ('operador_planta', 'administrador')
     AND NEW.origen_registro = 'PLANTA' THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.planillas_compras_archivadas a
       WHERE a.proveedor_id = OLD.proveedor_id
         AND a.semana_inicio = OLD.fecha - (EXTRACT(ISODOW FROM OLD.fecha)::INT - 1)
         AND a.archivado = TRUE
    ) INTO v_archivada;
    IF v_archivada THEN
      IF TG_OP = 'DELETE'
         AND COALESCE(current_setting('app.eliminar_planilla_compras_archivada', TRUE), '') = '1' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'La planilla de compras esta archivada; restaurala antes de editar';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_proveedor_id := NEW.proveedor_id;
    v_fecha := NEW.fecha;
    SELECT EXISTS (
      SELECT 1 FROM public.planillas_compras_archivadas a
       WHERE a.proveedor_id = v_proveedor_id
         AND a.semana_inicio = v_fecha - (EXTRACT(ISODOW FROM v_fecha)::INT - 1)
         AND a.archivado = TRUE
    ) INTO v_archivada;
    IF v_archivada THEN
      RAISE EXCEPTION 'La planilla de compras esta archivada; restaurala antes de editar';
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.bloquear_cambios_plantilla_cerrada() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bloquear_cambios_planilla_compras_archivada() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
