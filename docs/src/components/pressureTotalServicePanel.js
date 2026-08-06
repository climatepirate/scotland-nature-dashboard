export function createPressureTotalServicePanel() {
  const panel = document.createElement("section");
  panel.className = "panel";

  panel.innerHTML = `
    <div class="panel-head pressure-total-service-head">
      <h3 class="panel-title pressure-total-service-title">Environmental Pressures by Total Score (All businesses)</h3>
      <p class="panel-subtitle pressure-total-service-subtitle">Top 5 pressures shown by default</p>
      <p id="pressure-total-service-la-subtitle" class="panel-subtitle pressure-total-service-la-subtitle">Scotland-wide results</p>
    </div>
    <div class="pressure-total-service-shell">
      <p id="pressure-total-service-status" class="pressure-total-service-status">Loading pressure totals…</p>
      <div id="pressure-total-service-chart" class="pressure-total-service-chart" aria-label="Horizontal bar chart of total pressure by pressure type"></div>
      <button
        id="pressure-total-service-toggle"
        class="pressure-total-service-toggle"
        type="button"
        hidden
        aria-expanded="false"
      >
        Show all pressure types
      </button>
    </div>
  `;

  return panel;
}
