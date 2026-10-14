-- ============================================================
--  DIAGNOSTICO DEL MAPA GENERAL
--  Responde UNA sola consulta con todo lo necesario para saber
--  por que el mapa del admin/superadmin muestra 0 puntos.
--
--  Se puede correr las veces que quieras. No cambia nada.
--
--  Como leerlo:
--   - "columna": que columnas de ubicacion existen de verdad.
--     Si NO aparece recepcion_pollo.latitude / despacho_pollo.latitude
--     -> ejecuta supabase/AGREGAR_COLUMNAS_GPS_MAPA.sql
--   - "funcion": que version de cada RPC existe. Deben tener
--     p_latitude / p_longitud / p_fotos_extra.
--     Si faltan o son cortas -> ejecuta los ARREGLAR_*.sql
--   - "conteo": cuantas filas hay y cuantas tienen coordenadas.
--     Si "filas" es >0 pero "con lat" es 0, los registros se
--     guardaron sin tocar el mapa -> no hay nada que dibujar.
-- ============================================================

DROP TABLE IF EXISTS _diag_mapa;
CREATE TEMP TABLE _diag_mapa (seccion TEXT, detalle TEXT);

-- 1) Columnas de ubicacion que existen
INSERT INTO _diag_mapa
SELECT 'columna', table_name || '.' || column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('recepcion_pollo', 'despacho_pollo', 'pedido_recepciones')
   AND column_name IN ('latitude', 'longitude', 'longitud')
 ORDER BY 1, 2;

-- 2) Versiones de las funciones RPC
INSERT INTO _diag_mapa
SELECT 'funcion', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('registrar_lote_proveedor', 'despachar_pedido', 'confirmar_recepcion_pedido')
 ORDER BY 1, 2;

-- 3) Cuantas filas hay y cuantas tienen coordenadas
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
