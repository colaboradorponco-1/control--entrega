import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ALERTA: Las variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY están vacías en el archivo .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // sessionStorage (no localStorage) para que cada pestaña tenga su
    // propia sesión: así se puede entrar con otro usuario en otra
    // pestaña sin que se pisen entre sí.
    storage: window.sessionStorage,
  },
});