import { getStatisticsSnapshot } from "../data/statisticsData.js";
import { getState, subscribe } from "../state/state.js";

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function formatCount(value) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function createMetricCard(label, role, wide = false) {
  return `
    <article class="statistics-metric-card${wide ? " statistics-metric-card--wide" : ""}">
      <span class="statistics-metric-label">${label}</span>
      <span class="statistics-metric-value" data-role="${role}">—</span>
    </article>
  `;
}

function buildBarLegendItem(segment, color) {
  return `
    <div class="statistics-bar-legend-item">
      <span class="statistics-bar-legend-swatch" style="background:${color};"></span>
      <span class="statistics-bar-legend-text">${segment.category}</span>
      <span class="statistics-bar-legend-count">${formatCount(segment.count)}</span>
    </div>
  `;
}

export function createStatisticsPanel() {
  const panel = document.createElement("section");
  panel.className = "panel statistics-panel";
  panel.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Statistics</h2>
      <p class="panel-subtitle">Current summary for the shared location and category filters</p>
    </div>
    <div class="statistics-panel-body">
      <div class="statistics-status" data-role="status">Loading dashboard statistics…</div>
      <div class="statistics-grid">
        ${createMetricCard("Location", "location")}
        ${createMetricCard("Businesses Included", "businesses")}
        ${createMetricCard("Moderate–Very High Dependency", "dependency")}
        ${createMetricCard("Moderate–Very High Pressure", "pressure")}
        ${createMetricCard("Most Depended-on Ecosystem Service", "service", true)}
      </div>
      <div class="statistics-composition-block">
        <div class="statistics-composition-head">
          <span class="statistics-composition-label">Coarse Category composition</span>
          <span class="statistics-composition-total" data-role="composition-total">0 businesses</span>
        </div>
        <div class="statistics-bar-track" data-role="bar-track" aria-label="Coarse category composition"></div>
        <div class="statistics-bar-legend" data-role="bar-legend"></div>
      </div>
    </div>
  `;

  const statusNode = panel.querySelector('[data-role="status"]');
  const locationNode = panel.querySelector('[data-role="location"]');
  const businessesNode = panel.querySelector('[data-role="businesses"]');
  const dependencyNode = panel.querySelector('[data-role="dependency"]');
  const pressureNode = panel.querySelector('[data-role="pressure"]');
  const serviceNode = panel.querySelector('[data-role="service"]');
  const compositionTotalNode = panel.querySelector('[data-role="composition-total"]');
  const barTrackNode = panel.querySelector('[data-role="bar-track"]');
  const barLegendNode = panel.querySelector('[data-role="bar-legend"]');

  const categoryColors = {
    "Business & Property Services": "#6b6fae",
    "Consumer & Visitor Economy": "#3d8a95",
    "Primary & Resource Industries": "#d18b2f",
    "Public & Community Services": "#6c9b57",
    Unclassified: "#c3cdc8",
  };

  let refreshToken = 0;

  function renderLoading(message) {
    statusNode.textContent = message;
  }

  function renderSnapshot(snapshot) {
    const currentState = getState();
    statusNode.textContent = `Updated for ${snapshot.locationLabel} and ${currentState.coarseCategory}`;
    locationNode.textContent = snapshot.locationLabel;
    businessesNode.textContent = formatCount(snapshot.businessesIncluded);
    dependencyNode.textContent = formatPercent(snapshot.moderateHighDependencyPercent);
    pressureNode.textContent = formatPercent(snapshot.moderateHighPressurePercent);
    serviceNode.textContent = snapshot.mostDependedService;
    compositionTotalNode.textContent = `${formatCount(snapshot.businessesIncluded)} businesses`;

    const totalWidth = snapshot.categorySegments.reduce((sum, segment) => sum + segment.share, 0);
    barTrackNode.innerHTML = snapshot.categorySegments.map((segment) => {
      const width = totalWidth > 0 ? segment.share : 0;
      const color = categoryColors[segment.category] || "#8aa19b";
      return `<div class="statistics-bar-segment" title="${segment.category}: ${formatCount(segment.count)} (${segment.share.toFixed(1)}%)" style="width:${width}%;background:${color};"></div>`;
    }).join("") || '<div class="statistics-bar-segment statistics-bar-segment--empty"></div>';

    barLegendNode.innerHTML = snapshot.categorySegments.map((segment) => buildBarLegendItem(segment, categoryColors[segment.category] || "#8aa19b")).join("");
  }

  async function refresh() {
    const token = ++refreshToken;
    const state = getState();

    try {
      renderLoading("Loading dashboard statistics…");
      const snapshot = await getStatisticsSnapshot(state);
      if (token !== refreshToken) {
        return;
      }

      renderSnapshot(snapshot);
    } catch (error) {
      if (token !== refreshToken) {
        return;
      }

      statusNode.textContent = `Statistics unavailable: ${error.message}`;
      locationNode.textContent = "—";
      businessesNode.textContent = "—";
      dependencyNode.textContent = "—";
      pressureNode.textContent = "—";
      serviceNode.textContent = "—";
      compositionTotalNode.textContent = "0 businesses";
      barTrackNode.innerHTML = '<div class="statistics-bar-segment statistics-bar-segment--empty"></div>';
      barLegendNode.innerHTML = "";
    }
  }

  subscribe(() => {
    refresh();
  });

  refresh();
  return panel;
}
