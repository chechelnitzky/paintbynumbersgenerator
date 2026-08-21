# Byte by Number · backend desplegado

Proyecto Supabase dedicado: `mxjehmvrobpaetmhrgqz` (`sa-east-1`).

## Estado V1

- 25 diseños legacy sembrados.
- 28 recetas/versiones actuales.
- 432 asignaciones de marcador.
- Storage privado: `pbn-studio-assets`.
- RLS habilitado en todas las tablas de producción.
- Acceso de datos limitado al administrador reclamado mediante `pbn_claim_admin`.
- El código de activación inicial NO se guarda en GitHub; en base sólo existe su SHA-256 y se elimina al reclamar el primer administrador.
- `Generator 2` sincroniza proyectos, versiones, marcadores, SVG y project bundles.
- `Optimizer 2` lee recetas aprobadas y guarda corridas, cambios y estuches.
- Importador legacy de PDFs: receta + QR Cloudinary + PDF privado en Storage.
- Pipeline de producción para versiones estructuradas: SVG color/línea + PNG color/línea + PDF referencia + JSON, agrupados en ZIP.
- Puente Optimizer 2 → Generator 2: propuestas guardadas pueden cargarse al editor de receta para preview/aprobación.

## Tablas

- `pbn_designs`
- `pbn_design_versions`
- `pbn_version_markers`
- `pbn_assets`
- `pbn_palette_markers`
- `pbn_optimization_runs`
- `pbn_optimization_changes`
- `pbn_cases`
- `pbn_case_items`
- `pbn_render_jobs`
- `pbn_import_jobs`
- `pbn_app_admins`
- `pbn_private_settings`

## Importación legacy

La biblioteca inicial tiene las recetas aunque no todos los assets históricos estén disponibles. Desde Generator 2 se pueden seleccionar varios PDFs a la vez. El importador:

1. lee la primera página con PDF.js;
2. extrae los tags de marcador;
3. decodifica el QR con jsQR;
4. busca una receta con el mismo conjunto de marcadores;
5. vincula el PDF a la versión existente o crea una nueva si no encuentra coincidencia;
6. guarda el PDF en Storage privado;
7. registra la URL de Cloudinary como referencia visual pública cuando existe.

## Seguridad

La publishable key de Supabase puede vivir en frontend. La seguridad efectiva depende de RLS. Los assets privados y tablas sólo permiten acceso cuando `pbn_is_admin()` es verdadero. El único SECURITY DEFINER intencional expuesto a usuarios autenticados es `pbn_claim_admin(text)`, necesario para reclamar la primera cuenta; después de la primera reclamación el hash del código se elimina y no permite reclamar otra cuenta.
