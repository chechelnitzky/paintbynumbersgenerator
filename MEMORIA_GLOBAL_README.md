# Memoria global de marcadores

Esta versión guarda dos tipos de información global:

- números de marcadores bloqueados como **NO DISPONIBLES**;
- colores HEX/RGB personalizados por número de marcador.

El guardado ocurre primero en el navegador y luego se intenta sincronizar con Cloudinary. El botón **SYNC NUBE** permite traer manualmente el estado más reciente. Cloudinary puede tardar hasta aproximadamente 60 segundos en reflejar una actualización nueva en otro computador.

## Estado esperado

- **Memoria global guardada/sincronizada en la nube:** los cambios estarán disponibles en otros computadores.
- **Guardado local correcto; nube no disponible:** el cambio no se pierde en el computador actual, pero todavía no se comparte.

## Configuración necesaria en Cloudinary

En **Settings → Security**, habilita **Resource list**. Si está listado como tipo restringido, elimínalo de **Restricted image types**.

La configuración integrada es:

- Cloud name: `df4fayh1q`
- Upload preset: `pbn_unsigned`
- Folder: `paintbynumber-referencias`

Puedes cambiar estos datos desde **CONFIG STORAGE**.
