/* Manual local detail regions for Paint by Number Generator. */
(function () {
  "use strict";
  var zones = [];
  window.pbnDetailZones = zones;
  function init() {
    var canvas = document.getElementById("canvas");
    var panel = document.getElementById("detailZonesPanel");
    if (!canvas || !panel) return;
    var wrapper = document.createElement("div");
    wrapper.className = "pbn-image-wrapper";
    canvas.parentNode.insertBefore(wrapper, canvas);
    wrapper.appendChild(canvas);
    var overlay = document.createElement("canvas");
    overlay.id = "pbnZoneOverlay";
    wrapper.appendChild(overlay);
    var enabled = document.getElementById("chkLocalDetail");
    var minPixels = document.getElementById("txtLocalFacetSize");
    var zoneList = document.getElementById("detailZoneList");
    var drag = null;
    function sync() {
      if (!canvas.width || !canvas.height) return;
      if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
        overlay.width = canvas.width;
        overlay.height = canvas.height;
      }
      // Never store measured dimensions while a Materialize tab is hidden.
      // Its bounding box becomes 0x0 and would permanently collapse the image.
      overlay.style.pointerEvents = enabled.checked ? "auto" : "none";
      draw();
    }
    function draw() {
      var ctx = overlay.getContext("2d");
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      zones.forEach(function (z, i) {
        ctx.fillStyle = "rgba(0,170,150,.19)";
        ctx.strokeStyle = "#00a896";
        ctx.lineWidth = Math.max(2, overlay.width / 500);
        ctx.fillRect(z.x * overlay.width, z.y * overlay.height, z.width * overlay.width, z.height * overlay.height);
        ctx.strokeRect(z.x * overlay.width, z.y * overlay.height, z.width * overlay.width, z.height * overlay.height);
        ctx.font = "bold " + Math.max(13, overlay.width / 60) + "px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText((i + 1) + " / " + z.minPixels + "px", z.x * overlay.width + 5, z.y * overlay.height + 18);
      });
      if (drag) {
        var x = Math.min(drag.x, drag.endX) * overlay.width;
        var y = Math.min(drag.y, drag.endY) * overlay.height;
        var w = Math.abs(drag.x - drag.endX) * overlay.width;
        var h = Math.abs(drag.y - drag.endY) * overlay.height;
        ctx.fillStyle = "rgba(0,170,150,.22)";
        ctx.strokeStyle = "#00a896";
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    }
    function renderList() {
      zoneList.textContent = "";
      zones.forEach(function (zone, i) {
        var row = document.createElement("div");
        row.className = "pbn-zone-row";
        var label = document.createElement("span");
        label.textContent = "Zona " + (i + 1) + " — ";
        var num = document.createElement("input");
        num.type = "number"; num.min = "1"; num.max = "1000"; num.value = zone.minPixels;
        num.title = "Tamaño mínimo de faceta (píxeles de área)";
        num.addEventListener("change", function () {
          zone.minPixels = Math.max(1, Math.round(Number(num.value) || 4));
          draw();
        });
        var remove = document.createElement("button");
        remove.type = "button"; remove.textContent = "Quitar";
        remove.addEventListener("click", function () { zones.splice(i, 1); renderList(); draw(); });
        row.appendChild(label); row.appendChild(num); row.appendChild(remove);
        zoneList.appendChild(row);
      });
    }
    function position(ev) {
      var box = overlay.getBoundingClientRect();
      return { x: Math.max(0, Math.min(1, (ev.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (ev.clientY - box.top) / box.height)) };
    }
    overlay.addEventListener("pointerdown", function (ev) {
      if (!enabled.checked) return;
      ev.preventDefault(); overlay.setPointerCapture(ev.pointerId);
      var pos = position(ev);
      drag = { x: pos.x, y: pos.y, endX: pos.x, endY: pos.y };
      draw();
    });
    overlay.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      var pos = position(ev);
      drag.endX = pos.x; drag.endY = pos.y;
      draw();
    });
    overlay.addEventListener("pointerup", function (ev) {
      if (!drag) return;
      var pos = position(ev);
      var x = Math.min(drag.x, pos.x), y = Math.min(drag.y, pos.y);
      var w = Math.abs(drag.x - pos.x), h = Math.abs(drag.y - pos.y);
      drag = null;
      if (w > .005 && h > .005) {
        zones.push({ x: x, y: y, width: w, height: h, minPixels: Math.max(1, Math.round(Number(minPixels.value) || 4)) });
        renderList();
      }
      draw();
    });
    overlay.addEventListener("pointercancel", function () { drag = null; draw(); });
    enabled.addEventListener("change", sync);
    document.getElementById("btnClearDetailZones").addEventListener("click", function () { zones.splice(0); renderList(); draw(); });
    document.getElementById("file").addEventListener("change", function () { zones.splice(0); renderList(); draw(); });
    window.addEventListener("paste", function () { zones.splice(0); renderList(); draw(); });
    ["lnkTrivial", "lnkSmall", "lnkMedium"].forEach(function (id) {
      document.getElementById(id).addEventListener("click", function () { zones.splice(0); renderList(); draw(); });
    });
    if (window.ResizeObserver) new ResizeObserver(sync).observe(canvas);
    setInterval(function () {
      if (overlay.width !== canvas.width || overlay.height !== canvas.height) sync();
    }, 1000);
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
