import { getStatisticsSnapshot } from "../data/statisticsData.js";
import { getState, subscribe } from "../state/state.js";

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function formatCount(value) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatOrdinal(value) {
  const absoluteValue = Math.abs(Number(value));
  const remainder100 = absoluteValue % 100;

  if (remainder100 >= 11 && remainder100 <= 13) {
    return `${value}th`;
  }

  switch (absoluteValue % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function formatAuthorityLeaders(authorityNames) {
  if (!Array.isArray(authorityNames) || authorityNames.length === 0) {
    return "";
  }

  if (authorityNames.length === 1) {
    return authorityNames[0];
  }

  if (authorityNames.length === 2) {
    return `${authorityNames[0]} and ${authorityNames[1]}`;
  }

  if (authorityNames.length === 3) {
    return `${authorityNames[0]}, ${authorityNames[1]} and ${authorityNames[2]}`;
  }

  return `${authorityNames[0]}, ${authorityNames[1]} and ${authorityNames.length - 2} others`;
}

function createMetricCard(label, role, wide = false, infoText = "", infoPopoverClass = "", withRank = false) {
  const infoMarkup = infoText
    ? `
      <span class="statistics-info-popover-shell">
        <button type="button" class="statistics-info-trigger" aria-label="Show additional information">i</button>
        <span class="statistics-info-popover${infoPopoverClass ? ` ${infoPopoverClass}` : ""}" role="tooltip">${infoText}</span>
      </span>
    `
    : "";

  const valueMarkup = withRank
    ? `
      <div class="statistics-metric-value-row">
        <span class="statistics-metric-value" data-role="${role}">—</span>
        <span class="statistics-metric-rank" data-role="${role}-rank" hidden></span>
      </div>
    `
    : `<span class="statistics-metric-value" data-role="${role}">—</span>`;

  return `
    <article class="statistics-metric-card${wide ? " statistics-metric-card--wide" : ""}">
      <div class="statistics-metric-title-row">
        <span class="statistics-metric-label">${label}</span>
        ${infoMarkup}
      </div>
      ${valueMarkup}
    </article>
  `;
}

function renderMetricContext(node, context) {
  if (!node) {
    return;
  }

  node.hidden = true;
  node.textContent = "";
  node.removeAttribute("aria-label");
  node.removeAttribute("title");

  if (!context) {
    return;
  }

  if (context.mode === "rank") {
    const { ranking, label } = context;
    if (!ranking || !Number.isFinite(ranking.rank) || !Number.isFinite(ranking.totalAuthorities) || ranking.totalAuthorities <= 0) {
      return;
    }

    const rankText = `${formatOrdinal(ranking.rank)} of ${formatCount(ranking.totalAuthorities)} local authorities`;
    node.hidden = false;
    node.textContent = rankText;
    node.setAttribute("aria-label", `${label} rank: ${rankText}`);
    node.setAttribute("title", rankText);
    return;
  }

  if (context.mode === "leader") {
    const { label, description, leaders } = context;
    const authorityNames = Array.isArray(leaders)
      ? leaders.map((leader) => leader.localAuthorityLabel).filter(Boolean)
      : [];
    const leaderText = formatAuthorityLeaders(authorityNames);

    if (!leaderText) {
      return;
    }

    const visibleText = `${label}: ${leaderText}`;
    node.hidden = false;
    node.textContent = visibleText;
    node.setAttribute("aria-label", `${description}: ${leaderText}.`);
    node.setAttribute("title", visibleText);
    return;
  }

  if (context.mode === "hidden") {
    node.hidden = true;
    return;
  }
}

function buildMetricContext(metric, currentState, ranking) {
  const isAllScotland = !currentState.localAuthorityCode || currentState.localAuthorityCode === "All Scotland";

  if (isAllScotland) {
    if (metric === "dependency") {
      return {
        mode: "leader",
        label: "Most dependent (share of companies)",
        description: "Local authority with the highest proportion of businesses with Moderate to Very High nature dependency",
        leaders: ranking?.leaders || [],
      };
    }

    return {
      mode: "leader",
      label: "Highest pressure (share of companies)",
      description: "Local authority with the highest proportion of businesses with Moderate to Very High pressure on nature",
      leaders: ranking?.leaders || [],
    };
  }

  return {
    mode: "rank",
    label: metric === "dependency" ? "Dependency" : "Pressure",
    ranking,
  };
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
    </div>
    <div class="statistics-panel-body">
      <div class="statistics-status" data-role="status">Loading dashboard statistics…</div>
      <div class="statistics-grid">
        ${createMetricCard("Location", "location")}
        ${createMetricCard(
          "Businesses Included",
          "businesses",
          false,
          "All businesses included are from Companies House data, there are a number of sole trader and other non-companies-house-registered companies not included in this study.",
          "statistics-info-popover--left"
        )}
        ${createMetricCard("Moderate–Very High Dependency on Nature", "dependency", false, "", "", true)}
        ${createMetricCard("Moderate–Very High Pressure on Nature", "pressure", false, "", "", true)}
        ${createMetricCard("Most Depended-on Ecosystem Service", "service", true)}
      </div>
      <div class="statistics-composition-block">
        <div class="statistics-composition-head">
          <span class="statistics-composition-label">Coarse Category Composition</span>
          <span class="statistics-composition-total" data-role="composition-total">0 businesses</span>
        </div>
        <div class="statistics-bar-track" data-role="bar-track" aria-label="Coarse category composition"></div>
        <div class="statistics-bar-legend" data-role="bar-legend"></div>
        <div class="statistics-composition-info-shell">
          <button type="button" class="statistics-info-trigger" aria-label="Show coarse category composition information">i</button>
          <span class="statistics-info-popover" role="tooltip">Unclassified companies are those that are dormant or do not have a SIC number registered.</span>
        </div>
      </div>
    </div>
  `;

  const statusNode = panel.querySelector('[data-role="status"]');
  const locationNode = panel.querySelector('[data-role="location"]');
  const businessesNode = panel.querySelector('[data-role="businesses"]');
  const dependencyNode = panel.querySelector('[data-role="dependency"]');
  const dependencyContextNode = panel.querySelector('[data-role="dependency-rank"]');
  const pressureNode = panel.querySelector('[data-role="pressure"]');
  const pressureContextNode = panel.querySelector('[data-role="pressure-rank"]');
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
    statusNode.textContent = `Updated summary for ${snapshot.locationLabel} and ${currentState.coarseCategory}`;
    locationNode.textContent = snapshot.locationLabel;
    businessesNode.textContent = formatCount(snapshot.businessesIncluded);
    dependencyNode.textContent = formatPercent(snapshot.moderateHighDependencyPercent);
    renderMetricContext(dependencyContextNode, buildMetricContext("dependency", currentState, snapshot.dependencyRanking));
    pressureNode.textContent = formatPercent(snapshot.moderateHighPressurePercent);
    renderMetricContext(pressureContextNode, buildMetricContext("pressure", currentState, snapshot.pressureRanking));
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
      renderMetricContext(dependencyContextNode, { mode: "hidden" });
      pressureNode.textContent = "—";
      renderMetricContext(pressureContextNode, { mode: "hidden" });
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
