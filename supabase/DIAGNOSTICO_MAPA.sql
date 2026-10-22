DROP TABLE IF EXISTS _diag_mapa;
CREATE TEMP TABLE _diag_mapa (seccion TEXT, detalle TEXT);

INSERT INTO _diag_mapa
SELECT 'columna', table_name || '.' || column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('recepcion_pollo', 'despacho_pollo', 'pedido_recepciones')
   AND column_name IN ('latitude', 'longitude', 'longitud')
 ORDER BY 1, 2;

INSERT INTO _diag_mapa
SELECT 'funcion', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('registrar_lote_proveedor', 'despachar_pedido', 'confirmar_recepcion_pedido')
 ORDER BY 1, 2;

DO $$
DECLARE
  t TEXT;
  col_lng TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['recepcion_pollo', 'despacho_pollo', 'pedido_recepciones'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = t AND column_name = 'latitude') THEN
      INSERT INTO _diag_mapa VALUES ('conteo', t || ': sin columna latitude');
      CONTINUE;
    END IF;

    col_lng := 'longitude';
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = t AND column_name = 'longitud') THEN
      col_lng := 'longitud';
    END IF;

    EXECUTE format(
      'INSERT INTO _diag_mapa SELECT ''conteo'', %L || count(*) || '' filas, '' || count(latitude) || '' con lat, '' || count(%I) || '' con lng'' FROM public.%I',
      t || ': ', col_lng, t
    );
  END LOOP;
END $$;

SELECT seccion, detalle FROM _diag_mapa ORDER BY seccion, detalle;
