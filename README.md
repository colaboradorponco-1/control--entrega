# Sistema de Control de Pollo

Aplicación React + Vite + Supabase para gestionar pedidos de pollo, despacho, recepción, inventario y operación por sucursal.

## Desarrollo

1. Instala dependencias con `npm install`.
2. Copia `.env.example` como `.env` y configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Ejecuta `npm run dev`.

Comprobaciones disponibles:

- `npm run lint`
- `npm run build`

## Flujos de sucursal y dueño

- El dueño crea pedidos y elige una de sus sucursales asignadas.
- El dueño define una meta mensual de pollo en unidades para cada sucursal. El avance suma las unidades realmente recibidas durante el mes elegido.
- La sucursal puede crear pedidos de emergencia y confirmar la recepción con evidencia.
- La sucursal lleva una planilla diaria de pollo crudo. El saldo inicial se toma del último cierre, las recepciones confirmadas se agregan automáticamente y el cierre registra el ajuste del conteo físico. El pollo rostizado se gestiona por su flujo separado de rosticero.
- El despacho descuenta unidades del inventario de planta; al confirmar la recepción, las unidades recibidas se agregan al inventario de la sucursal.

## Cambios de base de datos

Los archivos SQL de `supabase/` se ejecutan manualmente en el SQL Editor de Supabase; la aplicación no los aplica automáticamente.

Para habilitar los cambios de metas e inventario, sobre una base que ya tenga instalados los flujos de pedidos e inventario de planta:

1. Reejecuta `supabase/EMERGENCIA_INVENTARIO.sql` para actualizar el permiso de pedidos de emergencia.
2. Ejecuta `supabase/METAS_SUCURSAL.sql` para crear o actualizar las metas mensuales.
3. Asegúrate de tener aplicados `supabase/PLANILLAS_AUTOMATICAS_MANUALES.sql`, `supabase/INVENTARIO_PREPARACION_PEDIDOS.sql` y `supabase/DISPONIBILIDAD_PLANTA_DUENO.sql`.
4. Ejecuta `supabase/INVENTARIO_DIARIO_SUCURSALES.sql` después de esas migraciones para activar las planillas diarias de pollo crudo, ingresos manuales auditables, recepción automática y ajustes de cierre.
5. Ejecuta `supabase/INVENTARIO_GUARDAR_BORRADOR.sql` para que la sucursal pueda guardar una planilla con el conteo todavía vacío, sin ajustar el stock.
6. Como último paso, ejecuta `supabase/VALIDAR_DESPACHO_PEDIDO.sql`, después de los SQL que crean o actualizan el despacho. Valida que un despacho vinculado a un pedido no exceda las unidades solicitadas y que no se registre un segundo despacho cuando el pedido ya salió.

Si el inventario diario ya está instalado, para habilitar el guardado de borradores ejecuta únicamente `supabase/INVENTARIO_GUARDAR_BORRADOR.sql` una vez; no hace falta volver a ejecutar la migración completa del inventario.

La sucursal inicia una planilla por día con hora de corte. En la columna **Ingreso manual** se muestran las recepciones confirmadas por el sistema y se puede anotar un ingreso externo; ambos se reflejan en el disponible. La observación del ingreso manual es opcional; si se escribe, se guarda. **Guardar conteo** conserva el conteo físico y los ingresos, pero no cierra el día ni cambia el saldo. La X guarda el borrador —incluidos ingresos manuales y observaciones, aunque el conteo siga vacío— y vuelve a la lista de inventarios diarios; no navega a pedidos ni ajusta el stock. Desde la lista, **Abrir** recupera únicamente los datos de esa fecha para continuar editando la misma planilla. **Cerrar día y ajustar stock** es una acción separada: bloquea la planilla y aplica el conteo físico como saldo, dejando auditada la diferencia. La X junto al campo manual limpia el valor aún no guardado. **Borrar planilla** permite reiniciar únicamente la planilla abierta de hoy: conserva las recepciones automáticas y marca los ingresos manuales como anulados para mantener su auditoría; no permite borrar cierres ni registros anteriores. El historial ofrece filtros por fecha, texto y estado. Las diferencias del historial son cantidades en unidades; no se muestra un monto monetario porque estos registros no tienen un precio asociado. El saldo inicial parte del último cierre. El pollo rostizado se mantiene en el reporte del rol rosticero y no se suma al inventario de pollo crudo.

Administración, superadministración y el dueño pueden consultar los inventarios diarios desde **Inventarios diarios**. La sucursal tiene un acceso **Inventario general** en el panel de pedidos, de solo lectura y limitado por RLS a su sucursal. El dueño solo ve las sucursales que tiene asignadas. Administración, superadministración y dueño pueden archivar o restaurar registros; archivar organiza la lista, pero no altera cantidades ni stock. Para habilitar el inventario general, los campos de archivo y su permiso seguro, vuelve a ejecutar `supabase/INVENTARIO_DIARIO_SUCURSALES.sql` en Supabase SQL Editor, sin correr otras migraciones en paralelo.

El dueño consulta el inventario general de sus sucursales en el panel de inventario. Revisa y prueba los cambios en Supabase antes de usarlos en producción.
