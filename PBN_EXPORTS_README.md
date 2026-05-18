# Paint by Number — Recolor Export Add-on

Versión visible actual: **Recolor v1.4**

## Importante
Cada vez que se modifique este ZIP, cambiar la constante `VERSION` en `recolor/recolor.js`.
Así el texto rojo que aparece arriba del título principal cambia visualmente y sabes que realmente cargaste la nueva versión.

## Qué hace esta versión
- Mantiene visible la versión arriba: `Recolor v1.4`.
- El botón **DOWNLOAD MARKER LIST JPG** exporta el listado de marcadores como JPG.
- El botón **DOWNLOAD PRINT TEMPLATE PDF** ahora usa:
  - el **arte recoloreado** (no la foto original) como imagen principal;
  - ese mismo arte recoloreado en HD para subirlo a Cloudinary y generar el QR;
  - la **plantilla visual original** del PDF que subiste, integrada como fondo local del sistema (`assets/pbn_template_bg.png`), para que la hoja final se vea como tu diseño.
- En la plantilla ya no se agrega arriba la fecha/hora, ni el nombre, ni abajo la URL fallback dentro del documento.

## Flujo del botón DOWNLOAD PRINT TEMPLATE PDF
1. Lee los marcadores activos.
2. Rasteriza el SVG recoloreado a PNG HD.
3. Sube ese PNG HD a Cloudinary.
4. Genera el QR con la URL pública de Cloudinary.
5. Abre la plantilla A4 para imprimir/guardar como PDF.

## Ojo con la impresión del navegador
La línea superior con fecha y la inferior con URL **no las agrega el código**, las agrega el diálogo de impresión del navegador si está activa la opción de encabezados y pies de página.

Al guardar el PDF, usar:
- **Guardar como PDF**
- **Tamaño A4**
- **Vertical**
- **Escala 100%**
- **Márgenes: ninguno / predeterminado según navegador**
- **Desactivar “Encabezados y pies de página”**

## Storage integrado por defecto
La versión viene precargada con:
- Cloud name: `df4fayh1q`
- Upload preset: `pbn_unsigned`
- Folder: `paintbynumber-referencias`

Si cambias el preset o la cuenta, usa el botón **CONFIG STORAGE**.
