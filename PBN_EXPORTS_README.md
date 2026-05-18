# Paint by Number export improvements

Se agregaron estas mejoras en `recolor/recolor.js`:

1. Botón `DOWNLOAD MARKER LIST CSV`.
   - Descarga el listado de reemplazos activos.
   - Incluye tag original, color original, marcador reemplazo, color marcador y tag final.
   - Al final incluye una fila resumen con los marcadores únicos incluidos.

2. Campo `Nombre imagen`.
   - Se usa para nombrar la imagen subida y el PDF final.

3. Botón `DOWNLOAD PRINT TEMPLATE PDF`.
   - Toma la imagen original desde el canvas de entrada.
   - La sube a Cloudinary mediante unsigned upload.
   - Genera un QR con la URL pública de Cloudinary.
   - Genera un PDF A4 con imagen de referencia, QR, datos de contacto y un cuadro pequeño con los marcadores incluidos.

## Configuración Cloudinary

Como la app corre en navegador/GitHub Pages, no conviene usar claves secretas. Por eso se usa Cloudinary con unsigned upload preset.

La primera vez que aprietes `DOWNLOAD PRINT TEMPLATE PDF`, el navegador pedirá:

- Cloudinary cloud name
- Cloudinary unsigned upload preset
- Carpeta Cloudinary

Queda guardado en `localStorage` del navegador.

También puedes definirlo manualmente antes de cargar `recolor.js`:

```html
<script>
  window.PBN_UPLOAD_CONFIG = {
    cloudName: "TU_CLOUD_NAME",
    unsignedPreset: "TU_UNSIGNED_PRESET",
    folder: "paintbynumber-referencias"
  };
</script>
```

## Nota importante

El PDF se recrea en código imitando la plantilla visual actual. No edita directamente el PDF base existente. Esto evita depender de un backend pesado y permite que funcione desde GitHub Pages.
