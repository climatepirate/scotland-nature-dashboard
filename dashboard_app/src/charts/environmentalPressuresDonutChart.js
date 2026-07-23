import { fetchDashboardDataJson } from "../config/dataAssetLoader.js";

const DONUT_CONTAINER_ID = "environmental-pressures-donut";
const EXCLUDED_PRESSURE_LABELS = new Set(["All ecosystem pressures"]);

function buildPressureCounts(indexRows) {
  const totalsByPressure = new Map();

  indexRows.forEach((row) => {
    const localAuthorityCode = String(row?.local_authority_code || "").trim();
    const pressureLabel = String(row?.pressure_label || "").trim();
    const companyCount = Number(row?.company_count || 0);

    if (localAuthorityCode !== "All Scotland" || !pressureLabel || !Number.isFinite(companyCount) || companyCount <= 0) {
      return;
    }

    if (EXCLUDED_PRESSURE_LABELS.has(pressureLabel)) {
      return;
    }

    totalsByPressure.set(pressureLabel, (totalsByPressure.get(pressureLabel) || 0) + companyCount);
  });

  return [...totalsByPressure.entries()]
    .map(([pressure, count]) => ({ pressure, count }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.pressure.localeCompare(b.pressure));
}

function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function createDonutPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

function colorForIndex(index, total) {
  const hue = ((index * 360) / Math.max(total, 1) + 14) % 360;
  return `hsl(${hue.toFixed(1)} 48% 53%)`;
}

function renderDonut(container, pressureCounts) {
  const total = pressureCounts.reduce((sum, entry) => sum + entry.count, 0);
  if (!total) {
    container.textContent = "No environmental pressure data available.";
    return;
  }

  const size = 235;
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = 98;
  const innerRadius = 60;

  container.textContent = "";

  const wrapper = document.createElement("div");
  wrapper.className = "glossary-donut-wrap";

  const tooltip = document.createElement("div");
  tooltip.className = "glossary-donut-tooltip";
  tooltip.setAttribute("role", "status");
  tooltip.setAttribute("aria-live", "polite");
  tooltip.hidden = true;

  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "glossary-donut-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Donut chart showing environmental pressure proportions");

  const showTooltip = (event, text) => {
    tooltip.textContent = text;
    tooltip.hidden = false;

    const rect = wrapper.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    tooltip.style.left = `${x + 14}px`;
    tooltip.style.top = `${y - 14}px`;
  };

  const hideTooltip = () => {
    tooltip.hidden = true;
  };

  let currentAngle = 0;
  pressureCounts.forEach((entry, index) => {
    const sliceAngle = (entry.count / total) * 360;
    const endAngle = currentAngle + sliceAngle;

    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", createDonutPath(cx, cy, outerRadius, innerRadius, currentAngle, endAngle));
    path.setAttribute("fill", colorForIndex(index, pressureCounts.length));
    path.setAttribute("stroke", "#ffffff");
    path.setAttribute("stroke-width", "1.5");

    const title = document.createElementNS(svgNamespace, "title");
    const percent = ((entry.count / total) * 100).toFixed(1);
    const tooltipText = `${entry.pressure}: ${percent}%`;
    title.textContent = tooltipText;
    path.append(title);

    path.style.cursor = "pointer";
    path.addEventListener("mouseenter", (event) => {
      showTooltip(event, tooltipText);
    });
    path.addEventListener("mousemove", (event) => {
      showTooltip(event, tooltipText);
    });
    path.addEventListener("mouseleave", hideTooltip);
    path.addEventListener("blur", hideTooltip);

    svg.append(path);
    currentAngle = endAngle;
  });

  const centerLabel = document.createElementNS(svgNamespace, "text");
  centerLabel.setAttribute("x", String(cx));
  centerLabel.setAttribute("y", String(cy - 7));
  centerLabel.setAttribute("text-anchor", "middle");
  centerLabel.setAttribute("class", "glossary-donut-center-title");
  centerLabel.textContent = "Pressures";

  const centerValue = document.createElementNS(svgNamespace, "text");
  centerValue.setAttribute("x", String(cx));
  centerValue.setAttribute("y", String(cy + 14));
  centerValue.setAttribute("text-anchor", "middle");
  centerValue.setAttribute("class", "glossary-donut-center-value");
  centerValue.textContent = String(pressureCounts.length);

  svg.append(centerLabel, centerValue);

  wrapper.append(svg, tooltip);
  container.replaceChildren(wrapper);
}

export async function initEnvironmentalPressuresDonutChart() {
  const container = document.getElementById(DONUT_CONTAINER_ID);
  if (!container) {
    return;
  }

  container.textContent = "Loading...";

  try {
    const indexPayload = await fetchDashboardDataJson(
      "pressure_ridgeline_index.json",
      "environmental pressure index",
    );

    const rows = Array.isArray(indexPayload?.records) ? indexPayload.records : [];
    const pressureCounts = buildPressureCounts(rows);
    renderDonut(container, pressureCounts);
  } catch (error) {
    console.error("[Environmental Pressures Donut] Failed to render", error?.message || error);
    container.textContent = "Unable to load environmental pressure donut.";
  }
}
