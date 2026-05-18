# Paint by Number — Recolor Export Add-on

Versión visible actual: **Recolor v1.2**

IMPORTANTE PARA FUTURAS MODIFICACIONES:
Cada vez que se entregue un ZIP nuevo, cambiar en `recolor/recolor.js`:

```js
const VERSION = "v1.2";
```

a `v1.2`, `v1.3`, etc. Así Joseph puede confirmar visualmente arriba a la izquierda que el navegador está usando la versión nueva y no una versión cacheada.

## Qué incluye esta versión

1. Botón **DOWNLOAD RECOLORED SVG**.
2. Botón **DOWNLOAD RECOLORED PNG**.
3. Campo **Nombre imagen**.
4. Botón **CONFIG STORAGE**.
5. Botón **DOWNLOAD MARKER LIST JPG**.
6. Botón **DOWNLOAD PRINT TEMPLATE PDF**.
7. Barra de estado/progreso para saber en qué etapa está el PDF.

## Configuración Cloudinary integrada

Esta versión ya trae integrada esta configuración inicial:

```txt
Cloud name: df4fayh1q
Unsigned upload preset: pbn_unsigned
Folder: paintbynumber-referencias
```

El preset `pbn_unsigned` debe existir en Cloudinary y debe estar configurado como **Unsigned**.

No se usan API keys ni API secret porque esta app corre en navegador/GitHub Pages. Nunca pegar claves privadas en el frontend.

## Cómo funciona el PDF

Al apretar **DOWNLOAD PRINT TEMPLATE PDF**, el flujo es:

1. Lee la imagen de referencia desde el canvas de entrada.
2. Sube esa imagen a Cloudinary.
3. Cloudinary devuelve una URL pública permanente.
4. El navegador genera un QR localmente con la librería `qrcode` cargada desde jsDelivr.
5. El navegador genera el PDF localmente con `jsPDF` cargado desde jsDelivr.
6. El PDF se descarga.

El QR no se genera en una plataforma externa tipo generador online. Se genera en el navegador. El QR apunta a la URL pública de Cloudinary.

## Tiempo esperado

Después de que el paint-by-number ya terminó de procesar, el PDF debería demorar normalmente entre **5 y 20 segundos**.

Puede demorar más si:

- la imagen de entrada es muy pesada;
- internet está lento;
- Cloudinary tarda en responder;
- el navegador está cargado;
- la app todavía está procesando el paint-by-number base.

## Reglas de colocación de imagen en el PDF

El PDF actual se arma como **A4 vertical**.

Reglas actuales:

- La imagen de referencia **no se gira**.
- Se conserva su proporción original.
- Se centra dentro de un área rectangular.
- Usa modo `contain`: entra completa, sin recorte.
- Si la imagen es horizontal, queda horizontal dentro del espacio.
- Si la imagen es vertical, aprovecha mejor el alto.
- El QR queda arriba a la derecha.
- El cuadro de marcadores queda abajo, antes del tip y footer.

Coordenadas principales en `generatePrintableReferencePdf()`:

```js
const imgBox = { x: 22, y: 58, w: pageW - 44, h: 158 };
```

## Marker list JPG

El botón **DOWNLOAD MARKER LIST JPG** genera una imagen JPG independiente con todos los marcadores únicos usados.

El PDF también incluye un cuadro pequeño con los marcadores incluidos.

## Archivos tocados

- `recolor/recolor.js`
- `PBN_EXPORTS_README.md`


## v1.2 - mejoras de velocidad y diagnóstico

- El PDF ya no intenta subir/incrustar la imagen gigante original: crea una copia optimizada de máximo 2400 px por lado en JPG 86%.
- La subida a Cloudinary muestra el peso aproximado del archivo.
- La subida tiene timeout de 45 segundos para evitar que el botón quede procesando infinito.
- jsPDF y QRCode se cargan en paralelo y se pre-cargan silenciosamente al abrir el panel de recoloreo.
- El QR se genera localmente en el navegador con la librería `qrcode`; no se usa una web externa de QR.
- Reglas del PDF: A4 vertical, imagen sin rotar, sin recortar, centrada y ajustada proporcionalmente dentro del área de referencia.
