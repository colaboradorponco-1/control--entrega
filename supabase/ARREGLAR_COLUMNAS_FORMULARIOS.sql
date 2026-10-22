-- ============================================================
--  ARREGLAR COLUMNAS QUE FALTAN (FORMULARIOS.sql no se aplico)
-- ------------------------------------------------------------
--  Corrige errores como:
--    column "precio_por_kilo" of relation "despacho_pollo"
--    does not exist
--
--  Causa: en la base solo corrio instalar.sql. FORMULARIOS.sql
--  (y MAPA_UBICACION.sql para GPS) agregan columnas que el
--  formulario de despacho/recepcion necesita. Aca se agregan
--  todas de una, con ADD COLUMN IF NOT EXISTS: no borra datos
--  y se puede correr varias veces.
-- ============================================================

-- Recepcion de pollo (lote del proveedor)
DO $$
BEGIN
  IF to_regclass('public.recepcion_pollo') IS NOT NULL THEN
    ALTER TABLE public.recepcion_pollo
      ADD COLUMN IF NOT EXISTS observaciones TEXT,
      ADD COLUMN IF NOT EXISTS foto_url TEXT,
      ADD COLUMN IF NOT EXISTS firma_entrega_url TEXT,
      ADD COLUMN IF NOT EXISTS firma_recepcion_url TEXT,
      ADD COLUMN IF NOT EXISTS entregado_por_nombre TEXT,
      ADD COLUMN IF NOT EXISTS recibido_por_nombre TEXT,
      ADD COLUMN IF NOT EXISTS recibido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS fotos_extra TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7),
      ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);
  END IF;
END $$;

-- Despacho (carga hacia la sucursal)
DO $$
BEGIN
  IF to_regclass('public.despacho_pollo') IS NOT NULL THEN
    ALTER TABLE public.despacho_pollo
      ADD COLUMN IF NOT EXISTS precio_por_kilo NUMERIC(10,2),
      ADD COLUMN IF NOT EXISTS transportista TEXT,
      ADD COLUMN IF NOT EXISTS foto_url TEXT,
      ADD COLUMN IF NOT EXISTS firma_url TEXT,
      ADD COLUMN IF NOT EXISTS entregado_por_nombre TEXT,
      ADD COLUMN IF NOT EXISTS pedido_id INT REFERENCES public.pedidos(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS fotos_extra TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7),
      ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);

    -- total calculado (va aparte: depende de precio_por_kilo)
    ALTER TABLE public.despacho_pollo
      ADD COLUMN IF NOT EXISTS total_monto NUMERIC(14,2)
        GENERATED ALWAYS AS (ROUND(kilos * COALESCE(precio_por_kilo, 0), 2)) STORED;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_despacho_pedido
      ON public.despacho_pollo(pedido_id) WHERE pedido_id IS NOT NULL;
  END IF;
END $$;

-- Recepcion en la sucursal (entrega)
DO $$
BEGIN
  IF to_regclass('public.pedido_recepciones') IS NOT NULL THEN
    ALTER TABLE public.pedido_recepciones
      ADD COLUMN IF NOT EXISTS recibido_por_nombre TEXT,
      ADD COLUMN IF NOT EXISTS foto_url TEXT,
      ADD COLUMN IF NOT EXISTS firma_url TEXT,
      ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7),
      ADD COLUMN IF NOT EXISTS longitud NUMERIC(10,7),
      ADD COLUMN IF NOT EXISTS fotos_extra TEXT[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- Pedidos: peso que se despacho (lo escribe despachar_pedido)
DO $$
BEGIN
  IF to_regclass('public.pedidos') IS NOT NULL THEN
    ALTER TABLE public.pedidos
      ADD COLUMN IF NOT EXISTS kilos_despachados NUMERIC(10,2);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificacion: las 5 columnas de despacho_pollo deben salir "ok"
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='despacho_pollo' AND column_name='precio_por_kilo')
       THEN 'ok' ELSE 'FALTA' END AS precio_por_kilo,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='despacho_pollo' AND column_name='transportista')
       THEN 'ok' ELSE 'FALTA' END AS transportista,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='despacho_pollo' AND column_name='pedido_id')
       THEN 'ok' ELSE 'FALTA' END AS pedido_id,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='despacho_pollo' AND column_name='fotos_extra')
       THEN 'ok' ELSE 'FALTA' END AS fotos_extra,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='despacho_pollo' AND column_name='latitude')
       THEN 'ok' ELSE 'FALTA' END AS latitude;
