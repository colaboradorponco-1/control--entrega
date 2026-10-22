import { useEffect, useMemo, useState } from 'react';
import { createAvatar } from '@dicebear/core';
import {
  adventurer, avataaars, bigSmile, bottts, croodles, funEmoji, identicon,
  initials, lorelei, micah, miniavs, notionists, openPeeps, personas, pixelArt, thumbs,
} from '@dicebear/collection';
import { authRepository } from '../repositories/AuthRepository';

// Los estilos de avatar. La clave es lo que se guarda en la base
// (avatar_estilo), asi que no se cambian de nombre.
export const ESTILOS_AVATAR = [
  { clave: 'funEmoji', label: 'Caritas', estilo: funEmoji },
  { clave: 'lorelei', label: 'Lorelei', estilo: lorelei },
  { clave: 'adventurer', label: 'Aventurero', estilo: adventurer },
  { clave: 'avataaars', label: 'Avatares', estilo: avataaars },
  { clave: 'bigSmile', label: 'Sonrisa', estilo: bigSmile },
  { clave: 'bottts', label: 'Robots', estilo: bottts },
  { clave: 'croodles', label: 'Croodles', estilo: croodles },
  { clave: 'micah', label: 'Micah', estilo: micah },
  { clave: 'personas', label: 'Personas', estilo: personas },
  { clave: 'notionists', label: 'Notion', estilo: notionists },
  { clave: 'openPeeps', label: 'Peeps', estilo: openPeeps },
  { clave: 'thumbs', label: 'Pulgares', estilo: thumbs },
  { clave: 'pixelArt', label: 'Pixel', estilo: pixelArt },
  { clave: 'miniavs', label: 'Miniavatar', estilo: miniavs },
  { clave: 'identicon', label: 'Identicon', estilo: identicon },
  { clave: 'initials', label: 'Iniciales', estilo: initials },
];

export const estiloPorClave = (clave) => (
  ESTILOS_AVATAR.find((opcion) => opcion.clave === clave)?.estilo || funEmoji
);

// El avatar se dibuja en el navegador: no pide nada a internet.
export const svgAvatar = (estilo, semilla, size = 128) => createAvatar(
  estiloPorClave(estilo),
  {
    seed: semilla || 'usuario',
    size,
    backgroundColor: ['b6e3f4', 'c0aede', 'ffd5dc', 'ffdfbf', 'd1d4f9', 'c1f4d0'],
  }
).toString();

export const urlAvatarSvg = (estilo, semilla, size = 128) => (
  `data:image/svg+xml;utf8,${encodeURIComponent(svgAvatar(estilo, semilla, size))}`
);

// Componente con el avatar del usuario: la foto si subio una, y si
// no, el avatar generado.
export default function AvatarUsuario({ perfil, size = 40, className = '' }) {
  const [fotoUrl, setFotoUrl] = useState(null);
  const rutaFoto = perfil?.foto_url;

  useEffect(() => {
    let activa = true;

    if (!rutaFoto) {
      setFotoUrl(null);
      return undefined;
    }

    authRepository
      .urlAvatar(rutaFoto)
      .then((url) => { if (activa) setFotoUrl(url); })
      .catch(() => { if (activa) setFotoUrl(null); });

    return () => { activa = false; };
  }, [rutaFoto]);

  const generado = useMemo(
    () => urlAvatarSvg(perfil?.avatar_estilo, perfil?.avatar_semilla || perfil?.nombre_completo),
    [perfil?.avatar_estilo, perfil?.avatar_semilla, perfil?.nombre_completo]
  );

  const estilos = {
    width: size,
    height: size,
  };

  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={perfil?.nombre_completo || 'Avatar'}
        style={estilos}
        className={`shrink-0 rounded-2xl border border-slate-200 object-cover ${className}`}
      />
    );
  }

  return (
    <img
      src={generado}
      alt={perfil?.nombre_completo || 'Avatar'}
      style={estilos}
      className={`shrink-0 rounded-2xl border border-slate-200 object-cover ${className}`}
    />
  );
}
