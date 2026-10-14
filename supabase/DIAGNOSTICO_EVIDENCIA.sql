-- ============================================================
--  DIAGNOSTICO DE EVIDENCIA (para entregas/despachos/recepciones)
--  Si la entrega no se guarda, casi siempre es porque falta el
--  bucket o las funciones de apoyo. Esto lo confirma.
--
--  Se puede correr las veces que quieras. No cambia nada.
-- ============================================================

DROP TABLE IF EXISTS _diag_evidencia;
CREATE TEMP TABLE _diag_evidencia (seccion TEXT, detalle TEXT);

-- 1) Funciones de apoyo que usan las RPC
INSERT INTO _diag_evidencia
SELECT 'funcion', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('verificar_archivo', 'validar_fotos_extra', 'url_evidencia')
 ORDER BY 1, 2;

-- 2) El bucket de evidencia
INSERT INTO _diag_evidencia
SELECT 'bucket', COALESCE(id || ' (publico=' || public || ')', '')
  FROM storage.buckets
 WHERE id = 'evidencias';

-- 3) Politicas de storage sobre evidencias
INSERT INTO _diag_evidencia
SELECT 'storage_policy', policyname
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND (qual LIKE '%evidencias%' OR with_check LIKE '%evidencias%')
 ORDER BY 1, 2;

-- 4) Politicas RLS de las tablas de movimiento
INSERT INTO _diag_evidencia
SELECT 'rls_policy', tablename || ': ' || policyname
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('recepcion_pollo', 'despacho_pollo', 'pedido_recepciones')
 ORDER BY 1, 2;

SELECT seccion, detalle FROM _diag_evidencia ORDER BY seccion, detalle;
