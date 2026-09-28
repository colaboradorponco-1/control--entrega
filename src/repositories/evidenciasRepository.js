import { supabase } from '../config/supabaseClient';

/**
 * foto, firma y comprobante van al mismo lugar.
 * los tres formularios los usan, asi que vive en un solo lado.
 */
const BUCKET = 'evidencias';

// la firma viene del canvas como dataURL y hay que volverla archivo
function dataUrlABlob(dataUrl) {
  const partes = dataUrl.split(',');
  const binario = atob(partes[1]);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

export const evidenciasRepository = {
  dataUrlABlob,

  /**
   * sube un archivo y devuelve la ruta, que es lo que se guarda
   * en la base. el nombre lleva un sello para que dos fotos del
   * mismo lote no se pisen entre si.
   */
  async subir(archivo, tipo, referencia) {
    if (!archivo) return null;

    const sello = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // las fotos llegan en jpeg y las firmas en png, se respeta cada una
    const esPng = (archivo.type || 'image/png') === 'image/png';
    const ruta = `${referencia}/${tipo}-${sello}.${esPng ? 'png' : 'jpg'}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, archivo, { contentType: archivo.type || 'image/png', upsert: false });

    if (error) throw error;
    return ruta;
  },

  /** sube varias de una vez, y falla entero si alguna no se puede */
  async subirVarias(archivos) {
    const resultado = {};
    for (const [clave, archivo] of Object.entries(archivos)) {
      if (!archivo) continue;
      const { tipo, referencia } = archivo;
      resultado[clave] = await this.subir(archivo.archivo, tipo, referencia);
    }
    return resultado;
  },

  /**
   * sube la lista de fotos de apoyo de las observaciones.
   * devuelve las rutas ya guardadas, en el mismo orden.
   */
  async subirFotosExtra(fotos, referencia) {
    const rutas = [];
    for (const foto of fotos || []) {
      if (!foto) continue;
      rutas.push(await this.subir(foto, 'extra', referencia));
    }
    return rutas;
  },

  /** los archivos son privados: la base devuelve un enlace que expira */
  async url(ruta) {
    if (!ruta) return null;
    const { data, error } = await supabase.rpc('url_evidencia', { p_ruta: ruta });
    if (error) throw error;
    return data;
  },
};
