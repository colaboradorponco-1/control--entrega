-- FIRMA EN REPORTES DE ROSTICERO
-- Agrega soporte de firma al reporte diario.

-- 1. Agregar columna firma_url
ALTER TABLE public.reportes_rosticero
  ADD COLUMN IF NOT EXISTS firma_url TEXT;

-- 2. Actualizar RPC para incluir firma
CREATE OR REPLACE FUNCTION public.crear_reporte_rosticero(
  p_sucursal_id BIGINT,
  p_fecha DATE,
  p_hora_ingreso TIME,
  p_saldo_inicio_dia INTEGER,
  p_ingresos_dia INTEGER,
  p_saldo_final_dia INTEGER,
  p_pollos_vendidos_sistema INTEGER,
  p_obs_pollos_enfermos BOOLEAN,
  p_obs_pollos_pequenos BOOLEAN,
  p_obs_otros BOOLEAN,
  p_observaciones_detalle TEXT,
  p_cajero TEXT,
  p_supervisor TEXT,
  p_firma_url TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id BIGINT;
  v_nombre TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.perfiles_usuario pu
      JOIN public.roles r ON r.id = pu.rol_id
     WHERE pu.usuario_id = auth.uid()
       AND r.nombre = 'rosticero'
  ) THEN
    RAISE EXCEPTION 'Solo el rol rosticero puede registrar reportes.'
      USING ERRCODE = '42501';
  END IF;

  SELECT nombre_completo INTO v_nombre
  FROM public.perfiles_usuario WHERE usuario_id = auth.uid();

  INSERT INTO public.reportes_rosticero (
    sucursal_id, fecha, hora_ingreso, saldo_inicio_dia, ingresos_dia,
    saldo_final_dia, pollos_vendidos_sistema,
    obs_pollos_enfermos, obs_pollos_pequenos, obs_otros,
    observaciones_detalle, cajero, supervisor, firma_url, creado_por, creado_por_nombre
  ) VALUES (
    p_sucursal_id, p_fecha, p_hora_ingreso, p_saldo_inicio_dia, p_ingresos_dia,
    p_saldo_final_dia, p_pollos_vendidos_sistema,
    p_obs_pollos_enfermos, p_obs_pollos_pequenos, p_obs_otros,
    p_observaciones_detalle, p_cajero, p_supervisor, p_firma_url, auth.uid(), v_nombre
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
