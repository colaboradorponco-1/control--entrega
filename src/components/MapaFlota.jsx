import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RefreshCw, Truck, MapPin } from 'lucide-react';
import { supabase } from '../config/supabaseClient';
import { fondosDeMapa } from '../utils/capasMapa';
import {
  aCoordenada,
  animarMarcador,
  minutosDesdeSegundos,
  segundosEnLineaRecta,
} from '../utils/rastreo';

const CENTRO = [-17.3895, -66.1568];
const TEMA_VACIO = {};
const PEDIDOS_VACIO = [];
const INTERVALO_MS = 20000;

const icono = (html, tamano) => L.divIcon({
  className: '',
  html,
  iconSize: [tamano, tamano],
  iconAnchor: [tamano / 2, tamano / 2],
});

const ICONO_REPARTIDOR = icono(
  '<div style="background:#0891b2;color:white;border:2px solid white;border-radius:9999px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px #0006"><span style="font-size:18px">🚚</span></div>',
  36
);
const ICONO_SUCURSAL = icono(
  '<div style="background:#7c3aed;color:white;border:2px solid white;border-radius:9999px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px #0006"><span style="font-size:15px">●</span></div>',
  30
);

const escapar = (texto) => String(texto ?? '').replace(/[&<>"']/g, (caracter) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[caracter]));

const hace = (fechaIso) => {
  if (!fechaIso) return null;
  const segundos = Math.max(0, Math.floor((Date.now() - new Date(fechaIso).getTime()) / 1000));
  if (segundos < 60) return `hace ${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  return `hace ${minutos} min`;
};

export default function MapaFlota({ pedidos = PEDIDOS_VACIO, theme = TEMA_VACIO, alto = 420 }) {
  const { borde = 'border-gray-200', texto = 'text-gray-700', oscuro = false } = theme;
  const contenedor = useRef(null);
  const mapa = useRef(null);
  const capa = useRef(null);
  const marcadores = useRef(new Map());
  const ajustado = useRef(false);
  const [seguimientos, setSeguimientos] = useState({});
  const [nombres, setNombres] = useState({});
  const [error, setError] = useState('');
  const [actualizando, setActualizando] = useState(false);

  const destinos = useMemo(() => {
    const mapaDestinos = new Map();
    for (const pedido of pedidos) {
      const destino = aCoordenada(pedido.sucursales?.latitude, pedido.sucursales?.longitude);
      mapaDestinos.set(pedido.id, {
        destino,
        sucursal: pedido.sucursales?.nombre || `Sucursal ${pedido.sucursal_id}`,
        unidades: pedido.unidades,
      });
    }
    return mapaDestinos;
  }, [pedidos]);

  const cargarSeguimientos = useCallback(async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setActualizando(true);
      const { data, error: consultaError } = await supabase
        .from('seguimiento_pedidos')
        .select('pedido_id, despachador_id, latitude, longitude, precision_m, ruta_nombre, actualizado_en');
      if (consultaError) throw consultaError;

      const filas = data || [];
      const porPedido = {};
      for (const fila of filas) porPedido[fila.pedido_id] = fila;
      setSeguimientos(porPedido);
      setError('');

      const ids = [...new Set(filas.map((fila) => fila.despachador_id).filter(Boolean))];
      if (ids.length) {
        const { data: perfiles, error: perfilesError } = await supabase
          .from('perfiles_usuario')
          .select('id, nombre_completo')
          .in('id', ids);
        if (perfilesError) throw perfilesError;
        const mapaNombres = {};
        for (const perfil of perfiles || []) mapaNombres[perfil.id] = perfil.nombre_completo;
        setNombres(mapaNombres);
      }
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los repartidores.');
    } finally {
      if (!silencioso) setActualizando(false);
    }
  }, []);

  useEffect(() => {
    cargarSeguimientos();

    const canal = supabase
      .channel('mapa-flota-seguimiento')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seguimiento_pedidos' },
        (cambio) => {
          setSeguimientos((actual) => {
            const siguiente = { ...actual };
            if (cambio.eventType === 'DELETE') {
              const viejo = cambio.old || {};
              if (viejo.pedido_id != null) delete siguiente[viejo.pedido_id];
            } else if (cambio.new?.pedido_id != null) {
              siguiente[cambio.new.pedido_id] = cambio.new;
            }
            return siguiente;
          });
        }
      )
      .subscribe();
    const intervalo = window.setInterval(() => cargarSeguimientos({ silencioso: true }), INTERVALO_MS);

    return () => {
      window.clearInterval(intervalo);
      supabase.removeChannel(canal);
    };
  }, [cargarSeguimientos]);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return undefined;

    const estadoMarcadores = marcadores.current;
    const instancia = L.map(contenedor.current, {
      center: CENTRO,
      zoom: 12,
      scrollWheelZoom: true,
    });
    for (const fondo of fondosDeMapa()) {
      L.tileLayer(fondo.url, { maxZoom: fondo.maxZoom, attribution: fondo.attr }).addTo(instancia);
    }
    capa.current = L.layerGroup().addTo(instancia);
    mapa.current = instancia;

    const ajustarTamano = window.setTimeout(() => instancia.invalidateSize(), 100);

    return () => {
      window.clearTimeout(ajustarTamano);
      for (const estado of estadoMarcadores.values()) {
        estado.cancelar?.();
      }
      estadoMarcadores.clear();
      capa.current = null;
      mapa.current = null;
      ajustado.current = false;
      instancia.remove();
    };
  }, []);

  useEffect(() => {
    const instancia = mapa.current;
    const grupo = capa.current;
    if (!instancia || !grupo) return;

    const activos = new Set();

    for (const pedido of pedidos) {
      const info = destinos.get(pedido.id);
      const seguimiento = seguimientos[pedido.id];
      const posicion = seguimiento
        ? aCoordenada(seguimiento.latitude, seguimiento.longitude)
        : null;
      if (!posicion && !info?.destino) continue;
      activos.add(pedido.id);

      let estado = marcadores.current.get(pedido.id);
      if (!estado) {
        estado = { marcador: null, sucursal: null, linea: null, cancelar: null };
        marcadores.current.set(pedido.id, estado);
      }

      if (info?.destino) {
        if (estado.sucursal) {
          estado.sucursal.setLatLng(info.destino);
        } else {
          estado.sucursal = L.marker(info.destino, { icon: ICONO_SUCURSAL }).addTo(grupo);
        }
        estado.sucursal.bindPopup(`<strong>${escapar(info.sucursal)}</strong><br/>Destino del pedido #${pedido.id}`);
      } else if (estado.sucursal) {
        grupo.removeLayer(estado.sucursal);
        estado.sucursal = null;
      }

      if (posicion) {
        if (estado.marcador) {
          const actual = estado.marcador.getLatLng();
          if (actual.lat !== posicion[0] || actual.lng !== posicion[1]) {
            estado.cancelar?.();
            estado.cancelar = animarMarcador(estado.marcador, posicion, 900);
          }
        } else {
          estado.marcador = L.marker(posicion, { icon: ICONO_REPARTIDOR }).addTo(grupo);
        }
        const nombre = nombres[seguimiento.despachador_id] || 'Repartidor';
        const minutos = minutosDesdeSegundos(segundosEnLineaRecta(posicion, info?.destino));
        const eta = minutos ? `Llega en ~${minutos} min` : 'Sin destino registrado';
        const fresco = hace(seguimiento.actualizado_en) || 'sin datos';
        estado.marcador.bindPopup(
          `<strong>${escapar(nombre)}</strong><br/>`
          + `Pedido #${pedido.id} · ${escapar(info?.sucursal || 'Sucursal')}<br/>`
          + `${seguimiento.ruta_nombre ? `Ruta: ${escapar(seguimiento.ruta_nombre)}<br/>` : ''}`
          + `${escapar(eta)} · GPS ${escapar(fresco)}`
        );
      } else if (estado.marcador) {
        estado.cancelar?.();
        estado.cancelar = null;
        grupo.removeLayer(estado.marcador);
        estado.marcador = null;
      }

      if (posicion && info?.destino) {
        const puntos = [posicion, info.destino];
        if (estado.linea) {
          estado.linea.setLatLngs(puntos);
        } else {
          estado.linea = L.polyline(puntos, {
            color: '#0891b2',
            weight: 3,
            opacity: 0.7,
            dashArray: '8 8',
          }).addTo(grupo);
        }
      } else if (estado.linea) {
        grupo.removeLayer(estado.linea);
        estado.linea = null;
      }
    }

    for (const [pedidoId, estado] of [...marcadores.current.entries()]) {
      if (activos.has(pedidoId)) continue;
      estado.cancelar?.();
      if (estado.marcador) grupo.removeLayer(estado.marcador);
      if (estado.sucursal) grupo.removeLayer(estado.sucursal);
      if (estado.linea) grupo.removeLayer(estado.linea);
      marcadores.current.delete(pedidoId);
    }

    if (!ajustado.current) {
      const puntos = [];
      for (const estado of marcadores.current.values()) {
        if (estado.marcador) puntos.push(estado.marcador.getLatLng());
        if (estado.sucursal) puntos.push(estado.sucursal.getLatLng());
      }
      if (puntos.length === 1) {
        instancia.setView(puntos[0], 14);
        ajustado.current = true;
      } else if (puntos.length > 1) {
        instancia.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 15 });
        ajustado.current = true;
      }
    }
  }, [seguimientos, pedidos, nombres, destinos]);

  const centrarTodo = () => {
    const instancia = mapa.current;
    if (!instancia) return;
    const puntos = [];
    for (const estado of marcadores.current.values()) {
      if (estado.marcador) puntos.push(estado.marcador.getLatLng());
      if (estado.sucursal) puntos.push(estado.sucursal.getLatLng());
    }
    if (puntos.length === 1) instancia.setView(puntos[0], 15);
    else if (puntos.length > 1) instancia.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 15 });
    instancia.invalidateSize();
  };

  const repartidores = Object.keys(seguimientos).length;

  return (
    <div className={`rounded-2xl border overflow-hidden ${borde}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-3 py-2.5">
        <div className={`flex flex-wrap items-center gap-3 text-xs font-semibold ${texto}`}>
          <span className="flex items-center gap-1.5">
            <Truck size={15} className="text-cyan-600" /> Repartidores en vivo: {repartidores}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={15} className="text-violet-500" /> Destinos: {destinos.size}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={centrarTodo}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-700 transition hover:bg-cyan-500/20"
          >
            Centrar todo
          </button>
          <button
            type="button"
            onClick={() => cargarSeguimientos()}
            disabled={actualizando}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
              oscuro
                ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <RefreshCw size={13} className={actualizando ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>
      <div ref={contenedor} style={{ height: alto }} className="w-full" aria-label="Mapa de la flota de repartidores" />
      {error && (
        <p className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{error}</p>
      )}
      <p className="border-t border-black/5 px-3 py-1.5 text-[10px] opacity-60">
        Rastreo en vivo sobre OpenStreetMap. La línea punteada estima el trayecto en línea recta.
      </p>
    </div>
  );
}
