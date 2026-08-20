# PBN Marker & Palette Optimizer

Experimental optimizer built on top of the published `v4-13.07.26` branch. All work lives in `feature/palette-optimizer`; the published branch is not modified.

## Current data model

- **25 products** recovered from the supplied RAR.
- **28 recipes** because Capri, Tulipanes and Desierto Florido currently have A/B alternatives.
- A product can have one or more recipes; demand belongs to the product, while production can choose the best recipe.
- The marker palette is read directly from `../recolor/palette168.js`, so there is only one color source of truth.

## What v0.1 does

1. Calculates the largest group of current recipes with zero repeated markers.
2. Shows a live 167-marker utilization map.
3. Lets the user select products and globally recolor their recipes.
4. Searches automatically for groups of 4–10 products.
5. Uses CIEDE2000 (ΔE00) to measure perceptual color change.
6. Uses a Hungarian global assignment so every color slot in a production palette receives a unique physical marker.
7. Reports concrete proposed changes such as `36 → 32`, including ΔE00.
8. Exports a solution as JSON without overwriting any original recipe.

## Optimization objective

The current cost function prefers, in order:

- keeping the original marker;
- minimizing the number of changed markers;
- minimizing perceptual ΔE00;
- obtaining a globally unique marker assignment across the selected products.

The dashboard exposes conservative, balanced and aggressive presets plus direct controls for maximum ΔE and changes per design.

## Important current limitation

The recovered PDF recipes identify which markers are used but do not contain a reliable area/importance weight for every marker. v0.1 therefore gives each color equal weight. The existing generator/recolor pipeline can provide color frequency/area information; the next optimization pass should feed those weights into `weightByRecipeTag` so a color covering 30% of an artwork is harder to change than a tiny detail.

## Planned next steps

- import area/frequency weights from generated artwork;
- lock artistically critical colors per design;
- save approved optimized recipes as C/D variants rather than replacing A/B;
- build automatic Palette A/B/C partitioning across the whole catalog;
- add real marker inventory and demand weighting;
- feed allowed/free markers back into the Paint by Number generator when creating a new design.
