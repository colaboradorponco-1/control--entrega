import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fondosDeMapa } from '../utils/capasMapa';

const CENTRO = [-17.3895, -66.1568];

const escapar = (texto) => String(texto ?? '').replace(/[&<>"']/g, (caracter) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[caracter]));

const aCoordenada = (latitud, longitud) => {
  const lat = Number(latitud);
  const lng = Number(longitud);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
};

const ICONO_ACTUAL = L.divIcon({
  className: '',
  html: '<div style="width:32px;height:32px;border-radius:50%;background:#0891b2;border:2px solid #fff;box-shadow:0 2px 6px #0006;display:flex;align-items:center;justify-content:center"><span style="font-size:16px">🚚</span></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export default function MapaRuta({ paradas, alto = 300, posicionActual = null }) {
  const contenedor = useRef(null);
  const mapa = useRef(null);
  const capa = useRef(null);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return undefined;

    const instancia = L.map(contenedor.current, {
      center: CENTRO,
      zoom: 12,
      scrollWheelZoom: false,
    });
    for (const fondo of fondosDeMapa()) {
      L.tileLayer(fondo.url, {
        maxZoom: fondo.maxZoom,
        attribution: fondo.attr,
      }).addTo(instancia);
    }
    capa.current = L.layerGroup().addTo(instancia);
    mapa.current = instancia;

    const ajustarTamano = window.setTimeout(() => instancia.invalidateSize(), 100);

    return () => {
      window.clearTimeout(ajustarTamano);
      capa.current = null;
      mapa.current = null;
      instancia.remove();
    };
  }, []);

  useEffect(() => {
    const instancia = mapa.current;
    const grupo = capa.current;
    if (!instancia || !grupo) return;

    grupo.clearLayers();
    const ubicadas = (paradas || []).filter((parada) => {
      const punto = aCoordenada(parada.latitude, parada.longitude);
      return punto !== null;
    });

    const puntos = ubicadas.map((parada) => aCoordenada(parada.latitude, parada.longitude));
    const puntoActual = aCoordenada(posicionActual?.[0], posicionActual?.[1]);

    if (puntos.length > 1) {
      L.polyline(puntos, {
        color: '#0891b2',
        weight: 4,
        opacity: 0.8,
        dashArray: '8 8',
      }).addTo(grupo);
    }

    ubicadas.forEach((parada, index) => {
      const numeroParada = parada.orden ?? index + 1;
      const icono = L.divIcon({
        className: '',
        html: `<div style="width:30px;height:30px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 2px 6px #0006;display:flex;align-items:center;justify-content:center;color:#172033;font:bold 13px system-ui">${numeroParada}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      L.marker(puntos[index], { icon: icono })
        .bindPopup(`<strong>${numeroParada}. ${escapar(parada.nombre)}</strong>`)
        .addTo(grupo);
    });

    if (puntoActual) {
      L.marker(puntoActual, { icon: ICONO_ACTUAL })
        .bindPopup('<strong>Tu ubicación</strong>')
        .addTo(grupo);
    }

    const todos = puntoActual ? [...puntos, puntoActual] : puntos;

    instancia.invalidateSize();
    if (todos.length === 1) {
      instancia.setView(todos[0], 15);
    } else if (todos.length > 1) {
      instancia.fitBounds(L.latLngBounds(todos), { padding: [28, 28], maxZoom: 15 });
    } else {
      instancia.setView(CENTRO, 12);
    }
  }, [paradas, posicionActual]);

  return <div ref={contenedor} style={{ height: alto }} className="w-full" aria-label="Mapa de paradas de la ruta" />;
}
