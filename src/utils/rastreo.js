export const VELOCIDAD_URBANA_KMH = 25;

export function aCoordenada(latitud, longitud) {
  const lat = Number(latitud);
  const lng = Number(longitud);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

export function distanciaMetros([lat1, lng1], [lat2, lng2]) {
  const radio = 6371000;
  const aRad = (grados) => (grados * Math.PI) / 180;
  const dLat = aRad(lat2 - lat1);
  const dLng = aRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * radio * Math.asin(Math.sqrt(a));
}

export function longitudRutaMetros(puntos) {
  let total = 0;
  for (let i = 1; i < puntos.length; i += 1) {
    total += distanciaMetros(puntos[i - 1], puntos[i]);
  }
  return total;
}

export function segundosEnLineaRecta(puntoA, puntoB) {
  if (!puntoA || !puntoB) return null;
  const metros = distanciaMetros(puntoA, puntoB);
  return (metros / 1000 / VELOCIDAD_URBANA_KMH) * 3600;
}

export function minutosDesdeSegundos(segundos) {
  if (!Number.isFinite(segundos)) return null;
  return Math.max(1, Math.ceil(segundos / 60));
}

export function coordenadasAGeoJson(rutaGeoJson) {
  if (!Array.isArray(rutaGeoJson)) return [];
  const puntos = [];
  for (const par of rutaGeoJson) {
    const punto = aCoordenada(par?.[1], par?.[0]);
    if (punto) puntos.push(punto);
  }
  return puntos;
}

export function dividirRuta(puntos, posicion) {
  if (!puntos.length) return { recorrido: [], restante: [] };
  if (!posicion) return { recorrido: [], restante: puntos };

  let cercano = 0;
  let menor = Infinity;
  for (let i = 0; i < puntos.length; i += 1) {
    const distancia = distanciaMetros(puntos[i], posicion);
    if (distancia < menor) {
      menor = distancia;
      cercano = i;
    }
  }
  return {
    recorrido: puntos.slice(0, cercano + 1),
    restante: puntos.slice(cercano),
  };
}

export function animarMarcador(marcador, destino, duracion = 900) {
  if (!marcador || !destino) return () => {};
  const inicio = marcador.getLatLng();
  const latInicio = inicio.lat;
  const lngInicio = inicio.lng;
  const [latFin, lngFin] = destino;
  const t0 = performance.now();
  let frame = 0;
  let cancelado = false;

  const paso = (ahora) => {
    if (cancelado) return;
    const t = Math.min(1, (ahora - t0) / duracion);
    const suave = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    marcador.setLatLng([
      latInicio + (latFin - latInicio) * suave,
      lngInicio + (lngFin - lngInicio) * suave,
    ]);
    if (t < 1) frame = requestAnimationFrame(paso);
  };
  frame = requestAnimationFrame(paso);

  return () => {
    cancelado = true;
    if (frame) cancelAnimationFrame(frame);
  };
}
