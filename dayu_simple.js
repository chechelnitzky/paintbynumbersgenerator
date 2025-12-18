function forzarRerenderComoUI() {
  console.log("⚡ Forzando re-render usando controles reales (labels/facets/borders/font/size)...");

  // Helpers
  const fire = (el) => {
    if (!el) return;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const click = (el) => {
    if (!el) return;
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };

  // Encuentra input asociado a un texto cercano (label o contenedor)
  function findControlByNearbyText(textIncludes) {
    const needles = Array.isArray(textIncludes) ? textIncludes : [textIncludes];
    const all = Array.from(document.querySelectorAll("label, .input-field, .switch, .checkbox, .row, .col, div, span, p"));

    const node = all.find((n) => {
      const t = (n.textContent || "").toLowerCase();
      return needles.some((k) => t.includes(k));
    });

    if (!node) return null;

    // Busca input dentro o cerca
    const inside = node.querySelector("input, select, textarea, button");
    if (inside) return inside;

    // Busca en hermanos / parent
    const parent = node.closest("label, .input-field, .switch, .row, .col, div") || node.parentElement;
    if (parent) {
      const near = parent.querySelector("input, select, textarea, button");
      if (near) return near;
    }

    return null;
  }

  // 1) Intento #1: Toggle doble de "Show borders"
  const borders = findControlByNearbyText(["show border", "show borders", "borde", "bordes"]);
  if (borders) {
    const cb = (borders.type === "checkbox") ? borders : borders.querySelector?.('input[type="checkbox"]');
    const target = cb || (borders.closest("label") ? borders.closest("label") : borders);

    // Si es checkbox real, toggle y vuelve
    if (cb) {
      const original = cb.checked;
      cb.checked = !original; fire(cb);
      setTimeout(() => { cb.checked = original; fire(cb); }, 30);
      console.log("✅ Re-render: toggle show borders");
      return true;
    }

    // si no, click doble
    click(target);
    setTimeout(() => click(target), 30);
    console.log("✅ Re-render: click doble show borders");
    return true;
  }

  // 2) Intento #2: Toggle doble de "Show labels"
  const labels = findControlByNearbyText(["show labels", "labels", "etiquetas", "label"]);
  if (labels) {
    const cb = (labels.type === "checkbox") ? labels : labels.querySelector?.('input[type="checkbox"]');
    const target = cb || (labels.closest("label") ? labels.closest("label") : labels);
    if (cb) {
      const original = cb.checked;
      cb.checked = !original; fire(cb);
      setTimeout(() => { cb.checked = original; fire(cb); }, 30);
      console.log("✅ Re-render: toggle show labels");
      return true;
    }
    click(target);
    setTimeout(() => click(target), 30);
    console.log("✅ Re-render: click doble show labels");
    return true;
  }

  // 3) Intento #3: Toggle doble de "Fill facets"
  const facets = findControlByNearbyText(["fill facets", "facets", "facet", "facetas"]);
  if (facets) {
    const cb = (facets.type === "checkbox") ? facets : facets.querySelector?.('input[type="checkbox"]');
    const target = cb || (facets.closest("label") ? facets.closest("label") : facets);
    if (cb) {
      const original = cb.checked;
      cb.checked = !original; fire(cb);
      setTimeout(() => { cb.checked = original; fire(cb); }, 30);
      console.log("✅ Re-render: toggle fill facets");
      return true;
    }
    click(target);
    setTimeout(() => click(target), 30);
    console.log("✅ Re-render: click doble fill facets");
    return true;
  }

  // 4) Intento #4: Nudge de "Label font size" (49 -> 50 -> 49)
  const fontSize = findControlByNearbyText(["label font size", "font size", "tamaño fuente", "tamano fuente"]);
  if (fontSize && (fontSize.tagName === "INPUT")) {
    const original = fontSize.value;
    const n = parseFloat(original);
    if (!Number.isNaN(n)) {
      fontSize.value = String(n + 1);
      fire(fontSize);
      setTimeout(() => { fontSize.value = original; fire(fontSize); }, 30);
      console.log("✅ Re-render: nudge label font size");
      return true;
    }
  }

  // 5) Intento #5: Nudge de "Label font color" (agrega/saca espacio)
  const fontColor = findControlByNearbyText(["label font color", "font color", "color fuente", "#000"]);
  if (fontColor && (fontColor.tagName === "INPUT")) {
    const original = fontColor.value;
    fontColor.value = (original + " ").trimEnd(); // pequeño cambio
    fire(fontColor);
    setTimeout(() => { fontColor.value = original; fire(fontColor); }, 30);
    console.log("✅ Re-render: nudge label font color");
    return true;
  }

  // 6) Intento #6: Nudge de "SVG size multiplier" (range)
  const range = document.querySelector('input[type="range"]');
  if (range) {
    const original = range.value;
    const n = parseFloat(original);
    range.value = String(n + 0.01);
    fire(range);
    setTimeout(() => { range.value = original; fire(range); }, 30);
    console.log("✅ Re-render: nudge svg size multiplier");
    return true;
  }

  console.log("⚠️ No se pudo forzar re-render via UI");
  return false;
}
