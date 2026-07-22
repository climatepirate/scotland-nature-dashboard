export function createDependencyMapPanel() {
  const panel = document.createElement("section");
  panel.className = "panel";

  panel.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Ecosystem Dependency Map</h2>
      <p class="panel-subtitle">Mean Ecosystem Service Dependency - filter for individual services</p>
    </div>
    <div class="map-panel-shell">
      <div id="ecosystem-dependency-map" class="map-canvas" aria-label="Ecosystem dependency map"></div>
    </div>
    <div class="map-selector-shell">
      <label class="map-selector-label" for="ecosystem-dependency-service-select">Ecosystem service</label>
      <select id="ecosystem-dependency-service-select" class="map-selector-input" aria-label="Ecosystem service"></select>
    </div>
  `;

  return panel;
}
