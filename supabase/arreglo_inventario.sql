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
