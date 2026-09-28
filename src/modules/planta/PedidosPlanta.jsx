import PedidosOperacion from '../../components/PedidosOperacion';
import { PackageCheck, Flame } from 'lucide-react';

export default function PedidosPlanta() {
  return (
    <PedidosOperacion
      titulo="Pedidos de Sucursales"
      subtitulo="Pedidos que la planta debe preparar"
      color="bg-blue-500/15 border-blue-500/25 text-blue-500"
      acciones={[
        {
          estado: 'PENDIENTE',
          texto: 'Tomar pedido',
          siguiente: 'EN_PREPARACION',
          icono: Flame,
          clase: 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20',
        },
        {
          estado: 'EN_PREPARACION',
          texto: 'Marcar como listo',
          siguiente: 'LISTO',
          icono: PackageCheck,
          clase: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20',
        },
      ]}
    />
  );
}
