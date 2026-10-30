import { useEffect, useState } from 'react';
import { AlertCircle, Map as Mapa, MapPin, Route } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { rutasRepository } from '../../repositories/rutasRepository';
import PedidosOperacion from '../../components/PedidosOperacion';
import MapaRuta from '../../components/MapaRuta';
import { Truck } from 'lucide-react';

export default function PedidosDespachador() {
  const { perfil } = useAuth();
  const [rutas, setRutas] = useState([]);
  const [errorRutas, setErrorRutas] = useState(null);
  const [posicionActual, setPosicionActual] = useState(null);
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const perfilId = perfil?.id;
  // Solo el despachador recoge pedidos. El admin entra a mirar.
  const esDespachador = perfil?.roles?.nombre === 'despachador';

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosicionActual([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!perfilId) return undefined;

    let vigente = true;
    rutasRepository.listarAsignadasA(perfilId)
      .then((datos) => {
        if (vigente) setRutas(datos);
      })
      .catch((error) => {
        if (vigente) setErrorRutas(error.message || 'No se pudieron cargar las rutas asignadas');
      });

    return () => {
      vigente = false;
    };
  }, [perfilId]);

  return (
    <>
      {(rutas.length > 0 || errorRutas) && (
        <section className="border-b border-cyan-500/20 bg-slate-950 px-4 py-4 text-slate-100 md:px-8">
          <div className="mx-auto max-w-7xl">
            {errorRutas ? (
              <p className="flex items-center gap-2 text-sm text-amber-300">
                <AlertCircle size={16} /> No se pudieron cargar las rutas asignadas: {errorRutas}
              </p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {rutas.map((ruta) => (
                  <div key={ruta.id} className="min-w-64 flex-1 rounded-xl border border-cyan-500/20 bg-slate-900 p-4">
                    <h2 className="flex items-center gap-2 font-bold text-cyan-300">
                      <Route size={17} /> Tu ruta: {ruta.nombre}
                    </h2>
                    {ruta.sucursales.length > 0 ? (
                      <ol className="mt-3 flex flex-wrap gap-2">
                        {ruta.sucursales.map((sucursal, index) => (
                          <li key={sucursal.id} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs">
                            <span className="font-bold text-cyan-300">{index + 1}.</span>
                            <MapPin size={13} className="text-cyan-400" />
                            {sucursal.nombre}
                          </li>
                        ))}
                      </ol>
                    ) : (
                    <p className="mt-2 text-xs text-slate-400">Todavía no tiene sucursales asignadas.</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {rutas.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setMostrarMapa((visible) => !visible)}
                aria-expanded={mostrarMapa}
                className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
              >
                <Mapa size={16} /> {mostrarMapa ? 'Ocultar mapa' : 'Ver ruta en el mapa'}
              </button>

              {mostrarMapa && (
                <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {rutas.map((ruta) => (
                    <div key={ruta.id} className="rounded-xl border border-cyan-500/20 bg-slate-900/80 p-4">
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-200">
                        <MapPin size={16} /> Mapa de {ruta.nombre}
                      </h3>
                      <MapaRuta paradas={ruta.sucursales} alto={280} posicionActual={posicionActual} />
                      {ruta.sucursales?.length === 0 && (
                        <p className="mt-2 text-xs text-slate-400">Esta ruta no tiene paradas con coordenadas guardadas.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </section>
      )}
      <PedidosOperacion
        titulo="Pedidos para Recoger"
        subtitulo="Pedidos listos espera llevar a su sucursal"
        color="bg-cyan-500/15 border-cyan-500/25 text-cyan-500"
        acciones={esDespachador ? [
          {
            estado: 'LISTO',
            texto: 'Recogí el pedido',
            siguiente: 'RECOGIDO',
            icono: Truck,
            clase: 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/20',
          },
        ] : []}
      />
    </>
  );
}
