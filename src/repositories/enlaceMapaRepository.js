import { supabase } from '../config/supabaseClient';

export const enlaceMapaRepository = {
  async resolver(url) {
    const { data, error } = await supabase.functions.invoke('resolver-enlace-mapa', {
      body: { url },
    });

    if (error) {
      throw new Error('No se pudo resolver el enlace corto. Confirma que la función resolver-enlace-mapa esté desplegada.');
    }
    if (data?.error) throw new Error(data.error);
    if (!data?.url) throw new Error('Google Maps no devolvió una dirección para ese enlace.');
    return data.url;
  },
};
