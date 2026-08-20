# PBN · Optimizador de Estuches y Marcadores

Experimental optimizer built on top of the published `v4-13.07.26` branch. Development lives in `feature/palette-optimizer`.

## Terminología

- **Estuche**: agrupación de productos que puede fabricarse usando como máximo una unidad de cada uno de los 167 marcadores.
- **Producto**: el diseño comercial, por ejemplo Capri o Tulipanes.
- **Receta**: lista concreta de marcadores con la que se fabrica un producto.
- **Propuesta**: nueva receta creada por el optimizador. Puede quedar como borrador, validarse o marcarse como aplicada.

## Datos actuales

- 25 productos recuperados del RAR.
- 28 recetas originales porque Capri, Tulipanes y Desierto Florido tienen alternativas.
- La paleta física se lee directamente desde `../recolor/palette168.js`.

## Funciones actuales

1. Calcula el máximo de diseños que hoy caben en un estuche sin modificar colores.
2. Arma un plan general que agrupa los 25 productos en la menor cantidad de estuches encontrada por la heurística actual.
3. Muestra el uso de los 167 marcadores con una escala visual fuerte: libre, bajo, medio, alto y crítico.
4. Permite seleccionar productos y recolorear globalmente sus recetas mediante CIEDE2000 (ΔE00).
5. Busca automáticamente estuches de 4–10 diseños.
6. Usa asignación global Hungarian para evitar marcadores repetidos dentro del mismo estuche.
7. Muestra cambios concretos como `36 → 32`, con su ΔE00.
8. Permite guardar una solución como borrador o validarla como nueva receta.
9. Las recetas validadas pasan automáticamente a ser alternativas disponibles para el plan general de estuches.
10. Cada producto abre una ficha con todas sus recetas originales y optimizadas.

## Persistencia y validación

Las propuestas se guardan en `localStorage` bajo la clave `pbn_optimizer_saved_recipes_v1`.

Esto significa que persisten al cerrar y volver a abrir la página en el mismo navegador, pero no son todavía una base de datos central. La pantalla permite **Exportar respaldo** e **Importar respaldo** en JSON para no depender exclusivamente del navegador.

Estados:

- `draft`: propuesta guardada, todavía no afecta el cálculo de estuches.
- `validated`: receta aprobada; entra automáticamente en el cálculo como alternativa del producto.
- `applied`: receta que además ya fue llevada al generador y aplicada al diseño final.

Nunca se reemplaza una receta original: una optimización crea una nueva alternativa.

## Llevar una receta al generador

Desde la ficha de cualquier receta se puede:

- copiar la lista de códigos de marcadores;
- copiar las restricciones en formato RGB aceptado por `Restrict clustering colors`;
- usar **Abrir generador**, que abre el generador en otra pestaña y copia esas restricciones al portapapeles.

En el generador: `Options` → `Restrict clustering colors` → pegar las restricciones copiadas. El número de clusters debe coincidir con la cantidad de marcadores de esa receta.

## Limitación importante

Los PDFs recuperados identifican qué marcadores usa cada receta, pero todavía no entregan un peso confiable de área/importancia por marcador. Por ahora cada color pesa igual. La siguiente mejora debería importar frecuencia/área desde el generador para que cambiar un color que ocupa 30% de una imagen tenga mucho más costo que cambiar un detalle de 1%.

## Próximos pasos

- importar peso por área/frecuencia;
- bloquear colores artísticamente críticos;
- hacer que el límite de cambios por diseño forme parte del optimizador y no sólo de la validación final;
- conectar directamente una receta validada con el generador sin necesidad de pegar manualmente;
- agregar inventario real y ponderación por demanda.