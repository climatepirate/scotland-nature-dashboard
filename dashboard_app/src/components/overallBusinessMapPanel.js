export function createOverallBusinessMapPanel() {
  const panel = document.createElement("section");
  panel.className = "panel";

  panel.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Overall Business Map</h2>
      <p class="panel-subtitle">Initial interactive basemap for Scotland (no thematic layers yet)</p>
    </div>
    <div class="map-panel-shell">
      <div id="overall-business-map" class="map-canvas" aria-label="Overall business map"></div>
    </div>
    <div class="map-selector-row">
      <div class="map-selector-shell">
        <label class="map-selector-label" for="overall-business-layer-select">Business data layer</label>
        <select id="overall-business-layer-select" class="map-selector-input" aria-label="Business data layer">
          <option value="Company Concentration" selected>Company Concentration</option>
          <option value="Total Dependency">Total Dependency</option>
          <option value="Total Pressure">Total Pressure</option>
        </select>
      </div>
      <div class="map-selector-shell">
        <label class="map-selector-label" for="overall-context-layer-select">Context layer</label>
        <select id="overall-context-layer-select" class="map-selector-input" aria-label="Context layer">
          <option value="None" selected>None</option>
          <option value="National Parks">National Parks</option>
          <option value="National Nature Reserves">National Nature Reserves</option>
          <option value="Sites of Special Scientific Interest (SSSI)">Sites of Special Scientific Interest (SSSI)</option>
          <option value="Wild Land Areas">Wild Land Areas</option>
          <option value="World Heritage Sites">World Heritage Sites</option>
        </select>
      </div>
    </div>
  `;

  return panel;
}
