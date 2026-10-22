import PedidosOperacion from '../../components/PedidosOperacion';
import { PackageCheck, Flame } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const ACCIONES_PLANTA = [
  {
    estado: 'APROBADO',
    texto: 'Iniciar preparación',
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
];

export default function PedidosPlanta() {
  const { perfil } = useAuth();
  // Solo la planta mueve estos estados. El admin entra a mirar: si
  // viera los botones, la base se los rechazaria igual.
  const esOperadorPlanta = perfil?.roles?.nombre === 'operador_planta';

  return (
    <PedidosOperacion
      titulo="Pedidos de Sucursales"
      subtitulo="Pedidos que la planta debe preparar"
      color="bg-blue-500/15 border-blue-500/25 text-blue-500"
      acciones={esOperadorPlanta ? ACCIONES_PLANTA : []}
    />
  );
}
