import { useState, useEffect, useCallback, useId } from 'react';
import { useAuth } from '../context/AuthContext';
import { notificacionesRepository } from '../repositories/notificacionesRepository';
import { evidenciasRepository } from '../repositories/evidenciasRepository';
import { supabase } from '../config/supabaseClient';

const rutasDeFotos = (aviso) => [
  ...(aviso.fotos_observaciones || []),
  ...(aviso.fotos_extra || []),
  aviso.foto_url,
  aviso.firma_url,
].filter(Boolean);

/**
 * Avisos del administrador.
 *
 * Los carga, escucha los que llegan en vivo por realtime y pide
 * los enlaces con caducidad de las fotos (el bucket es privado).
 * Lo usan la campana del panel y la bandeja completa.
 */
export function useAvisos() {
  const { usuario } = useAuth();
  const [avisos, setAvisos] = useState([]);
  const [urls, setUrls] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Un canal por instancia: la campana y la bandeja pueden estar
  // montadas a la vez y no se pisan entre si. El id de React trae
  // dos puntos, que no van bien en el nombre del canal.
  const idInstancia = useId().replace(/[^a-zA-Z0-9]/g, '');

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setCargando(true);
      const lista = await notificacionesRepository.listar();
      setAvisos(lista);
      setError('');
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los avisos.');
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Respaldo por si el realtime no esta habilitado o se cae la
  // conexion: igual se refresca cada 25 segundos.
  useEffect(() => {
    const intervalo = setInterval(() => cargar({ silencioso: true }), 25000);
    return () => clearInterval(intervalo);
  }, [cargar]);

  // El aviso llega solo, sin recargar la pagina.
  useEffect(() => {
    if (!usuario?.id) return undefined;

    const canal = supabase
      .channel(`admin-notificaciones-${idInstancia}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notificaciones',
          filter: `destinatario_usuario_id=eq.${usuario.id}`,
        },
        () => cargar({ silencioso: true })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [usuario?.id, idInstancia, cargar]);

  // Las fotos viven en un bucket privado: hay que pedir un enlace
  // con caducidad para poderlas mostrar.
  useEffect(() => {
    const rutas = [...new Set(avisos.flatMap(rutasDeFotos))];
    if (rutas.length === 0) {
      setUrls({});
      return undefined;
    }

    let vivo = true;
    (async () => {
      const pares = await Promise.all(
        rutas.map(async (ruta) => {
          try {
            return [ruta, await evidenciasRepository.url(ruta)];
          } catch {
            return [ruta, null];
          }
        })
      );
      if (vivo) setUrls(Object.fromEntries(pares));
    })();

    return () => {
      vivo = false;
    };
  }, [avisos]);

  const marcarLeida = useCallback(async (aviso) => {
    try {
      await notificacionesRepository.marcarLeida(aviso.id);
      setAvisos((actuales) =>
        actuales.map((a) => (a.id === aviso.id ? { ...a, leido: true } : a))
      );
    } catch {
      // si no se pudo marcar, el aviso igual queda visible
    }
  }, []);

  const marcarTodas = useCallback(async () => {
    try {
      await notificacionesRepository.marcarTodasLeidas();
      setAvisos((actuales) => actuales.map((a) => ({ ...a, leido: true })));
    } catch {
      // sin aviso, el boton no hace nada
    }
  }, []);

  return { avisos, urls, cargando, error, cargar, marcarLeida, marcarTodas };
}
