
INSERT INTO public.roles (nombre) VALUES ('dueno')
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.duenos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  documento TEXT,
  telefono TEXT,
  email TEXT,

  activo BOOLEAN NOT NULL DEFAULT TRUE,
  notas TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS duenos_nombre_unico
  ON public.duenos (lower(btrim(nombre)));


CREATE TABLE IF NOT EXISTS public.sucursal_duenos (
  sucursal_id INT NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
  dueno_id    INT NOT NULL REFERENCES public.duenos(id)       ON DELETE CASCADE,
  asignado_en TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sucursal_id, dueno_id)
);
CREATE INDEX IF NOT EXISTS sucursal_duenos_dueno_idx
  ON public.sucursal_duenos (dueno_id);

ALTER TABLE public.perfiles_usuario
  ADD COLUMN IF NOT EXISTS dueno_id INT REFERENCES public.duenos(id) ON DELETE SET NULL;

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'perfiles_usuario'
   AND column_name  = 'dueno_id';

SELECT nombre FROM public.roles WHERE nombre = 'dueno';
