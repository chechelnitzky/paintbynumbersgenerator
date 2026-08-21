# Optimizador 2 · Negociación global

Página paralela e independiente en `/optimizer2/`. No lee ni escribe el `localStorage` del Optimizador 1 y no modifica recetas validadas.

## Idea

- Agrupa los productos en grupos de hasta 10.
- Para productos con alternativas A/B, puede elegir la receta que mejor encaje en cada agrupación.
- Dentro de cada grupo, todos los slots de color se reasignan simultáneamente sobre los 167 marcadores físicos.
- La asignación usa el Hungarian global ya disponible en `optimizer/core.js`, por lo que puede resolver cadenas de intercambio (por ejemplo 71→72 mientras 72→74).
- El costo prioriza mantener el marcador original, luego minimizar cambios y luego minimizar ΔE00.
- Se prueban múltiples particiones del catálogo y se conserva la mejor negociación completa encontrada.

## Catálogo actual

Hay 25 productos y 28 recetas. Con tamaño máximo 10, el resultado objetivo es 3 grupos: 10 + 10 + 5. Si en el futuro hay 28 productos, será 10 + 10 + 8; con 30, 10 + 10 + 10.

## Lectura visual

- Rojo: marcador que estaba repetido originalmente dentro de ese grupo.
- Flecha: marcador reasignado por la negociación global.
- ΔE: distancia perceptual CIEDE2000 del cambio.

## Persistencia

Esta versión es experimental: no aplica ni valida recetas. Puede exportar el resultado completo como JSON.