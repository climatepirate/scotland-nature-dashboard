export function createDependencyMapPanel() {
  const panel = document.createElement("section");
  panel.className = "panel";

  panel.innerHTML = `
    <div class="panel-head">
      <div class="overall-context-map-title-row">
        <h2 class="panel-title">Ecosystem Dependency Map</h2>
        <span class="statistics-info-popover-shell overall-context-info-shell">
          <button type="button" class="statistics-info-trigger" aria-label="Show ecosystem dependency map information">i</button>
          <span class="statistics-info-popover overall-context-info-popover" role="tooltip">The dependency and pressure maps show mean score per hex so as to not be impacted by varying company concentrations. This allows for visibility of dependency and pressure hotspots.</span>
        </span>
      </div>
      <p class="panel-subtitle">Mean Ecosystem Service Dependency from ENCORE Scoring - filter for individual services</p>
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
