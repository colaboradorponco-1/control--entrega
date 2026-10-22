
SELECT 'tabla' AS tipo,
       'duenos' AS objeto,
       CASE WHEN to_regclass('public.duenos') IS NULL
            THEN 'FALTA  -> correr DUENOS-PARTE1'
            ELSE 'ok' END AS estado

UNION ALL SELECT 'tabla', 'sucursal_duenos',
       CASE WHEN to_regclass('public.sucursal_duenos') IS NULL
            THEN 'FALTA  -> correr DUENOS-PARTE1'
            ELSE 'ok' END;

SELECT 'columna' AS tipo,
       'perfiles_usuario.dueno_id' AS objeto,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='perfiles_usuario'
            AND column_name='dueno_id')
       THEN 'ok' ELSE 'FALTA  -> correr DUENOS-PARTE1' END AS estado

UNION ALL SELECT 'columna', 'perfiles_usuario.activo',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='perfiles_usuario'
            AND column_name='activo')
       THEN 'ok' ELSE 'FALTA  -> correr USUARIOS_ACTIVO.sql' END

UNION ALL SELECT 'columna', 'recepcion_pollo.fotos_extra',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='recepcion_pollo'
            AND column_name='fotos_extra')
       THEN 'ok' ELSE 'FALTA  -> correr partes/PARTE1 a PARTE5' END

UNION ALL SELECT 'columna', 'despacho_pollo.fotos_extra',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='despacho_pollo'
            AND column_name='fotos_extra')
       THEN 'ok' ELSE 'FALTA  -> correr partes/PARTE1 a PARTE5' END

UNION ALL SELECT 'columna', 'pedido_recepciones.fotos_extra',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='pedido_recepciones'
            AND column_name='fotos_extra')
       THEN 'ok' ELSE 'FALTA  -> correr partes/PARTE1 a PARTE5' END;


SELECT 'funcion' AS tipo,
       'registrar_lote_proveedor' AS objeto,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='registrar_lote_proveedor')
       THEN 'ok' ELSE 'FALTA  -> correr partes/PARTE1 a PARTE5' END AS estado

UNION ALL SELECT 'funcion', 'despachar_pedido',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='despachar_pedido')
       THEN 'ok' ELSE 'FALTA  -> correr partes/PARTE1 a PARTE5' END

UNION ALL SELECT 'funcion', 'confirmar_recepcion_pedido',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='confirmar_recepcion_pedido')
       THEN 'ok' ELSE 'FALTA  -> correr partes/PARTE1 a PARTE5' END

UNION ALL SELECT 'funcion', 'validar_fotos_extra',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='validar_fotos_extra')
       THEN 'ok' ELSE 'FALTA  -> correr partes/PARTE1 a PARTE5' END;

SELECT 'funcion' AS tipo,
       'get_user_es_dueno' AS objeto,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='get_user_es_dueno')
       THEN 'ok' ELSE 'FALTA  -> correr DUENOS-PARTE2' END AS estado

UNION ALL SELECT 'funcion', 'get_user_sucursales_dueno',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='get_user_sucursales_dueno')
       THEN 'ok' ELSE 'FALTA  -> correr DUENOS-PARTE2' END

UNION ALL SELECT 'funcion', 'get_user_dueno_id',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='get_user_dueno_id')
       THEN 'ok' ELSE 'FALTA  -> correr DUENOS-PARTE2' END;


SELECT 'rol' AS tipo,
       'dueno' AS objeto,
       CASE WHEN EXISTS (SELECT 1 FROM public.roles WHERE nombre='dueno')
       THEN 'ok' ELSE 'FALTA  -> correr DUENOS-PARTE1' END AS estado;

SELECT count(*) FILTER (WHERE estado LIKE 'FALTA%') AS pendientes,
       count(*) FILTER (WHERE estado = 'ok')         AS correctos
FROM (
  SELECT CASE WHEN to_regclass('public.duenos') IS NULL THEN 'FALTA' ELSE 'ok' END AS estado
  UNION ALL SELECT CASE WHEN to_regclass('public.sucursal_duenos') IS NULL THEN 'FALTA' ELSE 'ok' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='perfiles_usuario' AND column_name='dueno_id') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='perfiles_usuario' AND column_name='activo') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recepcion_pollo' AND column_name='fotos_extra') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='despacho_pollo' AND column_name='fotos_extra') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pedido_recepciones' AND column_name='fotos_extra') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='registrar_lote_proveedor') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='despachar_pedido') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='confirmar_recepcion_pedido') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='validar_fotos_extra') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_user_es_dueno') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_user_sucursales_dueno') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_user_dueno_id') THEN 'ok' ELSE 'FALTA' END
  UNION ALL SELECT CASE WHEN EXISTS (SELECT 1 FROM public.roles WHERE nombre='dueno') THEN 'ok' ELSE 'FALTA' END
) t;
