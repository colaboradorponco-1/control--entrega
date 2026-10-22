const PAR_COORDENADAS = /(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)/;

function leerCoordenadas(texto) {
  const match = texto.match(PAR_COORDENADAS);
  if (!match) return null;

  const lat = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(longitude) > 180) return null;
  return { lat, longitude };
}

export function leerUbicacionDeEnlace(valor) {
  const texto = valor.trim();
  if (!texto) return null;

  const coordenadas = leerCoordenadas(texto);
  if (coordenadas) return { coordenadas, busqueda: '' };

  let url;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }

  const todaLaUrl = url.href.replace(/\+/g, ' ');
  const patrones = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /(?:^|[?&])(?:q|query|ll|center|destination|daddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i,
  ];

  for (const patron of patrones) {
    const match = todaLaUrl.match(patron);
    if (!match) continue;
    const punto = leerCoordenadas(`${match[1]},${match[2]}`);
    if (punto) return { coordenadas: punto, busqueda: '' };
  }

  for (const clave of ['q', 'query', 'll', 'center', 'destination', 'daddr']) {
    const valorParametro = url.searchParams.get(clave);
    if (!valorParametro) continue;
    const punto = leerCoordenadas(valorParametro);
    if (punto) return { coordenadas: punto, busqueda: '' };
  }

  const latitudOSM = url.searchParams.get('mlat') || url.searchParams.get('lat');
  const longitudOSM = url.searchParams.get('mlon') || url.searchParams.get('lon');
  if (latitudOSM && longitudOSM) {
    const punto = leerCoordenadas(`${latitudOSM},${longitudOSM}`);
    if (punto) return { coordenadas: punto, busqueda: '' };
  }

  const consulta = url.searchParams.get('q')
    || url.searchParams.get('query')
    || url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/i)?.[1];

  if (consulta) {
    try {
      return { coordenadas: null, busqueda: decodeURIComponent(consulta.replace(/\+/g, ' ')) };
    } catch {
      return { coordenadas: null, busqueda: consulta };
    }
  }

  return { coordenadas: null, busqueda: '' };
}
