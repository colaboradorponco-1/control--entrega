-- Archive individual plant receipts without changing inventory totals.
BEGIN;

CREATE TABLE IF NOT EXISTS public.recepciones_planta_archivadas (
  recepcion_id INT PRIMARY KEY
    REFERENCES public.recepcion_pollo(id) ON DELETE CASCADE,
  archivado BOOLEAN NOT NULL DEFAULT TRUE,
  archivado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archivado_en TIMESTAMPTZ,
  restaurado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  restaurado_en TIMESTAMPTZ,
  CHECK (NOT archivado OR archivado_en IS NOT NULL)
);

ALTER TABLE public.recepciones_planta_archivadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recepciones_planta_archivadas_read
  ON public.recepciones_planta_archivadas;
CREATE POLICY recepciones_planta_archivadas_read
  ON public.recepciones_planta_archivadas
  FOR SELECT TO authenticated
  USING (
    public.get_user_rol() = 'operador_planta'
    OR public.get_user_rol() = 'administrador'
    OR public.get_user_es_superadmin()
  );

REVOKE ALL ON public.recepciones_planta_archivadas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.recepciones_planta_archivadas TO authenticated;

CREATE OR REPLACE FUNCTION public.archivar_recepcion_planta(
  p_recepcion_id INT,
  p_archivar BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.get_user_rol() IS DISTINCT FROM 'operador_planta'
     AND NOT COALESCE(public.get_user_es_superadmin(), FALSE) THEN
    RAISE EXCEPTION 'Solo el operador de planta o el superadministrador pueden archivar ingresos.'
      USING ERRCODE = '42501';
  END IF;

  IF p_recepcion_id IS NULL OR p_recepcion_id <= 0 OR p_archivar IS NULL THEN
    RAISE EXCEPTION 'Indica un ingreso válido y si deseas archivarlo o restaurarlo.';
  END IF;

  PERFORM 1
    FROM public.recepcion_pollo
   WHERE id = p_recepcion_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el ingreso de planta.';
  END IF;

  IF p_archivar THEN
    INSERT INTO public.recepciones_planta_archivadas (
      recepcion_id, archivado, archivado_por, archivado_en,
      restaurado_por, restaurado_en
    )
    VALUES (p_recepcion_id, TRUE, auth.uid(), NOW(), NULL, NULL)
    ON CONFLICT (recepcion_id) DO UPDATE SET
      archivado = TRUE,
      archivado_por = EXCLUDED.archivado_por,
      archivado_en = EXCLUDED.archivado_en,
      restaurado_por = NULL,
      restaurado_en = NULL;
  ELSE
    UPDATE public.recepciones_planta_archivadas
       SET archivado = FALSE,
           restaurado_por = auth.uid(),
           restaurado_en = NOW()
     WHERE recepcion_id = p_recepcion_id
       AND archivado = TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El ingreso no está archivado.';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.archivar_recepcion_planta(INT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archivar_recepcion_planta(INT, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
