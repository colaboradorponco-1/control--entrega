// Fondos de mapa centralizados.
//
// Se usa OpenStreetMap (calles a color), que es abierto y no pide
// clave. Era el fondo original y funciona en modo claro y oscuro.
//
// OJO: antes el modo oscuro usaba CARTO (dark_all). CARTO dejo de
// servir sus tiles sin API key el 25-sep-2026 y dibujaba la marca
// "API KEY REQUIRED" encima del mapa, por eso se quito. Si algun dia
// se quiere un fondo oscuro, se puede pedir la clave gratis de CARTO
// y usar .../dark_all/{z}/{x}/{y}.png?key=LA_CLAVE

const OSM = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  maxZoom: 19,
};

// Devuelve los fondos a montar, en orden (el primero es el de abajo).
export function fondosDeMapa() {
  return [OSM];
}
