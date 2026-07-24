export function createPressureRidgelinePanel() {
  const panel = document.createElement("section");
  panel.className = "panel dependency-ridgeline-panel";

  panel.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Pressure Score Distribution by Coarse Business Category</h2>
      <p class="panel-subtitle" id="pressure-ridgeline-subtitle">Selected ecosystem pressure: All ecosystem pressures</p>
    </div>
    <div class="dependency-ridgeline-body">
      <p class="dependency-ridgeline-note">Density shows the relative distribution of company scores within each category.</p>
      <div class="dependency-ridgeline-status" id="pressure-ridgeline-status">Loading pressure distribution...</div>
      <div class="dependency-ridgeline-chart-wrap">
        <svg id="pressure-ridgeline-chart" class="dependency-ridgeline-chart" role="img" aria-label="Pressure score distribution ridgeline chart"></svg>
        <div id="pressure-ridgeline-tooltip" class="dependency-ridgeline-tooltip" hidden></div>
      </div>
    </div>
  `;

  return panel;
}
