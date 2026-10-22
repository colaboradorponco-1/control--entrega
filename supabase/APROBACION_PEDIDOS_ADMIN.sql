-- Ejecutar despues de pedidos.sql, duenos.sql y PEDIDOS_DUENO_Y_OBSERVACIONES.sql.

DO $$
DECLARE
  v_constraint RECORD;
BEGIN
  FOR v_constraint IN
    SELECT c.conrelid::REGCLASS AS tabla, c.conname
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND (
        c.conrelid = 'public.pedidos'::REGCLASS
        OR (
          to_regclass('public.pedido_estado_historial') IS NOT NULL
          AND c.conrelid = to_regclass('public.pedido_estado_historial')
        )
      )
      AND pg_get_constraintdef(c.oid) ILIKE '%PENDIENTE%'
      AND pg_get_constraintdef(c.oid) ILIKE '%EN_PREPARACION%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_constraint.tabla, v_constraint.conname);
  END LOOP;

  IF to_regclass('public.pedido_estado_historial') IS NOT NULL THEN
    ALTER TABLE public.pedido_estado_historial
      ADD CONSTRAINT pedido_estado_historial_estado_aprobado_check
      CHECK (estado IN (
        'PENDIENTE','APROBADO','EN_PREPARACION','LISTO','RECOGIDO','ENTREGADO','CANCELADO'
      ));
  END IF;

  ALTER TABLE public.pedidos
    ADD CONSTRAINT pedidos_estado_aprobado_check
    CHECK (estado IN (
      'PENDIENTE','APROBADO','EN_PREPARACION','LISTO','RECOGIDO','ENTREGADO','CANCELADO'
    ));
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_rol TEXT := public.get_user_rol();
  v_cargado BOOLEAN;
BEGIN
  IF v_rol = 'administrador' THEN
    -- El administrador solo aprueba pedidos pendientes. No cambia el
    -- estado a nada mas y no cancela: cancelar es cosa de la sucursal.
    IF NEW.estado IS DISTINCT FROM OLD.estado
       AND NOT (OLD.estado = 'PENDIENTE' AND NEW.estado = 'APROBADO') THEN
      RAISE EXCEPTION 'El administrador solo puede aprobar pedidos pendientes';
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.despacho_pollo d
    WHERE d.pedido_id = OLD.id
      AND d.foto_url IS NOT NULL
      AND d.firma_url IS NOT NULL
  ) INTO v_cargado;

  IF NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
     OR NEW.unidades IS DISTINCT FROM OLD.unidades
     OR NEW.fecha IS DISTINCT FROM OLD.fecha
     OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
     OR (
       NEW.kilos_despachados IS DISTINCT FROM OLD.kilos_despachados
       AND NOT (
         v_rol = 'despachador'
         AND OLD.estado = 'LISTO'
         AND NEW.estado = 'RECOGIDO'
         AND v_cargado
       )
     ) THEN
    RAISE EXCEPTION 'Solo el administrador puede modificar los datos de un pedido';
  END IF;

  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  IF NEW.estado = 'CANCELADO' AND v_rol = 'sucursal' THEN
    -- La sucursal solo puede cancelar mientras el pedido sigue pendiente.
    IF OLD.estado <> 'PENDIENTE' THEN
      RAISE EXCEPTION 'La sucursal solo puede cancelar el pedido mientras esta pendiente';
    END IF;
    RETURN NEW;
  END IF;

  IF v_rol = 'sucursal'
     AND NEW.estado = 'ENTREGADO'
     AND OLD.estado = 'RECOGIDO'
     AND EXISTS (
       SELECT 1 FROM public.pedido_recepciones r WHERE r.pedido_id = OLD.id
     ) THEN
    RETURN NEW;
  END IF;

  IF v_rol = 'operador_planta'
     AND (
       (OLD.estado = 'APROBADO' AND NEW.estado = 'EN_PREPARACION')
       OR (OLD.estado = 'EN_PREPARACION' AND NEW.estado = 'LISTO')
     ) THEN
    RETURN NEW;
  END IF;

  IF v_rol = 'despachador'
     AND OLD.estado = 'LISTO'
     AND NEW.estado = 'RECOGIDO'
     AND v_cargado
     AND NEW.kilos_despachados IS NOT NULL
     AND NEW.kilos_despachados > 0 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Cambio de estado no permitido para este rol o etapa del pedido';
END;
$$;

-- Que el trigger use esta funcion (por si no existia).
DROP TRIGGER IF EXISTS t_pedidos_guardar ON public.pedidos;
CREATE TRIGGER t_pedidos_guardar
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.guardar_pedido();

NOTIFY pgrst, 'reload schema';
