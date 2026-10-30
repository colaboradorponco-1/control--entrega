import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { AlertCircle, Loader2, MapPin, MapPinOff } from 'lucide-react';
import { fondosDeMapa } from '../utils/capasMapa';

/**
 * mapa general para el administrador: muestra todos los puntos que
 * marcaron los formularios, sin que se pueda tocar.
 *
 * recibe los puntos ya armados:
 *   { id, tipo, lat, lng, fecha, titulo, detalle }
 *
 * tipo: 'recepcion' (ambar), 'despacho' (celeste), 'entrega' (verde).
 *
 * con muchos registros, un pin por registro se vuelve un lio: se
 * tapan entre si y no se ve nada. por eso los puntos se agrupan en
 * circulos con el numero de cuantos hay adentro. recien cuando se
 * hace zoom aparecen sueltos.
 *
 * los mapas son de OpenStreetMap, que no pide clave ni tarjeta.
 */

// si no hay puntos marcados todavia, el mapa abre acá. cochabamba,
// Bolivia. se cambia en una sola linea.
const CENTRO = { lat: -17.3895, lng: -66.1568 };

const COLOR = {
  recepcion: '#f59e0b',
  despacho: '#06b6d4',
  entrega: '#10b981',
};

const TEMA_VACIO = {};
const PUNTOS_VACIO = [];

// cada grupo lleva un circulo con el numero. el color se apaga
// un poco mas a medida que grows el grupo, para que se note el
// cambio sin tener que leer el numero.
function colorDeGrupo(base, cantidad) {
  const tono = {
    recepcion: ['#fde68a', '#f59e0b', '#b45309'],
    despacho: ['#a5f3fc', '#06b6d4', '#0e7490'],
    entrega: ['#a7f3d0', '#10b981', '#047857'],
  }[base] || ['#e2e8f0', '#64748b', '#334155'];
  return cantidad < 10 ? tono[1] : tono[2];
}

// los nombres vienen de la base y se meten dentro del popup, que es
// html. sin esto, un nombre con "<" romperia la vista.
function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export default function MapaGeneral({ puntos = PUNTOS_VACIO, theme = TEMA_VACIO, alto = 360, cargando = false, error = '' }) {
  const {
    borde = 'border-gray-300',
    texto = 'text-gray-600',
    tenue = 'text-gray-400',
    hoja = 'bg-white',
  } = theme;

  const contenedor = useRef(null);
  const mapa = useRef(null);
  const grupos = useRef(null);
  const teselas = useRef(null);
  const claves = useRef('');
  const [errorTeselas, setErrorTeselas] = useState('');
  const [filtros, setFiltros] = useState({ recepcion: true, despacho: true, entrega: true });

  // Solo se dibujan los tipos que estan encendidos en la leyenda.
  const visibles = useMemo(
    () => puntos.filter((punto) => filtros[punto.tipo] !== false),
    [puntos, filtros]
  );

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    const m = L.map(contenedor.current, {
      center: [CENTRO.lat, CENTRO.lng],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    });

    const capas = fondosDeMapa();
    let teselasLayer = null;
    capas.forEach((fondo, indice) => {
      const capa = L.tileLayer(fondo.url, { maxZoom: fondo.maxZoom, attribution: fondo.attr });
      if (indice === 0) {
        capa.on('tileerror', () => setErrorTeselas('No se pudieron cargar las imágenes del mapa. Revisa la conexión a internet.'));
        teselasLayer = capa;
      }
      capa.addTo(m);
    });
    teselas.current = teselasLayer;

    grupos.current = L.markerClusterGroup({
      // menos radio = se agrupan menos puntos. con 55 se junta
      // rapido, que es lo que se ve prolijo.
      maxClusterRadius: 50,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 17,

      // el grupo usa el color del punto que tiene adentro
      iconCreateFunction: (grupo) => {
        const hijos = grupo.getAllChildMarkers();
        const total = grupo.getChildCount();
        const base = hijos[0]?.options?.tipoBase || 'recepcion';
        return L.divIcon({
          className: '',
          html: `<div style="
            width:34px;height:34px;border-radius:50%;
            background:${colorDeGrupo(base, total)};
            border:2.5px solid rgba(255,255,255,.9);
            box-shadow:0 2px 6px rgba(0,0,0,.35);
            display:flex;align-items:center;justify-content:center;
            color:#fff;font-weight:800;font-size:12px;
            font-family:system-ui,sans-serif;">${grupo.getChildCount()}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
      },
    });

    m.addLayer(grupos.current);
    mapa.current = m;

    return () => {
      mapa.current = null;
      grupos.current = null;
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapa.current;
    const g = grupos.current;
    if (!m || !g) return;

    const ubicados = visibles.filter((p) => (
      typeof p.lat === 'number'
      && typeof p.lng === 'number'
      && Number.isFinite(p.lat)
      && Number.isFinite(p.lng)
      && p.lat >= -90
      && p.lat <= 90
      && p.lng >= -180
      && p.lng <= 180
      && (p.lat !== 0 || p.lng !== 0)
    ));
    const firma = ubicados.map((p) => `${p.tipo}-${p.id}-${p.lat}-${p.lng}`).join('|');
    if (firma === claves.current) return;
    claves.current = firma;

    g.clearLayers();

    const limites = [];

    ubicados.forEach((p) => {
      limites.push([p.lat, p.lng]);

      // punto chiquito, no un pin grande:molesta menos cuando hay
      // muchos y de lejos se ven igual.
      const marca = L.circleMarker([p.lat, p.lng], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: COLOR[p.tipo] || '#64748b',
        fillOpacity: 0.95,
      });

      // se guarda el tipo para que el grupo sepa de que color es
      marca.options.tipoBase = p.tipo;

      marca.bindPopup(
        `<div style="min-width:155px">
          <div style="font-weight:700;font-size:12.5px;margin-bottom:2px">${escapar(p.titulo)}</div>
          ${p.fecha ? `<div style="font-size:11px;opacity:.7">${escapar(p.fecha)}</div>` : ''}
          ${p.detalle ? `<div style="font-size:11px;margin-top:4px">${escapar(p.detalle)}</div>` : ''}
          ${p.usuario ? `<div style="font-size:11px;opacity:.85;margin-top:4px">Registró: ${escapar(p.usuario)}</div>` : ''}
        </div>`,
        { closeButton: false, offset: [0, -6] }
      );

      g.addLayer(marca);
    });

    if (limites.length === 1) {
      m.setView(limites[0], 15);
    } else if (limites.length > 1) {
      m.fitBounds(limites, { padding: [40, 40], maxZoom: 16 });
    }
  }, [visibles]);

  return (
    <div className={`rounded-2xl border overflow-hidden ${borde} ${hoja}`}>
      <div ref={contenedor} style={{ height: alto }} className="w-full" />

      <div className={`flex items-center justify-between gap-3 px-3 py-2.5 border-t ${borde} flex-wrap`}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            ['recepcion', 'Recepciones'],
            ['despacho', 'Despachos'],
            ['entrega', 'Entregas'],
          ].map(([tipo, nombre]) => {
            const activo = filtros[tipo] !== false;
            const cantidad = puntos.filter((punto) => punto.tipo === tipo).length;
            return (
              <button
                key={tipo}
                type="button"
                onClick={() => setFiltros((actual) => ({ ...actual, [tipo]: !activo }))}
                aria-pressed={activo}
                title={activo ? `Ocultar ${nombre.toLowerCase()}` : `Mostrar ${nombre.toLowerCase()}`}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  activo ? 'border-transparent' : `${borde} opacity-60`
                }`}
              >
                <i
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ background: COLOR[tipo], opacity: activo ? 1 : 0.3 }}
                />
                <span className={texto}>{nombre}</span>
                <span className={`tabular-nums ${tenue}`}>{cantidad}</span>
              </button>
            );
          })}
        </div>

        <span className={`flex items-center gap-1.5 text-[11px] ${tenue}`}>
          {puntos.length ? (
            <>
              <MapPin size={13} />
              {puntos.length} {puntos.length === 1 ? 'punto' : 'puntos'}
            </>
          ) : (
            <>
              <MapPinOff size={13} />
              Todavia no hay puntos marcados
            </>
          )}
        </span>
      </div>
      {errorTeselas && (
        <p role="status" className="flex items-center gap-2 border-t border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle size={14} /> {errorTeselas}
        </p>
      )}
      {!errorTeselas && error && (
        <p role="status" className="flex items-center gap-2 border-t border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle size={14} /> No se pudieron cargar los puntos. Revisa el mensaje que aparece arriba.
        </p>
      )}
      {!errorTeselas && !error && cargando && (
        <p role="status" className="flex items-center gap-2 border-t border-gray-500/20 px-3 py-2 text-xs">
          <Loader2 size={14} className="animate-spin" /> Cargando ubicaciones...
        </p>
      )}
      {!errorTeselas && !error && !cargando && puntos.length === 0 && (
        <p className={`border-t border-gray-500/20 px-3 py-2 text-xs ${tenue}`}>
          Los formularios deben guardar las coordenadas para que aparezcan puntos en este mapa.
        </p>
      )}
    </div>
  );
}