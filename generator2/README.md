# Generator 2 · PBN Studio

Generator 2 is a parallel UI at `/generator2/`. It does not replace or modify the published legacy generator flow.

## v0 architecture

Generator 2 wraps the stable generator as a same-origin embedded engine, then adds a new application layer around it:

1. **Create** — use the proven generator/recolor workflow.
2. **Capture** — save the current SVG, source preview, detected marker recipe and generator settings into a structured project/version.
3. **Preview** — duplicate a saved version, swap marker tags, preview the recolored SVG and compare without overwriting the original.
4. **Library** — browse designs and versions with thumbnails; export/import a full local backup.
5. **Production** — approved versions are collected in one queue ready for the future render/optimizer pipeline.

The first iteration persists in `localStorage` under `pbn_studio_library_v1`. This is deliberate: the UI and project model can be tested before choosing which connected Supabase project should hold production data.

## Project/version bundle

A saved version currently contains:

- source canvas preview when available;
- colored SVG output;
- derived line SVG;
- detected marker tags and palette hex values;
- rough marker importance based on SVG element count;
- generator settings;
- parent/source version id for derived versions;
- status (`draft` or `approved`).

## Current preview behavior

The marker editor replaces exact palette colors inside a copy of the saved SVG. It also updates a text label when the text content exactly equals the old marker tag. This gives immediate visual experimentation while preserving the original.

For production-grade regeneration, the next engine bridge should persist facet/color-label metadata directly from the generator/recolor pipeline so labels and area weights can always be regenerated deterministically instead of inferred from a finished SVG.

## Database / Storage

A proposed Supabase schema lives at `../supabase/pbn_studio_schema.sql`. It defines designs, versions, markers, assets, optimization runs, estuches/cases and render jobs. The SQL is intentionally not deployed yet because the connected account currently exposes more than one Supabase project and the production destination must be chosen explicitly.

## Next technical milestones

- expose a structured `PBNProjectBundle` directly from the generator/recolor engine;
- capture facet-to-marker bindings and true pixel/area weights;
- Supabase adapter + private Storage bucket;
- Optimizer 2 reads/writes versions from the same library;
- before/after split preview for proposed recipes;
- render job that regenerates SVG, PNG and print PDF deterministically;
- batch download for every approved design in an estuche.
