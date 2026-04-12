# Patanegra POS (requisitos)

## Objetivo
POS por mesas con:
- **2 meseros en celular/tablet** para levantar órdenes.
- **Caja/Cajera** en pantalla/tablet para cobros, supervisión, reportes y corte.
- **Impresión en cocina** para comida.
- **Impresión en barra** para bebidas.
- **Almacén** para inventario fino (insumos con recetas).
- **15 mesas**.
- Todo el sistema opera en el **mismo WiFi** del local.

## Roles y permisos

### Mesero
- **Puede atender cualquier mesa**.
- **Debe especificar mesa** al levantar la orden.
- **Acciones**
  - Abrir mesa.
  - Agregar/quitar productos (con bitácora).
  - Enviar comanda.
  - Solicitar cierre/cuenta.
  - Capturar método de pago al pedir la cuenta.
- **Restricciones**
  - No ve reportes.
  - No edita menú/precios.
  - No hace corte.
  - No puede marcar órdenes como **pagadas/cerradas**.

### Caja
- Ve **todas las mesas** y sus estados.
- Responsable de **efectivo y terminal** (salón) y **transferencias** (domicilio).
- **Cierra y cobra** las cuentas.
- Solo caja puede marcar una orden como **pagada** y **cerrada**.
- Hace **corte** y consulta reportes.
- Supervisa a los meseros.
- Permisos para cancelaciones/devoluciones (definir si requiere admin).

### Almacén
- Responsable de:
  - Compras (entradas a inventario).
  - Salidas (ajustes/mermas/consumos si aplica).
  - Conteos cíclicos.
- Mantiene **inventario fino** (unidades, recetas, mínimos).

## Flujo de mesas
- **Mesa abierta**
  - El mesero captura productos.
- **Comanda enviada**
  - Se imprime en:
    - Cocina: comida.
    - Barra: bebidas.
- **Cuenta solicitada**
  - El mesero solicita el cierre desde su dispositivo y **selecciona método de pago** (solo efectivo/terminal).
  - La mesa pasa a estado **por cobrar**.
- **Cobro y cierre**
  - Caja confirma que se recibió el pago y **cierra la mesa**.
  - Si es **terminal**: caja entrega la terminal al mesero para cobrar en la mesa (o donde sea necesario).
  - Si es **efectivo**: caja registra el pago (aunque el mesero haya recibido el efectivo).
  - Caja ejecuta el **corte**.

## Cobros
- **Métodos de pago**
  - Efectivo
  - Terminal
- **Regla (mesas)**: en mesas solo se permite **efectivo** y **terminal**.
- **Propina (solo tarjeta/terminal)**
  - Opciones: **5%**, **10%**, **15%**, **20%**, **otro monto**.

## Pizzas 1/2 y 1/2
- El sistema debe permitir **mitad y mitad** en pizzas.
- **Regla de precio**: el total es la **suma de mitades**.
  - Ejemplo: 1/2 Pepperoni + 1/2 Tocino = (Precio Pepperoni / 2) + (Precio Tocino / 2)
- La comanda debe imprimir claramente:
  - Pizza base
  - Mitad A
  - Mitad B

## Para Llevar / Domicilio (órdenes por teléfono)
- El sistema debe permitir crear órdenes **sin mesa**.
- Tipos:
  - **Para llevar**: el cliente pasa por la orden.
  - **Domicilio**: se asigna a un repartidor.
- Las órdenes de **domicilio** deben mostrarse en un **carril/columna separado** en el tablero (no como mesa física).
- Captura mínima por orden:
  - Nombre
  - Teléfono
  - Tipo (para llevar / domicilio)
  - Dirección (si es domicilio)
  - Referencias
  - Costo de envío (si es domicilio)
- Flujo sugerido:
  - Crear orden (para llevar/domicilio)
  - Agregar productos
  - Enviar a cocina/barra (impresión por área)
  - Si es domicilio:
    - Botón: **Enviar a repartidor**
    - Enviar detalles al **WhatsApp del dueño** (por ahora el dueño despacha al motociclista disponible)
    - Marcar estado: **En reparto**

### Domicilio: pagos y envío
- **Métodos de pago (domicilio)**
  - Efectivo
  - Transferencia
- **Cuenta para transferencias**
  - Se transfiere a la **cuenta del pizzero**.
  - Debe existir un campo de **configuración** para guardar los datos de transferencia (texto libre).
- **Quién cobra**
  - Usualmente el repartidor cobra, pero debe soportar modo **mixto**.
- **Costo de envío**
  - Base: **$30.00**
  - Variable por distancia (ajustable por orden)

### WhatsApp: mensaje de despacho (Enviar a repartidor)
- Destino: siempre al **mismo número** (WhatsApp del dueño). Por ahora: **9932171855**.
 
 Al presionar **Enviar a repartidor**, se genera un mensaje con:
 - Folio
 - Nombre + Tel
 - Dirección + referencias
 - Total
 - Método de pago (efectivo/transfer)
 - Costo de envío (base + ajuste)
 - Hora estimada / notas

Plantilla sugerida:
 
```
PEDIDO DOMICILIO
Folio: {folio}
Cliente: {nombre} ({telefono})
Dirección: {direccion}
Referencias: {referencias}
Total: ${total}
Pago: {metodo_pago}
Envío: ${envio_base} + ${envio_ajuste} = ${envio_total}
Hora/Notas: {hora_estimada_notas}
```

## Impresoras
- Pendiente definir modelo/marca.
- Requisito: soportar impresión separada por área:
  - Cocina (comida)
  - Barra (bebidas)

## Menú
- El menú se cargará y ajustará más adelante.
- Requisito: edición de **productos, precios, categorías y modificadores** sin tocar código.

## Inventario fino (vivo)
- El inventario debe manejar:
  - Insumos con unidad (**kg/gr/ml/lt/pza**, etc.).
  - **Recetas** por producto (consumo por venta).
  - Movimientos: compra, ajuste, merma.
  - Mínimos y alertas.
- **Momento de descuento**: descontar insumos **al cerrar/cobrar** la orden.# patanegra
