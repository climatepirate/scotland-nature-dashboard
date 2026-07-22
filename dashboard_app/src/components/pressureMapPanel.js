export function createPressureMapPanel() {
  const panel = document.createElement("section");
  panel.className = "panel";

  panel.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Ecosystem Pressure Map</h2>
      <p class="panel-subtitle">Mean Ecosystem Service Pressures - filter for individual pressures</p>
    </div>
    <div class="map-panel-shell">
      <div id="ecosystem-pressure-map" class="map-canvas" aria-label="Ecosystem pressure map"></div>
    </div>
    <div class="map-selector-shell">
      <label class="map-selector-label" for="ecosystem-pressure-service-select">Ecosystem pressure</label>
      <select id="ecosystem-pressure-service-select" class="map-selector-input" aria-label="Ecosystem pressure"></select>
    </div>
  `;

  return panel;
}
