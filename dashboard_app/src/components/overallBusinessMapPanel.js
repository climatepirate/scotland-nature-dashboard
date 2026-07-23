export function createOverallBusinessMapPanel() {
  const panel = document.createElement("section");
  panel.className = "panel";

  panel.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Scottish Context Map</h2>
      <p class="panel-subtitle">Concentration of Scottish Companies and Contextual Layers</p>
    </div>
    <div class="map-panel-shell">
      <div id="overall-business-map" class="map-canvas" aria-label="Scottish Context Map"></div>
    </div>
    <div class="map-selector-row">
      <div class="map-selector-shell">
        <label class="map-selector-label">Business data layer</label>
        <div class="map-selector-input map-selector-input--static" aria-label="Business data layer">Company Concentration</div>
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
