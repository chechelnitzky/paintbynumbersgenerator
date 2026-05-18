# Paint by Number — Recolor Export Add-on

Versión visible actual: **Recolor v1.3**

## Regla obligatoria de versiones

Cada vez que se modifique este ZIP, cambiar la constante `VERSION` en `recolor/recolor.js`.

Ubicación:

```js
const VERSION = "v1.3";
```

La versión aparece arriba del título principal de la app. Esto permite confirmar visualmente que la versión nueva sí cargó y que el navegador no está mostrando una versión antigua en caché.

---

## Cambios v1.3

### 1. Se eliminó la dependencia crítica de jsPDF/CDN

La v1.2 podía quedarse pegada en:

```txt
https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js
```

Eso no era el procesamiento de la imagen, sino una librería externa que no cargaba desde el CDN.

En v1.3, la plantilla imprimible usa el motor nativo del navegador:

1. Sube la imagen optimizada a Cloudinary.
2. Genera el QR como imagen.
3. Arma una plantilla A4 vertical en HTML.
4. Abre el diálogo de impresión.
5. El usuario debe elegir **Guardar como PDF**.

Esto es más robusto en GitHub Pages porque no depende de cargar jsPDF desde un CDN.

### 2. Marker list en JPG

El botón `DOWNLOAD MARKER LIST JPG` exporta una imagen JPG con los marcadores incluidos.

### 3. Plantilla A4

Reglas actuales:

- A4 vertical.
- Imagen de referencia centrada.
- La imagen no se gira.
- La imagen no se recorta.
- Se ajusta proporcionalmente dentro del área disponible.
- QR arriba a la derecha.
- Cuadro de marcadores incluido en el mismo PDF/plantilla.
- Footer con teléfono, correo y web.

### 4. QR

El QR apunta a la URL pública de Cloudinary de la imagen optimizada.

El QR se dibuja como una imagen dentro de la plantilla antes de imprimir. Si el servicio externo de QR fallara momentáneamente, la URL pública queda impresa en texto pequeño como respaldo.

---

## Configuración Cloudinary integrada

Valores por defecto:

```txt
Cloud name: df4fayh1q
Unsigned upload preset: pbn_unsigned
Folder: paintbynumber-referencias
```

El preset debe existir en Cloudinary y debe estar configurado como **Unsigned**.

No usar API Key ni API Secret en GitHub Pages.

---

## Recomendación al guardar PDF

Cuando se abra el diálogo de impresión:

- Destino: **Guardar como PDF**
- Tamaño: **A4**
- Orientación: **Vertical**
- Escala: **100%**
- Márgenes: **Ninguno** o **Predeterminado**, según cómo lo muestre el navegador
- Activar gráficos de fondo si el navegador lo pregunta

