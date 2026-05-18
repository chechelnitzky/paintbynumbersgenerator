# PBN exports integrados

Esta versión agrega:

1. Campo **Nombre imagen**.
2. Botón **DOWNLOAD MARKER LIST CSV**.
3. Botón **CONFIG STORAGE**.
4. Botón **DOWNLOAD PRINT TEMPLATE PDF**.

## Configuración Cloudinary ya integrada

Esta versión ya viene preconfigurada con:

- Cloud name: `df4fayh1q`
- Unsigned upload preset: `pbn_unsigned`
- Folder: `paintbynumber-referencias`

Por eso, si el preset `pbn_unsigned` existe en tu cuenta Cloudinary y está en modo **Unsigned**, no debería pedirte datos para generar el PDF.

## Qué hace el PDF

Al apretar **DOWNLOAD PRINT TEMPLATE PDF**:

1. Toma la imagen original/reference del canvas.
2. La sube a Cloudinary usando el preset unsigned.
3. Obtiene una URL pública permanente.
4. Genera un QR con esa URL.
5. Crea un PDF imprimible con:
   - imagen de referencia,
   - nombre de imagen,
   - QR,
   - cuadro compacto de marcadores incluidos,
   - datos de contacto.

## Si falla el upload

- Si dice `Upload preset not found`, revisa que el preset se llame exactamente `pbn_unsigned`.
- Si dice algo relacionado a firma/signature, revisa que el preset esté configurado como **Unsigned**.
- Si cambias el cloud name o el preset, usa el botón **CONFIG STORAGE** para sobrescribir la configuración en ese navegador.

No necesitas pegar API key ni API secret en el programa.
