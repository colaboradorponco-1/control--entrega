-- ============================================================
--  DIAGNOSTICO DEL ESTADO DE LA BASE
--  Solo lee: se puede correr las veces que quieras.
--  Sirve para ver que scripts hay que volver a correr.
-- ============================================================

-- 1) Las funciones que usa la app.
--    Si no aparecen, falta correr el script que las crea.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       pg_get_function_result(p.oid) AS devuelve,
       CASE
         WHEN p.proname = 'enviar_observaciones_entrega_pedido'
           THEN position('IS DISTINCT FROM' IN pg_get_functiondef(p.oid)) > 0
         ELSE NULL
       END AS frena_por_rol
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'enviar_observaciones_entrega_pedido',
     'rechazar_pedido',
     'url_evidencia',
     'confirmar_recepcion_pedido',
     'confirmar_entrega_despacho',
     'actualizar_mi_perfil',
     'url_avatar',
     'get_user_rol_exacto',
     'get_user_es_admin'
   )
 ORDER BY p.proname, argumentos;

-- 2) La tabla del reporte de entrega.
SELECT CASE
         WHEN to_regclass('public.pedido_reportes_entrega') IS NULL
           THEN 'FALTA la tabla public.pedido_reportes_entrega'
         ELSE 'OK la tabla del reporte existe'
       END AS tabla_del_reporte,
       (SELECT count(*) FROM public.pedido_reportes_entrega) AS reportes_guardados;

-- 3) Las columnas viejas del reporte: tiene que dar 0.
SELECT count(*) AS columnas_del_reporte_que_quedan
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'pedido_recepciones'
   AND column_name IN (
     'observaciones_entrega', 'observaciones_entrega_en',
     'estado_producto', 'fotos_observaciones'
   );

-- 4) Los CHECK de estado: tienen que aceptar RECHAZADO.
--    Si no salen es que falta correr ESTADO_RECHAZADO.sql.
SELECT conrelid::regclass::text AS tabla, conname, pg_get_constraintdef(oid) AS definicion
  FROM pg_constraint
 WHERE conrelid::regclass::text IN ('pedidos', 'pedido_estado_historial')
   AND contype = 'c'
   AND conname IN ('pedidos_estado_check', 'pedido_estado_historial_estado_check');

-- 4b) Los triggers de la tabla pedidos.
--     tiene que aparecer pedidos_validar_rechazo.
SELECT t.tgname, pg_get_triggerdef(t.oid) AS definicion
  FROM pg_trigger t
 WHERE t.tgrelid = 'public.pedidos'::regclass
   AND NOT t.tgisinternal
 ORDER BY t.tgname;

-- 4c) El pedido 1 (una prueba mia lo dejo en RECHAZADO).
SELECT id, estado, motivo_rechazo, sucursal_id FROM public.pedidos WHERE id = 1;

-- 4d) El historial del pedido 1: se ven las pruebas que quedaron.
SELECT id, pedido_id, estado, usuario_id, creado_en
  FROM public.pedido_estado_historial
 WHERE pedido_id = 1
 ORDER BY id;

-- 5) Las columnas del perfil (foto y avatar).
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'perfiles_usuario'
   AND column_name IN ('foto_url', 'avatar_estilo', 'avatar_semilla')
 ORDER BY column_name;

-- 6) El bucket de los avatares y las politicas del bucket de evidencias.
SELECT id, name, public FROM storage.buckets WHERE id IN ('avatares', 'evidencias');

SELECT policyname, cmd, qual
  FROM pg_policies
 WHERE schemaname = 'storage'
   AND tablename = 'objects'
   AND policyname IN (
     'evidencias_ver', 'evidencias_administrar', 'evidencias_subir',
     'avatares_insert', 'avatares_select', 'avatares_delete'
   )
 ORDER BY policyname;

-- 7) La bandeja de avisos.
SELECT CASE
         WHEN to_regclass('public.notificaciones') IS NULL
           THEN 'FALTA la tabla public.notificaciones'
         ELSE 'OK la bandeja de avisos existe'
       END AS bandeja_de_avisos,
       (SELECT count(*) FROM public.notificaciones) AS avisos_guardados;
