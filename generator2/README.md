# Generator 2 · PBN Studio

Generator 2 is a parallel UI at `/generator2/`. It does not replace or modify the stable generator.

## Current architecture

Generator 2 wraps the stable generator as a same-origin engine and adds a production application layer:

1. **Create** — use the proven generator/recolor workflow.
2. **Capture** — save SVG, source preview, marker recipe and settings into a project/version.
3. **Preview** — swap marker tags on a copy and approve a new version without overwriting the source.
4. **Library** — browse current + legacy designs, versions and previews.
5. **Production** — regenerate a structured approved version as SVG color, SVG line, PNG color, PNG line, print PDF and recipe JSON in one ZIP.

LocalStorage remains as an offline/cache layer, but production persistence is now connected to the dedicated Supabase project **Byte by Number**.

## Supabase

- Project ref: `mxjehmvrobpaetmhrgqz`
- Region: `sa-east-1`
- Private bucket: `pbn-studio-assets`
- RLS: admin-only
- First administrator: claimed once using an activation code whose plaintext is never committed to GitHub.

Generator 2 automatically syncs:

- designs;
- versions;
- recipes/markers;
- SVG color + line;
- source preview when available;
- project JSON bundle;
- generated PNG/PDF production assets.

## Legacy import

`Importar PDFs legacy` accepts multiple PDFs at once. It uses PDF.js + jsQR to:

1. read marker tags from page 1;
2. decode the Cloudinary QR;
3. match the marker set against existing recipes in Supabase;
4. attach the PDF to the matched version, or create a new legacy design;
5. upload the PDF to private Storage;
6. retain the Cloudinary reference as the visual preview.

Legacy designs can participate immediately in the optimizer even before their SVG is recovered. To regenerate production assets after recoloring, they need to be converted to a structured Generator 2 version.

## Optimizer bridge

Optimizer 2 stores optimization runs, estuches and marker changes in Supabase. Generator 2 reads the latest changes for the active base version and exposes **Cargar a preview**, allowing the proposal to be reviewed visually and saved as a new approved version.

## Production package

For a structured approved version, `Paquete final`:

- renders color + line PNGs;
- uploads the color reference to Cloudinary for a public QR;
- builds the printable reference PDF;
- syncs generated PNG/PDF assets to Supabase when logged in;
- downloads a ZIP containing SVG color, SVG line, PNG color, PNG line, PDF and recipe JSON.

## Next engine-level improvement

The remaining high-value improvement is to expose true facet-to-marker bindings and pixel/area weights directly from the generator engine. The current structured version already preserves SVG + labels, but exact facet metadata will make area-weighted optimization and deterministic regeneration even stronger.
