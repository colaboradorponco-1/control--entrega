-- ============================================================
--  DISPONIBILIDAD DE PLANTA PARA EL DUEÑO
-- ============================================================
--  Ejecutar en el SQL Editor de Supabase.
--
--  Problema: el panel del dueño consulta
--  obtener_disponibilidad_pedidos_planta() para mostrar el stock
--  y esa función solo aceptaba a operador_planta y administrador.
--  Por eso Supabase devolvía 400 (permiso denegado).
--
--  Esta versión permite también el rol 'dueno'.
-- ============================================================

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
  IF public.get_user_rol() NOT IN ('operador_planta', 'administrador', 'dueno') THEN
    RAISE EXCEPTION 'Solo planta, administracion y dueno pueden consultar el inventario';
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

GRANT EXECUTE ON FUNCTION public.obtener_disponibilidad_pedidos_planta() TO authenticated;
