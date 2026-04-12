 # Apán Café POS (requisitos)

## Guía de arranque (clonar el POS actual a proyecto APÁN)

Este documento sirve para 2 cosas:
- **Guía para crear el proyecto nuevo** `apan/` usando el POS actual (`patanegra/`) como template.
- **Requisitos funcionales** específicos de Apán Café (secciones siguientes).

### Crear proyecto `apan/` (sin empezar de cero)

1) **Crear carpeta**
- Crea una carpeta nueva fuera de `patanegra/`:
  - `/Users/albertogarcia/Sista/apan`

2) **Copiar el template**
- Copia el contenido de `patanegra/` hacia `apan/`.
- No copies:
  - `node_modules/`
  - `dist/`
  - `.firebase/`
  - `.env`
  - `.firebaserc`

3) **Instalar dependencias**
- En `apan/`:
  - `npm install`

4) **Cambiar branding (Patanegra → Apán Café)**
- `index.html`
  - `<title>` y metas (description, og/twitter)
  - íconos/logo
- `src/pages/Login.tsx`
  - texto visible (ej. "Patanegra POS")
- `src/pages/MenuPublico.tsx`
  - `document.title`
  - metas description/og/twitter
  - JSON-LD: `name`, `image`
  - `scriptId` (ej. `ld-patanegra-menu` → `ld-apan-menu`)

5) **Configurar Firebase (cuando toque)**
- El proyecto usa `src/firebase.ts` con variables `VITE_FIREBASE_*`.
- En `apan/`, crear `.env` con:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`

6) **Deploy**
- `npm run build`
- `firebase deploy`

### Nota de trabajo
- Este repo (`patanegra/`) **no se mezcla** con Apán; Apán vive en su carpeta/proyecto aparte.

## Objetivo
 POS por mesas con:
 - **2 meseros en celular/tablet** para levantar órdenes.
 - **Caja/Cajera** en pantalla/tablet para cobros, supervisión, reportes y corte.
 - **Impresión en barra** para bebidas (calientes/frías).
 - **Impresión en cocina** para repostería/comida (si aplica).
 - **Almacén** para inventario fino (insumos con recetas).
 - Todo el sistema opera en el **mismo WiFi** del local.
 
 ## Concepto
 Cafetería tipo con **ambientación oaxaqueña**.
 Nombre: **Apán Café** (Apán es el apellido del dueño).
 
 ## Ficha del negocio
 - **Dirección:** Frente a las canchas de frontón, Circuito Deportivo 219, Fraccionamiento Guadalupe, 86180 Villahermosa, Tab.
 - **Teléfono:** 993 283 4964
 - **Horario (actual):**
   - Viernes: 8:00 a.m. – 9:30 p.m.
   - Sábado: 8:00 a.m. – 9:30 p.m.
   - Domingo: Cerrado
   - Lunes: 8:00 a.m. – 9:30 p.m.
   - Martes: 8:00 a.m. – 9:30 p.m.
   - Miércoles: 8:00 a.m. – 9:30 p.m.
   - Jueves: 8:00 a.m. – 9:30 p.m.
 
 ## Sugerencias de horario (propuestas)
 Pensando en cafetería, hay 2 estrategias típicas: abrir más temprano para “primer café” y/o abrir domingo para brunch.
 
 ### Propuesta A (equilibrada)
 - Lunes a viernes: 7:00 a.m. – 9:30 p.m.
 - Sábado: 8:00 a.m. – 9:30 p.m.
 - Domingo: 8:00 a.m. – 2:00 p.m.
 
 ### Propuesta B (foco en mañanas, cierre más temprano)
 - Lunes a viernes: 7:00 a.m. – 8:30 p.m.
 - Sábado: 7:30 a.m. – 8:30 p.m.
 - Domingo: 8:00 a.m. – 3:00 p.m.
 
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
     - Barra: bebidas.
     - Cocina: repostería/comida (si aplica).
 - **Cuenta solicitada**
   - El mesero solicita el cierre desde su dispositivo y **selecciona método de pago** (solo efectivo/terminal).
   - La mesa pasa a estado **por cobrar**.
 - **Cobro y cierre**
   - Caja confirma que se recibió el pago y **cierra la mesa**.
   - Si es **terminal**: caja entrega la terminal al mesero para cobrar en la mesa (o donde sea necesario).
   - Si es **efectivo**: caja registra el pago (aunque el mesero haya recibido el efectivo).
   - Caja ejecuta el **corte**.
 
 ## Cobros
 - **Métodos de pago (salón)**
   - Efectivo
   - Terminal
 - **Propina (solo tarjeta/terminal)**
   - Opciones: **5%**, **10%**, **15%**, **20%**, **otro monto**.
 
 ## Bebidas: tamaños y modificadores
 - El sistema debe soportar bebidas con:
   - Tamaños (ej. Chico/Mediano/Grande) con precio por tamaño.
   - Leches (entera/deslactosada/almendra/avena, etc.).
   - Temperatura (caliente/fría) cuando aplique.
   - Endulzantes (azúcar/stevia, etc.) cuando aplique.
   - Extras (shot espresso, jarabe, crema batida, etc.).
 - La comanda debe imprimir claramente:
   - Producto
   - Tamaño
   - Modificadores
   - Notas
 
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
   - Enviar a barra/cocina (impresión por área)
   - Si es domicilio:
     - Botón: **Enviar a repartidor**
     - Enviar detalles al **WhatsApp del dueño**
     - Marcar estado: **En reparto**
 
 ### Domicilio: pagos y envío
 - **Métodos de pago (domicilio)**
   - Efectivo
   - Transferencia
 - **Cuenta para transferencias**
   - Se transfiere a la **cuenta del negocio**.
   - Debe existir un campo de **configuración** para guardar los datos de transferencia (texto libre).
 - **Quién cobra**
   - Usualmente el repartidor cobra, pero debe soportar modo **mixto**.
 - **Costo de envío**
   - Base: **$30.00**
   - Variable por distancia (ajustable por orden)
 
 ### WhatsApp: mensaje de despacho (Enviar a repartidor)
 - Destino: siempre al **mismo número** (WhatsApp del dueño).
 
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
   - Barra (bebidas)
   - Cocina (repostería/comida)
 
 ## Menú (administración)
 - La cuenta `admin` debe poder:
   - Cambiar precios.
   - Modificar nombres y descripciones.
   - Apagar/encender productos.
 - **Guardado automático**: al perder foco (**`onBlur`**).
 - Productos apagados **se ocultan** del menú público.
 
 ## Menú público (solo vista)
 - Existe una vista de menú para clientes (solo lectura).
 - No permite pedir/ordenar.
 - Siempre disponible (no hay switch global).
 
 ## Inventario fino (vivo)
 - El inventario debe manejar:
   - Insumos con unidad (**kg/gr/ml/lt/pza**, etc.).
   - **Recetas** por producto (consumo por venta).
   - Movimientos: compra, ajuste, merma.
   - Mínimos y alertas.
 - **Momento de descuento**: descontar insumos **al cerrar/cobrar** la orden.
