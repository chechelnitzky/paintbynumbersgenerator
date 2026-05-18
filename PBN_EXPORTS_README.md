# Paint by Number — Recolor Export Add-on

Versión visible actual: **Recolor v2.5**

## Fix definitivo QR + imagen
- QR, texto superior y texto inferior ahora viven dentro de un único módulo `.qr-module`.
- El módulo usa layout controlado por CSS Grid para mantener un eje central común y separación vertical equilibrada.
- Se agregó `.qr-cleaner` para cubrir los textos antiguos del template base y evitar duplicación visual.
- La imagen principal usa `.image-frame` centrado con `left:50%` y `transform:translateX(-50%)`.
- El ancho de la imagen está fijado a 163mm para alinearse visualmente con el ancho del título “Imagen de Referencia”.
- La imagen no tiene marco, borde, sombra, caja ni fondo visible.

## Otros fixes incluidos
- Formato de impresión: **Oficio vertical**.
- `Marcadores incluidos (N colores)`.
- SVG defaults: `SVG size multiplier = 7` y `Label font color = #C4C4C4`.
- Quick apply suggestions.
- Colores bloqueables como NO DISPONIBLE.

## Al guardar el PDF
- Guardar como PDF
- Papel: **Oficio**
- Orientación: **Vertical**
- Escala: **100%**
- Márgenes: **Ninguno**
- Desactivar **Encabezados y pies de página**
