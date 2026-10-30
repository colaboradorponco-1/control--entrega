
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS archivado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archivado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archivado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_archivado
  ON public.pedidos(archivado)
  WHERE archivado;

CREATE OR REPLACE FUNCTION public.guardar_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_rol TEXT := public.get_user_rol();
  v_cargado BOOLEAN;
BEGIN

  IF NEW.archivado IS DISTINCT FROM OLD.archivado
     AND NEW.estado IS NOT DISTINCT FROM OLD.estado
     AND NEW.sucursal_id IS NOT DISTINCT FROM OLD.sucursal_id
     AND NEW.unidades IS NOT DISTINCT FROM OLD.unidades
     AND NEW.fecha IS NOT DISTINCT FROM OLD.fecha
     AND NEW.creado_por IS NOT DISTINCT FROM OLD.creado_por
     AND NEW.kilos_despachados IS NOT DISTINCT FROM OLD.kilos_despachados
     AND NEW.observaciones IS NOT DISTINCT FROM OLD.observaciones THEN
    RETURN NEW;
  END IF;

  IF NEW.estado = 'RECHAZADO'
     AND OLD.estado IS DISTINCT FROM 'RECHAZADO'
     AND coalesce(current_setting('app.rechazo_autorizado', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF v_rol = 'administrador' THEN

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

DROP TRIGGER IF EXISTS t_pedidos_guardar ON public.pedidos;
CREATE TRIGGER t_pedidos_guardar
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.guardar_pedido();

DROP POLICY IF EXISTS pedidos_archivar ON public.pedidos;
CREATE POLICY pedidos_archivar ON public.pedidos
  FOR UPDATE TO authenticated
  USING (
    (public.get_user_rol() = 'sucursal'
      AND sucursal_id = public.get_user_sucursal())
    OR (public.get_user_es_dueno()
      AND sucursal_id = ANY(public.get_user_sucursales_dueno()))
  )
  WITH CHECK (
    (public.get_user_rol() = 'sucursal'
      AND sucursal_id = public.get_user_sucursal())
    OR (public.get_user_es_dueno()
      AND sucursal_id = ANY(public.get_user_sucursales_dueno()))
  );

DROP POLICY IF EXISTS pedidos_delete_archivado ON public.pedidos;
CREATE POLICY pedidos_delete_archivado ON public.pedidos
  FOR DELETE TO authenticated
  USING (
    archivado = TRUE
    AND (
      (public.get_user_rol() = 'sucursal'
        AND sucursal_id = public.get_user_sucursal())
      OR (public.get_user_es_dueno()
        AND sucursal_id = ANY(public.get_user_sucursales_dueno()))
    )
  );

SELECT 'columna'::text AS tipo, column_name::text AS detalle
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'pedidos'
   AND column_name IN ('archivado', 'archivado_en', 'archivado_por')
UNION ALL
SELECT 'politica'::text, policyname::text
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'pedidos'
   AND policyname IN ('pedidos_archivar', 'pedidos_delete_archivado')
UNION ALL
SELECT 'trigger'::text, tgname::text
  FROM pg_trigger
 WHERE tgrelid = 'public.pedidos'::regclass
   AND tgname = 't_pedidos_guardar'
   AND NOT tgisinternal
ORDER BY tipo, detalle;

NOTIFY pgrst, 'reload schema';
