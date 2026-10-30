-- ============================================================
--  DIAGNOSTICO: BANDEJA DE AVISOS Y FALTANTES
-- ------------------------------------------------------------
--  Corre este script en Supabase > SQL Editor despues de
--  aplicar los scripts de la bandeja. Muestra si cada pieza
--  quedo bien puesta.
-- ============================================================

-- 1) La tabla de avisos existe y con que columnas
SELECT 'columnas de la tabla' AS seccion, string_agg(column_name, ', ' ORDER BY ordinal_position) AS detalle
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'notificaciones';

-- 2) Las politicas: el aviso solo lo lee quien lo recibe
SELECT 'politica' AS seccion, policyname || ' -> ' || cmd AS detalle
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'notificaciones'
 ORDER BY policyname;

-- 3) Las funciones de la bandeja
SELECT 'rpc' AS seccion, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS detalle
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'marcar_notificacion_leida',
     'marcar_todas_notificaciones_leidas',
     'confirmar_recepcion_pedido',
     'enviar_observaciones_entrega_pedido',
     'url_evidencia',
     'get_user_es_admin'
   )
 ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- 4) Confirmar que NO quedo ninguna version vieja de las RPC
--    (una version vieja permitiria saltarse la evidencia)
SELECT 'overload peligroso' AS seccion,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS detalle
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'confirmar_recepcion_pedido',
     'enviar_observaciones_entrega_pedido',
     'url_evidencia'
   )
   AND pg_get_function_identity_arguments(p.oid) NOT IN (
     'p_pedido_id integer, p_unidades_recibidas integer, p_foto_url text, p_firma_url text, p_recibido_por text, p_observaciones text, p_latitude numeric, p_longitud numeric, p_fotos_extra text[]',
     'p_pedido_id integer, p_observaciones text, p_estado_producto text, p_fotos text[]',
     'p_ruta text, p_segundos integer'
   );

-- 5) A quien le tocaria recibir los avisos
SELECT 'destinatarios de los avisos' AS seccion,
       pu.nombre_completo || ' (' || r.nombre || ')' AS detalle
  FROM public.perfiles_usuario pu
  JOIN public.roles r ON r.id = pu.rol_id
 WHERE r.nombre = 'administrador'
   AND pu.activo IS NOT FALSE;

-- 6) Cuantos avisos hay y cuantos sin leer
SELECT 'avisos' AS seccion,
       count(*)::TEXT || ' en total, ' ||
       count(*) FILTER (WHERE NOT leido)::TEXT || ' sin leer' AS detalle
  FROM public.notificaciones;

-- 7) El bucket de las fotos y la funcion que da los enlaces
SELECT 'bucket' AS seccion,
       id || ' (publico=' || public || ', limite=' || file_size_limit || ')' AS detalle
  FROM storage.buckets
 WHERE id = 'evidencias';

-- 8) Prueba de la funcion de evidencia: debe decir que no existe
--    el archivo, no que falta la funcion
DO $$
DECLARE
  v_txt TEXT;
BEGIN
  BEGIN
    PERFORM public.url_evidencia('pedido-0/prueba/inexistente.jpg');
    v_txt := 'OK: la funcion existe y respondio';
  EXCEPTION WHEN others THEN
    v_txt := 'respuesta: ' || SQLERRM;
  END;
  RAISE NOTICE '%', v_txt;
END $$;

-- ============================================================
--  9) POR QUE NO LE LLEGA EL AVISO AL ADMINISTRADOR
-- ============================================================

-- 9a) Los roles que hay: tiene que existir 'administrador'
SELECT 'roles' AS seccion,
       r.id::TEXT || ' = ' || r.nombre AS detalle
  FROM public.roles r
 ORDER BY r.id;

-- 9b) Quien es cada uno y a quien le tocaria recibir los avisos
SELECT 'usuarios' AS seccion,
       pu.nombre_completo || ' | rol=' || r.nombre
         || ' | activo=' || COALESCE(pu.activo::TEXT, 'null')
         || ' | usuario_id=' || COALESCE(pu.usuario_id::TEXT, 'NULL') AS detalle
  FROM public.perfiles_usuario pu
  JOIN public.roles r ON r.id = pu.rol_id
 ORDER BY r.nombre, pu.nombre_completo;

-- 9c) Los ultimos avisos y para quien son
SELECT 'ultimos avisos' AS seccion,
       n.id::TEXT || ' | ' || n.tipo || ' | "' || COALESCE(n.titulo, '') || '"'
         || ' | para=' || COALESCE(n.destinatario_usuario_id::TEXT, 'NULL')
         || ' | leido=' || n.leido::TEXT
         || ' | ' || COALESCE(n.creado_en::TEXT, '') AS detalle
  FROM public.notificaciones n
 ORDER BY n.id DESC
 LIMIT 10;

-- 9d) Los reportes que mandaron las sucursales
DO $$
DECLARE
  v_txt TEXT;
BEGIN
  BEGIN
    SELECT string_agg(
             r.pedido_id::TEXT || ' | sucursal=' || COALESCE(r.sucursal_id::TEXT, 'NULL')
               || ' | estado=' || COALESCE(r.estado_producto, '-')
               || ' | por=' || COALESCE(r.enviado_por_nombre, '-')
               || ' | ' || COALESCE(r.enviado_en::TEXT, ''),
             ' ;; ')
      INTO v_txt
      FROM public.pedido_reportes_entrega r
     ORDER BY r.id DESC
     LIMIT 10;
    RAISE NOTICE 'reportes de entrega: %', COALESCE(v_txt, 'no hay ningun reporte');
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'reportes de entrega: no se pudo leer la tabla: %', SQLERRM;
  END;
END $$;

-- 9e) Si la RPC de recepcion avisa de los faltantes o no
--     'con avisos' = la version de AVISOS_CALIDAD_SUCURSAL.sql
--     'sin avisos'  = la version vieja: el admin nunca se entera
SELECT 'rpc de recepcion' AS seccion,
       CASE
         WHEN position('RECEPCION_FALTANTES' IN pg_get_functiondef(p.oid)) > 0
           THEN 'con avisos (AVISOS_CALIDAD_SUCURSAL.sql aplicado)'
         ELSE 'SIN avisos: falta correr AVISOS_CALIDAD_SUCURSAL.sql'
       END AS detalle
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'confirmar_recepcion_pedido';

-- 9f) La RPC del reporte de entrega: tiene que avisar al administrador
SELECT 'rpc del reporte' AS seccion,
       CASE
         WHEN position('REPORTE_ENTREGA' IN pg_get_functiondef(p.oid)) > 0
           THEN 'inserta el aviso en notificaciones: OK'
         ELSE 'NO inserta el aviso: el admin no se entera'
       END AS detalle
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'enviar_observaciones_entrega_pedido';

-- 9g) La bandeja llega en vivo o hay que recargar
SELECT 'realtime' AS seccion,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = 'notificaciones'
         ) THEN 'la tabla esta en supabase_realtime: los avisos llegan solos'
         ELSE 'la tabla NO esta en supabase_realtime: hay que recargar la pagina'
       END AS detalle;

-- 9h) Las columnas que la app consulta en la bandeja.
--     Si falta alguna, la consulta falla y la campana queda vacia.
SELECT 'columnas que pide la app' AS seccion,
       string_agg(column_name, ', ' ORDER BY column_name) AS detalle
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'notificaciones'
   AND column_name IN (
     'id', 'tipo', 'titulo', 'mensaje', 'pedido_id', 'sucursal_id',
     'sucursal_nombre', 'estado_producto', 'observaciones_entrega',
     'fotos_observaciones', 'unidades_pedidas', 'unidades_recibidas',
     'faltantes', 'recibido_por', 'observaciones_recepcion', 'foto_url',
     'firma_url', 'fotos_extra', 'origen_nombre', 'leido', 'leido_en',
     'creado_en'
   );

-- 9i) Las que faltan de las que pide la app (si hay alguna, hay que
--     volver a correr AVISOS_CALIDAD_SUCURSAL.sql)
SELECT 'columnas que faltan' AS seccion,
       string_agg(falta, ', ') AS detalle
  FROM (
    SELECT unnest(ARRAY[
      'id', 'tipo', 'titulo', 'mensaje', 'pedido_id', 'sucursal_id',
      'sucursal_nombre', 'estado_producto', 'observaciones_entrega',
      'fotos_observaciones', 'unidades_pedidas', 'unidades_recibidas',
      'faltantes', 'recibido_por', 'observaciones_recepcion', 'foto_url',
      'firma_url', 'fotos_extra', 'origen_nombre', 'leido', 'leido_en',
      'creado_en'
    ]) AS falta
  ) f
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'notificaciones'
      AND c.column_name = f.falta
 );
