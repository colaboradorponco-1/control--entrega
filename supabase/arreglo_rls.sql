-- ============================================================
-- CIERRE DE SEGURIDAD: la sucursal solo confirma la entrega
--
-- La politica RLS protegia la FILA, pero no las COLUMNAS.
-- Un usuario de sucursal podia enviar su propia peticion y
-- cambiar los kilos o las unidades de un despacho.
--
-- RLS no permite restringir columnas, asi que se quita la
-- politica de UPDATE para el rol sucursal y se usa una funcion
-- que solo toca estado_recepcion y observaciones.
--
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- 1) FUNCION SEGURA DE CONFIRMACION
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_entrega_despacho(
  p_despacho_id INT,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS public.despacho_pollo
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_despacho public.despacho_pollo;
BEGIN
  IF public.get_user_rol() <> 'administrador' THEN
    IF public.get_user_rol() <> 'sucursal' THEN
      RAISE EXCEPTION 'Solo la sucursal receptora o un administrador pueden confirmar la entrega';
    END IF;

    SELECT * INTO v_despacho
      FROM public.despacho_pollo
     WHERE id = p_despacho_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El despacho no existe';
    END IF;

    IF v_despacho.sucursal_id IS DISTINCT FROM public.get_user_sucursal() THEN
      RAISE EXCEPTION 'Ese despacho no pertenece a tu sucursal';
    END IF;
  END IF;

  -- Solo se modifican estos dos campos. Kilos y unidades quedan intactos.
  UPDATE public.despacho_pollo
     SET estado_recepcion = 'RECIBIDO',
         observaciones = COALESCE(NULLIF(TRIM(p_observaciones), ''), NULL)
   WHERE id = p_despacho_id
  RETURNING * INTO v_despacho;

  -- Si no se actualizo ninguna fila es que el despacho no existe.
  -- Para el administrador esta era la unica comprobacion: la de
  -- arriba solo corre cuando el que llama no es admin.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El despacho no existe';
  END IF;

  RETURN v_despacho;
END;
$$;

-- ------------------------------------------------------------
-- 2) QUITAR EL UPDATE DIRECTO DE LA SUCURSAL
-- El despachador y el administrador conservan el acceso normal.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS despacho_confirmar ON public.despacho_pollo;

GRANT EXECUTE ON FUNCTION public.confirmar_entrega_despacho(INT, TEXT) TO authenticated;

-- La tabla sigue sin UPDATE directo para el rol sucursal:
-- la unica via es la funcion de arriba.
