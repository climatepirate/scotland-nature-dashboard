export function createDependencyRidgelinePanel() {
  const panel = document.createElement("section");
  panel.className = "panel dependency-ridgeline-panel";

  panel.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Dependency score distribution by coarse business category</h2>
      <p class="panel-subtitle" id="dependency-ridgeline-subtitle">Selected ecosystem service: Air filtration</p>
    </div>
    <div class="dependency-ridgeline-body">
      <p class="dependency-ridgeline-note">Density shows the relative distribution of company scores within each category.</p>
      <div class="dependency-ridgeline-status" id="dependency-ridgeline-status">Loading dependency distribution…</div>
      <div class="dependency-ridgeline-chart-wrap">
        <svg id="dependency-ridgeline-chart" class="dependency-ridgeline-chart" role="img" aria-label="Dependency score distribution ridgeline chart"></svg>
        <div id="dependency-ridgeline-tooltip" class="dependency-ridgeline-tooltip" hidden></div>
      </div>
    </div>
  `;

  return panel;
}