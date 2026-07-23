import { loadNatureFinanceSharedRows } from "../data/natureFinanceSharedDataset.js";

const COARSE_COLORS = {
  "Consumer & Visitor Economy": "#3d8a95",
  "Primary & Resource Industries": "#d18b2f",
  "Public & Community Services": "#6c9b57",
  Unclassified: "#8a8f99",
};

function formatOutput(value) {
  return `£${Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}bn`;
}

function formatEmployment(value) {
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} FTE`;
}

function formatOneDecimal(value) {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function shortSectorLabel(fullLabel) {
  const map = {
    "Electricity, gas, steam and air conditioning supply": "Electricity & Gas",
    "Agriculture, forestry and fishing": "Agriculture",
    Manufacturing: "Manufacturing",
    "Water supply; sewerage, waste management and remediation activities": "Water & Sewage",
    "Human health and social work activities": "Health & Social Work",
    "Accommodation and food service activities": "Accommodation & Food",
    "Wholesale and retail trade; repair of motor vehicles and motorcycles": "Wholesale & Retail",
    "Public administration and defence; compulsory social security": "Public Admin",
    Education: "Education",
  };
  return map[fullLabel] || fullLabel;
}

function bubbleRadiusFactory(values, minRadius = 8, maxRadius = 28) {
  const safe = values.filter((value) => Number.isFinite(value) && value > 0);
  const minValue = Math.min(...safe);
  const maxValue = Math.max(...safe);

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || minValue === maxValue) {
    return () => (minRadius + maxRadius) / 2;
  }

  const minArea = Math.PI * (minRadius ** 2);
  const maxArea = Math.PI * (maxRadius ** 2);

  return (value) => {
    const clamped = Math.max(minValue, Math.min(maxValue, Number(value) || minValue));
    const t = (clamped - minValue) / (maxValue - minValue);
    const area = minArea + (t * (maxArea - minArea));
    return Math.sqrt(area / Math.PI);
  };
}

function showTooltip(tooltip, x, y, row) {
  const warning = row.coverageStatus === "partial" || row.coverageStatus === "uncertain"
    ? `<div class="nature-finance-tooltip-warning">Coverage: ${row.coverageNote}</div>`
    : "";

  tooltip.innerHTML = `
    <div class="nature-finance-tooltip-title">${row.sectorLabel}</div>
    <div class="nature-finance-tooltip-line"><strong>Category:</strong> ${row.coarseCategory}</div>
    <div class="nature-finance-tooltip-line"><strong>Output:</strong> ${formatOutput(row.annualOutputBn)}</div>
    <div class="nature-finance-tooltip-line"><strong>Employment:</strong> ${formatEmployment(row.employmentFte)}</div>
    <div class="nature-finance-tooltip-line"><strong>Normalised vulnerability:</strong> ${formatOneDecimal(row.vulnerabilityNormalised)}</div>
    <div class="nature-finance-tooltip-line"><strong>Economic Exposure Index:</strong> ${formatOneDecimal(row.economicExposureIndex)}</div>
    <div class="nature-finance-tooltip-line"><strong>Coverage status:</strong> ${row.coverageStatus}</div>
    ${warning}
  `;

  tooltip.hidden = false;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function hideTooltip(tooltip) {
  tooltip.hidden = true;
}

function createSvgEl(tagName, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });
  return node;
}

function renderSizeLegend(container, rows, radiusFor) {
  const sorted = [...rows].sort((a, b) => a.employmentFte - b.employmentFte);
  const picks = [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]].filter(Boolean);
  const unique = [];
  const seen = new Set();
  picks.forEach((row) => {
    const key = `${row.employmentFte}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(row);
    }
  });

  const items = unique.map((row) => {
    const r = radiusFor(row.employmentFte);
    return `
      <span class="nature-finance-size-legend-item">
        <span class="nature-finance-size-legend-circle" style="width:${(r * 2).toFixed(1)}px;height:${(r * 2).toFixed(1)}px"></span>
        <span>${formatEmployment(row.employmentFte)}</span>
      </span>
    `;
  }).join("");

  container.innerHTML = `<div class="nature-finance-size-legend-title">Bubble size: employment</div>${items}`;
}

function renderChart(root, rows) {
  root.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "nature-finance-bubble-wrap";

  const tooltip = document.createElement("div");
  tooltip.className = "nature-finance-bubble-tooltip";
  tooltip.hidden = true;

  const svg = createSvgEl("svg", {
    class: "nature-finance-bubble-svg",
    viewBox: "0 0 860 420",
    role: "img",
    "aria-label": "Bubble chart of Scottish annual output, normalised vulnerability and employment by ISIC sector",
  });

  const margin = { top: 34, right: 18, bottom: 62, left: 82 };
  const width = 860;
  const height = 420;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const minOutput = Math.min(...rows.map((row) => row.annualOutputBn));
  const maxOutput = Math.max(...rows.map((row) => row.annualOutputBn));

  const xPad = Math.max(0.2, (maxOutput - minOutput) * 0.08);
  const xMin = minOutput - xPad;
  const xMax = maxOutput + xPad;

  const xScale = (value) => margin.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
  const yScale = (value) => margin.top + ((100 - value) / 100) * plotHeight;

  const radiusFor = bubbleRadiusFactory(rows.map((row) => row.employmentFte));

  svg.append(
    createSvgEl("line", {
      x1: margin.left,
      y1: margin.top + plotHeight,
      x2: margin.left + plotWidth,
      y2: margin.top + plotHeight,
      class: "scatter-axis-line",
    }),
    createSvgEl("line", {
      x1: margin.left,
      y1: margin.top,
      x2: margin.left,
      y2: margin.top + plotHeight,
      class: "scatter-axis-line",
    })
  );

  [0, 25, 50, 75, 100].forEach((tick) => {
    const y = yScale(tick);
    svg.append(
      createSvgEl("line", {
        x1: margin.left,
        y1: y,
        x2: margin.left + plotWidth,
        y2: y,
        class: "nature-finance-grid-line",
      })
    );

    const t = createSvgEl("text", {
      x: margin.left - 8,
      y: y + 4,
      class: "nature-finance-axis-tick",
      "text-anchor": "end",
    });
    t.textContent = String(tick);
    svg.append(t);
  });

  [xMin, (xMin + xMax) / 2, xMax].forEach((tick) => {
    const x = xScale(tick);
    const t = createSvgEl("text", {
      x,
      y: margin.top + plotHeight + 20,
      class: "nature-finance-axis-tick",
      "text-anchor": "middle",
    });
    t.textContent = formatOutput(tick).replace("bn", "");
    svg.append(t);
  });

  rows.forEach((row, index) => {
    const x = xScale(row.annualOutputBn);
    const y = yScale(row.vulnerabilityNormalised);
    const r = radiusFor(row.employmentFte);
    const color = COARSE_COLORS[row.coarseCategory] || COARSE_COLORS.Unclassified;

    const circle = createSvgEl("circle", {
      cx: x,
      cy: y,
      r,
      fill: color,
      class: "nature-finance-bubble-point",
      "data-sector-key": row.sectorKey,
      tabindex: "0",
    });

    circle.addEventListener("mouseenter", (event) => {
      const rect = wrap.getBoundingClientRect();
      showTooltip(tooltip, event.clientX - rect.left + 12, event.clientY - rect.top - 12, row);
    });
    circle.addEventListener("mousemove", (event) => {
      const rect = wrap.getBoundingClientRect();
      showTooltip(tooltip, event.clientX - rect.left + 12, event.clientY - rect.top - 12, row);
    });
    circle.addEventListener("mouseleave", () => hideTooltip(tooltip));
    circle.addEventListener("focus", () => showTooltip(tooltip, x + 12, y - 12, row));
    circle.addEventListener("blur", () => hideTooltip(tooltip));
    circle.addEventListener("click", () => {
      svg.querySelectorAll(".nature-finance-bubble-point.is-selected").forEach((node) => node.classList.remove("is-selected"));
      circle.classList.add("is-selected");
    });

    svg.append(circle);

    const label = createSvgEl("text", {
      x: x + r + 6,
      y: y - ((index % 2) * 10),
      class: "nature-finance-bubble-label",
    });
    label.textContent = shortSectorLabel(row.sectorLabel);
    svg.append(label);
  });

  const xAxisLabel = createSvgEl("text", {
    x: margin.left + (plotWidth / 2),
    y: height - 14,
    class: "scatter-axis-title scatter-axis-title--x",
  });
  xAxisLabel.textContent = "Scottish annual output (£bn)";

  const yAxisLabel = createSvgEl("text", {
    x: 18,
    y: margin.top + (plotHeight / 2),
    transform: `rotate(-90, 18, ${margin.top + (plotHeight / 2)})`,
    class: "scatter-axis-title scatter-axis-title--y",
    "text-anchor": "middle",
    "dominant-baseline": "middle",
  });
  yAxisLabel.textContent = "Normalised nature vulnerability (0-100)";

  svg.append(xAxisLabel, yAxisLabel);

  const legend = document.createElement("div");
  legend.className = "nature-finance-bubble-legend";
  legend.innerHTML = Object.entries(COARSE_COLORS)
    .filter(([name]) => name !== "Unclassified")
    .map(([name, color]) => `
      <span class="nature-finance-bubble-legend-item">
        <span class="nature-finance-bubble-legend-swatch" style="background:${color}"></span>
        <span>${name}</span>
      </span>
    `)
    .join("");

  const sizeLegend = document.createElement("div");
  sizeLegend.className = "nature-finance-size-legend";
  renderSizeLegend(sizeLegend, rows, radiusFor);

  wrap.append(svg, tooltip);
  root.append(wrap, legend, sizeLegend);
}

export function initNatureFinanceBubbleChart() {
  const chartRoot = document.getElementById("nature-finance-bubble-chart");
  const emptyState = document.getElementById("nature-finance-bubble-empty");

  if (!chartRoot) {
    return;
  }

  loadNatureFinanceSharedRows()
    .then((rows) => {
      if (!Array.isArray(rows) || rows.length !== 9) {
        chartRoot.innerHTML = '<div class="nature-finance-empty-state">Expected 9 matched sectors for this chart.</div>';
        return;
      }

      if (emptyState) {
        emptyState.remove();
      }

      renderChart(chartRoot, rows);
    })
    .catch((error) => {
      chartRoot.innerHTML = `<div class="nature-finance-empty-state">Unable to load bubble chart: ${error?.message || error}</div>`;
    });
}
