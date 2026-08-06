export function createDependencyTotalServicePanel() {
  const panel = document.createElement("section");
  panel.className = "panel";

  panel.innerHTML = `
    <div class="panel-head dependency-total-service-head">
      <h3 class="panel-title dependency-total-service-title">Ecosystem Services by Total Score (All businesses)</h3>
      <p class="panel-subtitle dependency-total-service-subtitle">Top 5 services shown by default</p>
      <p id="dependency-total-service-la-subtitle" class="panel-subtitle dependency-total-service-la-subtitle">Scotland-wide results</p>
    </div>
    <div class="dependency-total-service-shell">
      <p id="dependency-total-service-status" class="dependency-total-service-status">Loading dependency totals…</p>
      <div id="dependency-total-service-chart" class="dependency-total-service-chart" aria-label="Horizontal bar chart of total dependency by ecosystem service"></div>
      <button
        id="dependency-total-service-toggle"
        class="dependency-total-service-toggle"
        type="button"
        hidden
        aria-expanded="false"
      >
        Show all ecosystem services
      </button>
    </div>
  `;

  return panel;
}
