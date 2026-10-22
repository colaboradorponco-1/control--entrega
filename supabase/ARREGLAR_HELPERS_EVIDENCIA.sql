-- ============================================================
--  ARREGLAR funciones auxiliares de evidencia
-- ------------------------------------------------------------
--  Corrige:
--    function public.verificar_archivo(unknown, text, unknown)
--    does not exist
--
--  Causa: despachar_pedido (y registrar_lote_proveedor) llaman a
--  public.verificar_archivo y public.validar_fotos_extra, pero
--  esas funciones no se crearon en tu base. Las crea
--  FORMULARIOS.sql; aca van las dos solas, para no re-ejecutar
--  todo ese archivo.
--
--  Es seguro correrlo varias veces.
-- ============================================================

-- 1) Comprueba que la foto o firma exista de verdad en el bucket
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

-- 2) Valida las fotos de apoyo (maximo 7 y que sean del registro)
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

GRANT EXECUTE ON FUNCTION public.verificar_archivo(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validar_fotos_extra(TEXT[], TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- 3) Verificacion: las dos deben salir "ok"
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'verificar_archivo'
  ) THEN 'ok' ELSE 'FALTA' END AS verificar_archivo,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'validar_fotos_extra'
  ) THEN 'ok' ELSE 'FALTA' END AS validar_fotos_extra;
