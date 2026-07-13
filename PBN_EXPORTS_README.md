# Paint by Number — Recolor v3.0

## Cambios incluidos

- **Bloqueos permanentes por número de marcador:** los colores marcados como no disponibles quedan guardados aunque se recargue la página.
- **Memoria compartida entre computadores:** los bloqueos y colores personalizados se sincronizan mediante Cloudinary.
- **Editor HEX/RGB bajo el picker:** permite elegir el número del marcador, cambiar su color y restablecer el color original de la base.
- **Nombre del PDF:** el cuadro “Nombre imagen” define el nombre sugerido al guardar, con el formato `Paint by number generator NOMBRE`.
- **Listado de marcadores JPG:** corregido el error que impedía generar la descarga.
- **Cache-busting v3.0:** el `index.html` fuerza la carga del JavaScript actualizado.

## Activación única para memoria entre computadores

La memoria local funciona automáticamente. Para compartirla entre distintos computadores:

1. Entra a **Cloudinary**.
2. Abre **Settings → Security**.
3. Habilita **Resource list**; si aparece dentro de **Restricted image types**, quítalo de esa lista.
4. Mantén activo el upload preset unsigned configurado en la aplicación: `pbn_unsigned`.
5. Abre el recoloreador y revisa el mensaje bajo **SYNC NUBE**. Debe indicar que la memoria global está sincronizada o guardada en la nube.

Si Cloudinary no está disponible, la aplicación seguirá guardando los cambios en ese navegador, pero no podrá propagarlos a otro computador hasta recuperar la sincronización. Una actualización recién subida puede tardar hasta aproximadamente 60 segundos en aparecer en otro computador.

## Uso del editor de colores

1. En **Editar código de color del marcador**, selecciona el número.
2. Escribe un valor HEX, por ejemplo `#123456`, o RGB, por ejemplo `18, 52, 86`.
3. Presiona **APLICAR COLOR**.
4. Para volver al color de la paleta original, presiona **RESTABLECER ORIGINAL**.

El picker, las sugerencias y las asignaciones actuales que utilicen ese número se actualizan automáticamente.

## Al guardar la plantilla PDF

- Escribe primero el nombre en **Nombre imagen**.
- Presiona **DOWNLOAD PRINT TEMPLATE PDF**.
- En el diálogo del navegador selecciona:
  - Destino: **Guardar como PDF**
  - Papel: **Oficio**
  - Orientación: **Vertical**
  - Escala: **100%**
  - Márgenes: **Ninguno**
  - **Desactivar Encabezados y pies de página**
