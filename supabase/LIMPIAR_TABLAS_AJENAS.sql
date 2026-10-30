SELECT cl.relname AS tabla,
       c.conname  AS clave,
       cr.relname AS apunta_a,
       CASE WHEN cr.relname IN ('auditoria', 'control_inventario_diario',
                                'despacho_pollo', 'perfiles_usuario',
                                'proveedores', 'recepcion_pollo', 'roles',
                                'sucursales', 'pedidos', 'pedido_recepciones',
                                'duenos', 'sucursal_duenos')
            THEN 'PROPIA DE ESTE PROYECTO' ELSE 'del otro sistema' END AS destino
  FROM pg_constraint c
  JOIN pg_class     cl ON cl.oid = c.conrelid
  JOIN pg_namespace ns ON ns.oid = cl.relnamespace
  JOIN pg_class     cr ON cr.oid = c.confrelid
 WHERE c.contype = 'f'
   AND ns.nspname = 'public'
   AND cl.relname IN ('documentos_solicitudes', 'empleados', 'evidencias',
                      'memorandos', 'solicitudes_kardex')
 ORDER BY cl.relname, c.conname;


-- ------------------------------------------------------------
-- 2) Freno: nada externo puede depender de este grupo
-- ------------------------------------------------------------
--  Solo se cancela si hay algo de NUESTRO proyecto, o una vista,
--  apuntando a estas tablas. Las claves entre las propias tablas
--  del otro sistema no cuentan: se borran con ellas.

DO $freno$
DECLARE
  v_dependencias TEXT;
BEGIN
  SELECT string_agg(DISTINCT dependencia, ', ') INTO v_dependencias
    FROM (
      -- una tabla que NO vamos a borrar tiene una clave hacia el grupo
      SELECT 'la tabla ' || cn.relname || ' apunta a ' || cr.relname
             || ' con la clave ' || c.conname AS dependencia
        FROM pg_constraint c
        JOIN pg_class     cr ON cr.oid = c.confrelid
        JOIN pg_namespace nr ON nr.oid = cr.relnamespace
        JOIN pg_class     cn ON cn.oid = c.conrelid
       WHERE c.contype = 'f'
         AND nr.nspname = 'public'
         AND cr.relname IN ('documentos_solicitudes', 'empleados',
                            'evidencias', 'memorandos', 'solicitudes_kardex')
         AND cn.relname NOT IN ('documentos_solicitudes', 'empleados',
                                'evidencias', 'memorandos', 'solicitudes_kardex')
      UNION ALL
      -- vistas construidas sobre el grupo
      SELECT 'la vista ' || table_name
        FROM information_schema.views
       WHERE table_schema = 'public'
         AND table_name IN ('documentos_solicitudes', 'empleados',
                            'evidencias', 'memorandos', 'solicitudes_kardex')
    ) dependencias;

  IF v_dependencias IS NOT NULL THEN
    RAISE EXCEPTION 'No se borro nada. Depende de ellas: %', v_dependencias;
  END IF;
END $freno$;


-- ------------------------------------------------------------
-- 3) Borrar, de hija a padre
-- ------------------------------------------------------------
--  El orden importa. Postgres no te deja borrar una tabla que
--  todavia tiene una clave que la apunta.
--
--    evidencias                -> apunta a documentos_solicitudes y solicitudes_kardex
--    memorandos                -> apunta a empleados y solicitudes_kardex
--    documentos_solicitudes    -> apunta a empleados
--    solicitudes_kardex        -> apunta a empleados y tipos_incidencia
--    empleados                 -> apunta a roles y a si misma
--
--  Sin CASCADE a proposito: si algo se nos escapo, Postgres corta
--  y no borra nada, en vez de llevarse de paso un objeto que
--  no queriamos tocar.

DROP TABLE IF EXISTS public.evidencias;
DROP TABLE IF EXISTS public.memorandos;
DROP TABLE IF EXISTS public.documentos_solicitudes;
DROP TABLE IF EXISTS public.solicitudes_kardex;
DROP TABLE IF EXISTS public.empleados;


-- ------------------------------------------------------------
-- 4) Verificar
-- ------------------------------------------------------------

-- A) cuantas tablas hay. tiene que dar 13
--    (12 del proyecto mas tipos_incidencia)
SELECT count(*) AS tablas_en_la_base
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_type = 'BASE TABLE';

-- B) las 12 de este proyecto, todas tienen que decir 'ok'
WITH esperadas (nombre) AS (
  VALUES ('auditoria'),('control_inventario_diario'),('despacho_pollo'),
         ('perfiles_usuario'),('proveedores'),('recepcion_pollo'),
         ('roles'),('sucursales'),('pedidos'),('pedido_recepciones'),
         ('duenos'),('sucursal_duenos')
)
SELECT e.nombre AS tabla,
       CASE WHEN EXISTS (
              SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = e.nombre
            ) THEN 'ok' ELSE 'FALTA' END AS estado
  FROM esperadas e
 ORDER BY estado, e.nombre;

-- C) que queda del otro sistema
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('documentos_solicitudes', 'empleados', 'evidencias',
                      'memorandos', 'solicitudes_kardex', 'tipos_incidencia')
 ORDER BY table_name;