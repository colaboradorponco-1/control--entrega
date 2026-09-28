import PedidosOperacion from '../../components/PedidosOperacion';
import { Truck, MapPin } from 'lucide-react';

export default function PedidosDespachador() {
  return (
    <PedidosOperacion
      titulo="Pedidos para Recoger"
      subtitulo="Pedidos listos espera llevar a su sucursal"
      color="bg-cyan-500/15 border-cyan-500/25 text-cyan-500"
      acciones={[
        {
          estado: 'LISTO',
          texto: 'Recogí el pedido',
          siguiente: 'RECOGIDO',
          icono: Truck,
          clase: 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/20',
        },
      ]}
    />
  );
}
