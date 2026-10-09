import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Trash2, Loader2, Search, Link2 } from 'lucide-react';
import { leerUbicacionDeEnlace } from '../utils/coordenadasMapa';
import { enlaceMapaRepository } from '../repositories/enlaceMapaRepository';

/**
 * mapa para marcar donde pasa la entrega.
 *
 * hay dos usos:
 *   - editable: el que registra le da donde tocar y queda guardado.
 *     se usa con onCambio.
 *   - solo lectura: muestra donde quedo registrado. sin onCambio.
 *
 * los datos van en las mismas columnas que el boton de gps que ya
 * existia (latitude y longitud), asi que la base no cambia.
 *
 * los mapas son de OpenStreetMap: no pide clave ni tarjeta, pero
 * necesita internet para dibujar el fondo. sin internet el mapa
 * queda gris, aunque el pin y las coordenadas sigan funcionando.
 */

// donde abre el mapa mientras no haya ningun punto marcado.
// cochabamba, Bolivia. se cambia en una sola linea.
const CENTRO = { lat: -17.3895, lng: -66.1568 };

// OpenStreetMap sirve los mapas sin necesitar una API key.
const FONDOS = {
  claro: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  },
};

// para buscar direcciones. es el de openstreetmap, sin clave.
// ellos lo usan para su propia app, asi que hay que usarlo poco.
const BUSCADOR = 'https://nominatim.openstreetmap.org/search';

// zoom con el que abre cuando todavia no hay pin
const ZOOM_INICIAL = 16;
const mapasPorContenedor = new WeakMap();

// el pin se dibuja con svg y no con la imagen que trae leaflet,
// porque esa imagen se rompe al compilar.
function crearIcono(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="26" height="38" viewBox="0 0 26 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 0C5.8 0 0 5.6 0 12.5 0 21.5 13 38 13 38s13-16.5 13-25.5C26 5.6 20.2 0 13 0z"
        fill="${color}" stroke="#ffffff" stroke-width="1.6"/>
      <circle cx="13" cy="12.5" r="4.6" fill="#ffffff"/>
    </svg>`,
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    popupAnchor: [0, -34],
  });
}

export default function MapaUbicacion({
  valor,
  onCambio,
  theme,
  alto = 260,
  enlace = '',
  onEnlaceCambio,
}) {
  const {
    borde = 'border-gray-300',
    texto = 'text-gray-600',
    tenue = 'text-gray-400',
    hoja = 'bg-white',
    pin = '#f59e0b',
  } = theme || {};

  const contenedor = useRef(null);
  const mapa = useRef(null);
  const marcador = useRef(null);
  // el callback se guarda aparte para que el efecto del mapa no
  // vuelva a armarse cada vez que el padre pasa una fn nueva.
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;

  const [buscando, setBuscando] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState([]);
  const [errorBusqueda, setErrorBusqueda] = useState('');

  // El mapa se arma una sola vez. cualquier cambio despues se
  // hace sobre la instancia viva, sin volver a crearla.
  useEffect(() => {
    const elemento = contenedor.current;
    if (!elemento || mapa.current) return;

    const mapaAnterior = mapasPorContenedor.get(elemento);
    if (mapaAnterior) {
      mapaAnterior.remove();
      mapasPorContenedor.delete(elemento);
    } else if (Reflect.get(elemento, '_leaflet_id')) {
      // Una actualización en caliente puede conservar el nodo DOM
      // después de perder la referencia al mapa anterior.
      Reflect.deleteProperty(elemento, '_leaflet_id');
      elemento.replaceChildren();
    }

    const centro = valor
      ? [valor.lat, valor.longitude ?? valor.lng]
      : [CENTRO.lat, CENTRO.lng];
    const m = L.map(elemento, {
      center: centro,
      zoom: valor ? ZOOM_INICIAL : 12,
      zoomControl: !valor,
      attributionControl: true,
    });

    L.tileLayer(FONDOS.claro.url, {
      maxZoom: 19,
      attribution: FONDOS.claro.attr,
    }).addTo(m);

    // sin esto el mapa se ve con margenes raros en pantallas
    //变动 de tamaño, tipico cuando se abre dentro de un modal.
    const ajustador = setTimeout(() => m.invalidateSize(), 120);

    if (valor) {
      marcador.current = L.marker(
        [valor.lat, valor.longitude ?? valor.lng],
        { icon: crearIcono(pin) }
      ).addTo(m);
    }

    // tocan el mapa para poner el pin. solo si es editable.
    if (onCambioRef.current) {
      m.on('click', (e) => {
        const punto = { lat: e.latlng.lat, longitude: e.latlng.lng };
        if (marcador.current) {
          marcador.current.setLatLng([punto.lat, punto.longitude]);
        } else {
          marcador.current = L.marker([punto.lat, punto.longitude], { icon: crearIcono(pin) }).addTo(m);
        }
        onCambioRef.current(punto);
      });
    }

    mapa.current = m;
    mapasPorContenedor.set(elemento, m);

    return () => {
      clearTimeout(ajustador);
      if (mapa.current === m) mapa.current = null;
      marcador.current = null;
      m.remove();
      if (mapasPorContenedor.get(elemento) === m) {
        mapasPorContenedor.delete(elemento);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // el pin sigue al valor que viene de afuera (por ejemplo, cuando
  // el gps lo setea solo).
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;

    if (valor) {
      if (marcador.current) {
        marcador.current.setLatLng([valor.lat, valor.longitude]);
      } else {
        marcador.current = L.marker([valor.lat, valor.longitude], { icon: crearIcono(pin) }).addTo(m);
      }
      m.setView([valor.lat, valor.longitude], Math.max(m.getZoom(), ZOOM_INICIAL));
    } else if (marcador.current) {
      marcador.current.remove();
      marcador.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor?.lat, valor?.longitude]);

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const punto = { lat: pos.coords.latitude, longitude: pos.coords.longitude };
        onCambioRef.current?.(punto);
        mapa.current?.setView([punto.lat, punto.longitude], ZOOM_INICIAL);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const buscarDireccion = async (valorBusqueda) => {
    const consultaLimpia = valorBusqueda.trim();
    if (!consultaLimpia) {
      setErrorBusqueda('Escribe una calle, zona o referencia para buscar.');
      return;
    }
    if (!mapa.current) {
      setErrorBusqueda('El mapa aún se está cargando. Intenta de nuevo.');
      return;
    }

    setBuscando(true);
    setErrorBusqueda('');
    setResultados([]);
    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        limit: '5',
        countrycodes: 'bo',
        'accept-language': 'es',
        q: `${consultaLimpia}, Bolivia`,
      });
      const url = `${BUSCADOR}?${params}`;
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`El buscador respondió ${r.status}.`);
      const datosResultados = await r.json();
      if (!Array.isArray(datosResultados)) throw new Error('La respuesta del buscador no es válida.');
      const encontrados = datosResultados.map((resultado) => ({
        id: resultado.place_id,
        nombre: resultado.display_name,
        lat: Number(resultado.lat),
        longitude: Number(resultado.lon),
      }));
      setResultados(encontrados);
      if (!encontrados.length) {
        setErrorBusqueda(`No encontramos "${consultaLimpia}" en Bolivia. Prueba con el nombre de la calle y la ciudad.`);
      }
    } catch (error) {
      setErrorBusqueda(error.message || 'No se pudo buscar. Revisa la conexión a internet.');
    } finally {
      setBuscando(false);
    }
  };

  const buscar = () => {
    buscarDireccion(consulta);
  };

  const elegirResultado = (punto) => {
    onCambioRef.current?.({ lat: punto.lat, longitude: punto.longitude });
    mapa.current?.setView([punto.lat, punto.longitude], ZOOM_INICIAL);
    setResultados([]);
    setConsulta('');
    setErrorBusqueda('');
  };

  const usarEnlace = async () => {
    const enlacePegado = enlace.trim();
    if (!enlacePegado) {
      setErrorBusqueda('Pega primero el enlace de Google Maps.');
      return;
    }
    setBuscando(true);
    setErrorBusqueda('');
    try {
      let ubicacion = leerUbicacionDeEnlace(enlacePegado);
      if (ubicacion?.coordenadas) {
        elegirResultado(ubicacion.coordenadas);
        return;
      }

      if (ubicacion?.busqueda) {
        setConsulta(ubicacion.busqueda);
        await buscarDireccion(ubicacion.busqueda);
        return;
      }

      const url = new URL(enlacePegado);
      if (!['https:', 'http:'].includes(url.protocol)) {
        throw new Error('Pega un enlace http o https de Google Maps.');
      }
      const urlResuelta = await enlaceMapaRepository.resolver(enlacePegado);
      ubicacion = leerUbicacionDeEnlace(urlResuelta);
      if (ubicacion?.coordenadas) {
        elegirResultado(ubicacion.coordenadas);
      } else if (ubicacion?.busqueda) {
        setConsulta(ubicacion.busqueda);
        await buscarDireccion(ubicacion.busqueda);
      } else {
        throw new Error('No se encontró una ubicación en ese enlace. Prueba con el enlace completo o busca la calle.');
      }
    } catch (error) {
      setErrorBusqueda(error.message || 'No se pudo leer el enlace de Maps.');
    } finally {
      setBuscando(false);
    }
  };

  const quitar = () => {
    onCambioRef.current?.(null);
    setConsulta('');
  };

  return (
    <div className={`rounded-2xl border overflow-hidden ${borde} ${hoja}`}>
      {/* barra de arriba: buscar, gps y borrar */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${borde}`}>
        {onCambio ? (
          <div className="flex-1 flex items-center gap-2">
            <Search size={14} className={tenue} />
            <input
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  buscar();
                }
              }}
              placeholder="Ej. Av. Simón López, Cochabamba"
              className={`flex-1 bg-transparent text-xs outline-none ${texto}`}
            />
            {buscando && <Loader2 size={13} className={`animate-spin ${tenue}`} />}
            <button
              type="button"
              onClick={buscar}
              disabled={buscando || !consulta.trim()}
              aria-label="Buscar dirección"
              className={`rounded-lg p-1.5 ${tenue} hover:opacity-70 disabled:opacity-50`}
            >
              <Search size={14} />
            </button>
          </div>
        ) : (
          <span className={`text-xs font-semibold ${tenue}`}>Donde se registro</span>
        )}

        {onCambio && (
          <>
            <button
              type="button"
              onClick={usarMiUbicacion}
              title="Usar la ubicacion de este celular"
              className={`p-1.5 rounded-lg hover:opacity-70 ${tenue}`}
            >
              <Navigation size={14} />
            </button>
            {valor && (
              <button
                type="button"
                onClick={quitar}
                title="Quitar la ubicacion"
                className="p-1.5 rounded-lg hover:opacity-70 text-red-500"
              >
                <Trash2 size={14} />
              </button>
            )}
          </>
        )}
      </div>

      {onCambio && (
        <div className="space-y-2 border-b px-3 py-2">
          <label className={`block text-[10px] font-semibold uppercase tracking-wide ${tenue}`}>
            Enlace de ubicación (opcional)
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={enlace}
              onChange={(e) => onEnlaceCambio?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  usarEnlace();
                }
              }}
              placeholder="Pega el enlace de Google Maps"
              className={`min-w-0 flex-1 bg-transparent text-xs outline-none ${texto}`}
              aria-label="Enlace de Google Maps"
            />
            <button
              type="button"
              onClick={usarEnlace}
              disabled={buscando || !enlace.trim()}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${tenue} hover:opacity-70 disabled:opacity-50`}
            >
              {buscando ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              Usar enlace
            </button>
          </div>
          {resultados.length > 0 && (
            <div className={`max-h-32 overflow-y-auto rounded-lg border ${borde}`}>
              {resultados.map((resultado) => (
                <button
                  key={resultado.id}
                  type="button"
                  onClick={() => elegirResultado(resultado)}
                  className={`flex w-full items-start gap-2 border-b px-2 py-2 text-left text-[11px] last:border-b-0 ${borde} ${texto} hover:bg-amber-500/10`}
                >
                  <MapPin size={13} className="mt-0.5 shrink-0 text-amber-500" />
                  <span>{resultado.nombre}</span>
                </button>
              ))}
            </div>
          )}
          {errorBusqueda && <p role="alert" className="text-[11px] text-red-500">{errorBusqueda}</p>}
          <p className={`text-[10px] ${tenue}`}>
            Busca una calle o pega un enlace y toca “Usar enlace” para colocar el pin.
          </p>
        </div>
      )}

      {/* el mapa */}
      <div ref={contenedor} style={{ height: alto }} className="w-full" />

      {/* estado */}
      <div className={`flex items-center gap-2 px-3 py-2 border-t ${borde}`}>
        <MapPin size={13} className={valor ? 'text-emerald-500' : tenue} />
        {valor ? (
          <span className={`text-[11px] font-semibold ${texto}`}>
            Marcado en {valor.lat.toFixed(5)}, {valor.longitude.toFixed(5)}
          </span>
        ) : (
          <span className={`text-[11px] ${tenue}`}>
            {onCambio ? 'Toca el mapa para marcar donde es' : 'Sin ubicacion'}
          </span>
        )}
      </div>
    </div>
  );
}