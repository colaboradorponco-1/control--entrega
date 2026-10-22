import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertCircle, Clock3, MapPin, Truck } from 'lucide-react';
import { supabase } from '../config/supabaseClient';
import {
  animarMarcador,
  distanciaMetros,
  dividirRuta,
  minutosDesdeSegundos,
  segundosEnLineaRecta,
} from '../utils/rastreo';

const SERVICIO_RUTAS = 'https://router.project-osrm.org';
const INTERVALO_RUTA_MS = 30000;

const ICONO_REPARTIDOR = L.divIcon({
  className: '',
  html: '<div style="background:#0891b2;color:white;border:2px solid white;border-radius:9999px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px #0006"><span style="font-size:18px">🚚</span></div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const ICONO_SUCURSAL = L.divIcon({
  className: '',
  html: '<div style="background:#7c3aed;color:white;border:2px solid white;border-radius:9999px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px #0006"><span style="font-size:16px">●</span></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export default function SeguimientoRepartidor({ pedido, darkMode }) {
  const contenedor = useRef(null);
  const mapa = useRef(null);
  const capa = useRef(null);
  const marcadorRepartidor = useRef(null);
  const marcadorSucursal = useRef(null);
  const lineaRuta = useRef(null);
  const lineaRecorrido = useRef(null);
  const cancelarAnimacion = useRef(null);
  const mapaAjustado = useRef(false);
  const ultimaSolicitudRuta = useRef(0);
  const solicitudRutaEnCurso = useRef(false);
  const [ubicacion, setUbicacion] = useState(null);
  const [error, setError] = useState('');
  const [ruta, setRuta] = useState(null);
  const [errorRuta, setErrorRuta] = useState('');
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const pedidoId = pedido.id;
  const destino = useMemo(() => {
    const latitude = pedido.sucursales?.latitude;
    const longitude = pedido.sucursales?.longitude;
    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      return null;
    }
    const lat = Number(pedido.sucursales?.latitude);
    const lng = Number(pedido.sucursales?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng)
      && lat >= -90 && lat <= 90
      && lng >= -180 && lng <= 180
      && (lat !== 0 || lng !== 0)
      ? [lat, lng]
      : null;
  }, [pedido.sucursales?.latitude, pedido.sucursales?.longitude]);

  const cargarUbicacion = useCallback(async () => {
    const { data, error: consultaError } = await supabase
      .from('seguimiento_pedidos')
      .select('latitude, longitude, ruta_nombre, actualizado_en')
      .eq('pedido_id', pedidoId)
      .maybeSingle();

    if (consultaError) {
      setError(consultaError.message);
      return;
    }
    setError('');
    setUbicacion(data);
  }, [pedidoId]);

  useEffect(() => {
    cargarUbicacion();

    const canal = supabase
      .channel(`seguimiento-pedido-${pedidoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'seguimiento_pedidos',
          filter: `pedido_id=eq.${pedidoId}`,
        },
        (cambio) => {
          if (cambio.eventType === 'DELETE') {
            setUbicacion(null);
            return;
          }
          setError('');
          setUbicacion(cambio.new);
        }
      )
      .subscribe();
    const intervalo = window.setInterval(cargarUbicacion, 30000);
    const reloj = window.setInterval(() => setAhora(Date.now()), 30000);

    return () => {
      window.clearInterval(intervalo);
      window.clearInterval(reloj);
      supabase.removeChannel(canal);
    };
  }, [cargarUbicacion, pedidoId]);

  const posicion = useMemo(() => {
    if (!ubicacion) return null;
    const lat = Number(ubicacion.latitude);
    const lng = Number(ubicacion.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng)
      && lat >= -90 && lat <= 90
      && lng >= -180 && lng <= 180
      ? [lat, lng]
      : null;
  }, [ubicacion]);

  useEffect(() => {
    if (!posicion || !destino) {
      setRuta(null);
      setErrorRuta('');
      setCargandoRuta(false);
      return undefined;
    }

    let temporizador;
    let vigente = true;
    const solicitarRuta = async () => {
      const restante = INTERVALO_RUTA_MS - (Date.now() - ultimaSolicitudRuta.current);
      if (restante > 0 || solicitudRutaEnCurso.current) {
        temporizador = window.setTimeout(solicitarRuta, Math.max(restante, 5000));
        return;
      }

      const origenActual = posicion;
      if (!origenActual) return;
      ultimaSolicitudRuta.current = Date.now();
      solicitudRutaEnCurso.current = true;
      setCargandoRuta(true);
      setErrorRuta('');

      try {
        const coordenadas = `${origenActual[1]},${origenActual[0]};${destino[1]},${destino[0]}`;
        const respuesta = await fetch(
          `${SERVICIO_RUTAS}/route/v1/driving/${coordenadas}?overview=full&geometries=geojson&steps=false`
        );
        if (!respuesta.ok) {
          throw new Error(`El servicio de rutas respondió ${respuesta.status}.`);
        }

        const resultado = await respuesta.json();
        const rutaCalculada = resultado.code === 'Ok' ? resultado.routes?.[0] : null;
        const coordenadasRuta = rutaCalculada?.geometry?.coordinates;
        if (!rutaCalculada || !Array.isArray(coordenadasRuta) || coordenadasRuta.length < 2) {
          throw new Error('No se encontró un recorrido por calles hasta la sucursal.');
        }

        if (vigente) {
          setRuta({
            coordenadas: coordenadasRuta,
            distanciaMetros: rutaCalculada.distance,
            duracionSegundos: rutaCalculada.duration,
          });
        }
      } catch (err) {
        if (vigente) {
          setRuta(null);
          setErrorRuta(err.message || 'No se pudo calcular el recorrido por calles.');
        }
      } finally {
        solicitudRutaEnCurso.current = false;
        if (vigente) setCargandoRuta(false);
      }
    };

    solicitarRuta();
    return () => {
      vigente = false;
      window.clearTimeout(temporizador);
    };
  }, [posicion, destino]);

  useEffect(() => {
    const elemento = contenedor.current;
    if (!elemento || mapa.current) return undefined;

    const instancia = L.map(elemento, {
      center: [-17.3895, -66.1568],
      zoom: 12,
      scrollWheelZoom: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(instancia);
    const grupo = L.layerGroup().addTo(instancia);
    mapa.current = instancia;
    capa.current = grupo;
    const ajustarTamano = window.setTimeout(() => instancia.invalidateSize(), 100);

    return () => {
      window.clearTimeout(ajustarTamano);
      cancelarAnimacion.current?.();
      cancelarAnimacion.current = null;
      capa.current = null;
      mapa.current = null;
      marcadorRepartidor.current = null;
      marcadorSucursal.current = null;
      lineaRuta.current = null;
      lineaRecorrido.current = null;
      mapaAjustado.current = false;
      instancia.remove();
    };
  }, []);

  useEffect(() => {
    const instancia = mapa.current;
    const grupo = capa.current;
    if (!instancia || !grupo) return;

    if (posicion) {
      if (marcadorRepartidor.current) {
        const actual = marcadorRepartidor.current.getLatLng();
        if (actual.lat !== posicion[0] || actual.lng !== posicion[1]) {
          cancelarAnimacion.current?.();
          cancelarAnimacion.current = animarMarcador(marcadorRepartidor.current, posicion, 900);
        }
      } else {
        marcadorRepartidor.current = L.marker(posicion, { icon: ICONO_REPARTIDOR }).addTo(grupo);
      }
    } else if (marcadorRepartidor.current) {
      cancelarAnimacion.current?.();
      cancelarAnimacion.current = null;
      grupo.removeLayer(marcadorRepartidor.current);
      marcadorRepartidor.current = null;
    }

    if (destino) {
      if (marcadorSucursal.current) {
        marcadorSucursal.current.setLatLng(destino);
      } else {
        marcadorSucursal.current = L.marker(destino, { icon: ICONO_SUCURSAL }).addTo(grupo);
      }
    } else if (marcadorSucursal.current) {
      grupo.removeLayer(marcadorSucursal.current);
      marcadorSucursal.current = null;
    }

    if (ruta?.coordenadas?.length > 1) {
      const puntosRuta = ruta.coordenadas.map(([lng, lat]) => [lat, lng]);
      const { recorrido, restante } = dividirRuta(puntosRuta, posicion);

      if (recorrido.length > 1) {
        if (lineaRecorrido.current) {
          lineaRecorrido.current.setLatLngs(recorrido);
        } else {
          lineaRecorrido.current = L.polyline(recorrido, {
            color: '#94a3b8',
            weight: 5,
            opacity: 0.8,
          }).addTo(grupo);
        }
      } else if (lineaRecorrido.current) {
        grupo.removeLayer(lineaRecorrido.current);
        lineaRecorrido.current = null;
      }

      const pendiente = restante.length > 1 ? restante : puntosRuta;
      if (lineaRuta.current) {
        lineaRuta.current.setLatLngs(pendiente);
        lineaRuta.current.setStyle({ color: '#0891b2', weight: 5, opacity: 0.95, dashArray: null });
      } else {
        lineaRuta.current = L.polyline(pendiente, {
          color: '#0891b2',
          weight: 5,
          opacity: 0.95,
        }).addTo(grupo);
      }
      if (!mapaAjustado.current) {
        instancia.invalidateSize();
        instancia.fitBounds(L.latLngBounds(puntosRuta), { padding: [36, 36], maxZoom: 15 });
        mapaAjustado.current = true;
      }
    } else if (posicion && destino && errorRuta) {
      const puntosRespaldo = [posicion, destino];
      if (lineaRecorrido.current) {
        grupo.removeLayer(lineaRecorrido.current);
        lineaRecorrido.current = null;
      }
      if (lineaRuta.current) {
        lineaRuta.current.setLatLngs(puntosRespaldo);
        lineaRuta.current.setStyle({ color: '#94a3b8', weight: 4, opacity: 0.7, dashArray: '8 8' });
      } else {
        lineaRuta.current = L.polyline(puntosRespaldo, {
          color: '#94a3b8',
          weight: 4,
          opacity: 0.7,
          dashArray: '8 8',
        }).addTo(grupo);
      }
      if (!mapaAjustado.current) {
        instancia.invalidateSize();
        instancia.fitBounds(lineaRuta.current.getBounds(), { padding: [36, 36], maxZoom: 15 });
        mapaAjustado.current = true;
      }
    } else {
      if (lineaRuta.current) {
        grupo.removeLayer(lineaRuta.current);
        lineaRuta.current = null;
      }
      if (lineaRecorrido.current) {
        grupo.removeLayer(lineaRecorrido.current);
        lineaRecorrido.current = null;
      }
    }

    if (!mapaAjustado.current && (posicion || destino)) {
      instancia.setView(posicion || destino, 14);
      mapaAjustado.current = true;
    } else if (!posicion && !destino) {
      mapaAjustado.current = false;
    }
  }, [posicion, destino, ruta, errorRuta]);

  useEffect(() => {
    const instancia = mapa.current;
    const visible = !error && Boolean(posicion || destino);
    if (!instancia || !visible) return undefined;
    const ajustar = window.setTimeout(() => instancia.invalidateSize(), 60);
    return () => window.clearTimeout(ajustar);
  }, [posicion, destino, error]);

  const mapaVisible = !error && Boolean(posicion || destino);
  const edadSegundos = ubicacion
    ? Math.max(0, Math.floor((ahora - new Date(ubicacion.actualizado_en).getTime()) / 1000))
    : Infinity;
  const ubicacionReciente = edadSegundos <= 90;
  const etaVial = ruta && ubicacionReciente ? ruta : null;
  const segundosEstimados = etaVial
    ? etaVial.duracionSegundos
    : (ubicacionReciente ? segundosEnLineaRecta(posicion, destino) : null);
  const minutosEstimados = segundosEstimados !== null
    ? minutosDesdeSegundos(segundosEstimados)
    : null;
  const distanciaEstimadaKm = etaVial
    ? etaVial.distanciaMetros / 1000
    : (posicion && destino ? distanciaMetros(posicion, destino) / 1000 : null);
  const estilosContenedor = darkMode
    ? 'border-cyan-900/60 bg-slate-900 text-slate-200'
    : 'border-cyan-200 bg-cyan-50 text-gray-800';

  return (
    <section className={`mt-4 rounded-xl border p-3 ${estilosContenedor}`} aria-label={`Seguimiento del pedido ${pedidoId}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Truck size={16} className="text-cyan-600" />
          Seguimiento del repartidor
        </div>
        {ubicacion?.ruta_nombre && (
          <span className="rounded-full bg-cyan-600/10 px-2 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            Ruta: {ubicacion.ruta_nombre}
          </span>
        )}
      </div>

      <div
        ref={contenedor}
        className={`mb-2 h-56 overflow-hidden rounded-lg border border-black/10 ${
          mapaVisible ? '' : 'hidden'
        }`}
        aria-label="Mapa de seguimiento del repartidor"
      />

      {error && (
        <p role="status" className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          No se pudo cargar el seguimiento: {error}
        </p>
      )}
      {!error && !ubicacion && (
        <p className="text-xs opacity-75">Esperando la primera ubicación GPS del repartidor...</p>
      )}
      {!error && ubicacion && !posicion && (
        <p className="text-xs opacity-75">La ubicación recibida no es válida.</p>
      )}
      {!error && ubicacion && posicion && (
        <>
          {!destino && (
            <p className="mb-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
              <MapPin size={15} className="mt-0.5 shrink-0" />
              La sucursal no tiene coordenadas guardadas; no se puede mostrar el destino ni estimar la llegada.
            </p>
          )}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5">
              <MapPin size={14} />
              {ubicacionReciente ? 'Ubicación en vivo' : 'Última ubicación desactualizada'}
              {' · '}
              {new Date(ubicacion.actualizado_en).toLocaleTimeString()}
            </span>
          </div>
          {minutosEstimados !== null && (
            <div className="mb-2 flex items-center gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
              <Clock3 size={24} className="shrink-0 text-cyan-600" />
              <div className="min-w-0">
                <div className="text-lg font-black leading-none text-cyan-700 dark:text-cyan-300">
                  Llega en ~{minutosEstimados} min
                </div>
                <div className="text-[10px] opacity-70">
                  {distanciaEstimadaKm !== null ? `${distanciaEstimadaKm.toFixed(1)} km` : ''}
                  {etaVial ? ' · recorrido por calles' : ' · estimado en línea recta'}
                </div>
              </div>
            </div>
          )}
          {destino && cargandoRuta && (
            <p className="mt-1 text-[10px] opacity-70">Calculando recorrido por calles...</p>
          )}
          {destino && errorRuta && (
            <p role="status" className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
              {errorRuta} Comprueba la conexión; el mapa seguirá mostrando las ubicaciones.
            </p>
          )}
          {minutosEstimados !== null && (
            <p className="mt-1 text-[10px] opacity-70">
              Recorrido vial aproximado por OSRM/OpenStreetMap; no incluye tráfico en tiempo real.
            </p>
          )}
          {!ubicacionReciente && (
            <p className="mt-1 text-[10px] opacity-70">
              El repartidor debe mantener abierta la aplicación para compartir su posición.
            </p>
          )}
        </>
      )}
      <p className="mt-1 text-[10px] opacity-60">Rutas: OSRM · Mapa: © OpenStreetMap</p>
    </section>
  );
}
