BEGIN;

CREATE OR REPLACE FUNCTION public.validar_despacho_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado TEXT;
  v_unidades_pedido BIGINT;
BEGIN
  IF NEW.pedido_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.estado, p.unidades
    INTO v_estado, v_unidades_pedido
    FROM public.pedidos p
   WHERE p.id = NEW.pedido_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el pedido vinculado al despacho.';
  END IF;
  IF TG_OP = 'INSERT' AND v_estado IS DISTINCT FROM 'LISTO' THEN
    RAISE EXCEPTION 'El pedido debe estar listo y no debe tener un despacho previo.';
  END IF;
  IF NEW.unidades IS NULL OR NEW.unidades <= 0 THEN
    RAISE EXCEPTION 'Las unidades despachadas deben ser mayores que cero.';
  END IF;
  IF v_unidades_pedido IS NULL OR NEW.unidades > v_unidades_pedido THEN
    RAISE EXCEPTION 'No se pueden despachar más unidades que las solicitadas en el pedido.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_unidades_despacho_pedido
  ON public.despacho_pollo;
CREATE TRIGGER validar_unidades_despacho_pedido
  BEFORE INSERT OR UPDATE OF pedido_id, unidades
  ON public.despacho_pollo
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_despacho_pedido();

REVOKE ALL ON FUNCTION public.validar_despacho_pedido() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
