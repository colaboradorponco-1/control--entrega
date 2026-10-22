-- ============================================================
--  DIAGNOSTICO: por que no se guarda el reporte de entrega
-- ------------------------------------------------------------
--  Recorre los pedidos ENTREGADOS, simula la sesion del usuario
--  de esa sucursal y prueba cada regla de la RPC. Al final
--  intenta el envio real para ver el error exacto.
--
--  Ejecutar en Supabase > SQL Editor. No deja datos: el unico
--  efecto posible es que un pedido quede con el reporte enviado
--  (eso esta bien, es la prueba) y su aviso creado.
-- ============================================================

DROP TABLE IF EXISTS _diag;

CREATE TEMP TABLE _diag (
  pedido int,
  sucursal int,
  detalle text
);

DO $$
DECLARE
  r record;
  v_user uuid;
  v_rol text;
  v_suc int;
  v_h numeric;
  v_obs text;
  v_recibido timestamptz;
  v_msg text;
BEGIN
  FOR r IN
    SELECT p.id AS pedido, p.sucursal_id,
           pr.recibido_en, rep.observaciones_entrega
      FROM public.pedidos p
      JOIN public.pedido_recepciones pr ON pr.pedido_id = p.id
      LEFT JOIN public.pedido_reportes_entrega rep ON rep.pedido_id = p.id
     WHERE p.estado = 'ENTREGADO'
  LOOP
    SELECT pu.usuario_id INTO v_user
      FROM public.perfiles_usuario pu
      JOIN public.roles r2 ON r2.id = pu.rol_id
     WHERE r2.nombre = 'sucursal' AND pu.sucursal_id = r.sucursal_id
     LIMIT 1;

    IF v_user IS NULL THEN
      INSERT INTO _diag VALUES (r.pedido, r.sucursal_id,
        'LA SUCURSAL NO TIENE USUARIO CON ROL sucursal');
      CONTINUE;
    END IF;

    -- Se hace pasar por el usuario de esa sucursal.
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text,
      true
    );

    v_rol := public.get_user_rol();
    v_suc := public.get_user_sucursal();
    v_h := extract(epoch FROM (now() - r.recibido_en)) / 3600;

    v_msg := format(
      'rol=%s | sucursal_del_usuario=%s | sucursal_del_pedido=%s | hace_h=%s | dentro_de_48h=%s | ya_tenia_reporte=%s',
      coalesce(v_rol, 'NULL'),
      coalesce(v_suc::text, 'NULL'),
      r.sucursal_id,
      round(v_h),
      (now() <= r.recibido_en + INTERVAL '48 hours'),
      (r.observaciones_entrega IS NOT NULL)
    );

    -- Ahora la prueba real de la RPC (sin fotos de apoyo).
    BEGIN
      PERFORM public.enviar_observaciones_entrega_pedido(
        r.pedido, 'PRUEBA DIAGNOSTICO', 'FRESCO', NULL
      );
      v_msg := v_msg || ' || RPC: OK (se guardo y se creo el aviso)';
    EXCEPTION WHEN OTHERS THEN
      v_msg := v_msg || ' || RPC ERROR: ' || sqlerrm;
    END;

    INSERT INTO _diag VALUES (r.pedido, r.sucursal_id, v_msg);
  END LOOP;
END $$;

SELECT * FROM _diag ORDER BY pedido;
