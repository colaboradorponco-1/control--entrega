-- Ejecutar despues de pedidos.sql, duenos.sql y APROBACION_PEDIDOS_ADMIN.sql.

CREATE OR REPLACE FUNCTION public.obtener_disponibilidad_pedidos_planta()
RETURNS TABLE (
  unidades_stock INT,
  unidades_reservadas BIGINT,
  unidades_disponibles BIGINT,
  kilos_stock NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_stock public.control_inventario_diario;
BEGIN
  IF public.get_user_rol() NOT IN ('operador_planta', 'administrador') THEN
    RAISE EXCEPTION 'Solo planta y administracion pueden consultar el inventario de preparacion';
  END IF;

  SELECT c.*
    INTO v_stock
    FROM public.control_inventario_diario c
   ORDER BY c.fecha DESC
   LIMIT 1;

  RETURN QUERY
  SELECT
    COALESCE(v_stock.unidades_saldo, 0),
    COALESCE((
      SELECT SUM(p.unidades)::BIGINT
      FROM public.pedidos p
      WHERE p.estado IN ('EN_PREPARACION', 'LISTO', 'RECOGIDO')
    ), 0),
    GREATEST(
      COALESCE(v_stock.unidades_saldo, 0)::BIGINT
      - COALESCE((
        SELECT SUM(p.unidades)::BIGINT
        FROM public.pedidos p
        WHERE p.estado IN ('EN_PREPARACION', 'LISTO', 'RECOGIDO')
      ), 0),
      0
    ),
    COALESCE(v_stock.kilos_saldo, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_stock_al_iniciar_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_unidades BIGINT := 0;
  v_reservadas BIGINT := 0;
BEGIN
  IF OLD.estado <> 'APROBADO' OR NEW.estado <> 'EN_PREPARACION' THEN
    RETURN NEW;
  END IF;

  IF public.get_user_rol() <> 'operador_planta' THEN
    RAISE EXCEPTION 'Solo el operador de planta puede iniciar la preparacion';
  END IF;

  PERFORM pg_advisory_xact_lock(730241906);

  SELECT COALESCE(c.unidades_saldo, 0)
    INTO v_stock_unidades
    FROM public.control_inventario_diario c
   ORDER BY c.fecha DESC
   LIMIT 1;

  SELECT COALESCE(SUM(p.unidades), 0)
    INTO v_reservadas
    FROM public.pedidos p
   WHERE p.estado IN ('EN_PREPARACION', 'LISTO', 'RECOGIDO')
     AND p.id <> OLD.id;

  IF NEW.unidades > v_stock_unidades - v_reservadas THEN
    RAISE EXCEPTION
      'Stock insuficiente para iniciar este pedido. Stock: %, reservado: %, disponible: %, pedido: % unidades',
      v_stock_unidades,
      v_reservadas,
      GREATEST(v_stock_unidades - v_reservadas, 0),
      NEW.unidades;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS z_validar_stock_preparacion ON public.pedidos;
CREATE TRIGGER z_validar_stock_preparacion
  BEFORE UPDATE OF estado ON public.pedidos
  FOR EACH ROW
  WHEN (OLD.estado = 'APROBADO' AND NEW.estado = 'EN_PREPARACION')
  EXECUTE FUNCTION public.validar_stock_al_iniciar_pedido();

GRANT EXECUTE ON FUNCTION public.obtener_disponibilidad_pedidos_planta() TO authenticated;
