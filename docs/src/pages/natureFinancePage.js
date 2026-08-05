import { loadNatureFinanceSharedRows } from "../data/natureFinanceSharedDataset.js?v=3";

const DEFAULT_SECTOR_PALETTE = [
  "#2f7bbd",
  "#f05a5a",
  "#f29e2e",
  "#2ca58d",
  "#8e63ce",
  "#e15f9a",
  "#4b8b3b",
  "#d98f2b",
  "#3f78d4",
  "#c94f4f",
];

const PRIMARY_RESOURCE_PALETTE = [
  "#0f766e",
  "#d97706",
  "#0284c7",
  "#65a30d",
  "#ef4444",
  "#7c3aed",
  "#14b8a6",
  "#f59e0b",
  "#dc2626",
  "#2563eb",
  "#84cc16",
  "#f97316",
];

function shortenSectorLabel(label) {
  const map = {
    "Electricity, gas, steam and air conditioning supply": "Electricity, gas, steam and air...",
    "Water supply; sewerage, waste management and remediation activities": "Waste management and remediation",
    "Accommodation and food service activities": "Accomodation and food services",
    "Wholesale and retail trade; repair of motor vehicles and motorcycles": "Repair of motor vehicles and motorcycles",
    "Public administration and defence; compulsory social security": "Public administration and defence...",
  };

  return map[label] || label;
}

function buildIsicSectionColorMap(rows) {
  const sectors = [...new Set(rows.map((row) => String(row?.sectorLabel || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const usePrimaryResourcePalette = rows.some((row) => row.coarseCategory === "Primary & Resource Industries");
  const palette = usePrimaryResourcePalette ? PRIMARY_RESOURCE_PALETTE : DEFAULT_SECTOR_PALETTE;
  const colorMap = new Map();

  sectors.forEach((sector, index) => {
    colorMap.set(sector, palette[index % palette.length]);
  });

  return colorMap;
}

function renderResponsiveBarChart(container, rows, options) {
  const { valueKey, valueFormatter, axisLabel, tickFormatter, leftMargin, rightMargin, yAxisTitle } = options;
  const safeRows = [...rows]
    .filter((row) => Number.isFinite(row?.[valueKey]) && row[valueKey] > 0)
    .slice(0, 9);

  if (!safeRows.length) {
    container.innerHTML = '<div class="nature-finance-empty-state">No data available.</div>';
    return;
  }

  const renderChart = () => {
    const chartWidth = Math.max(320, Math.floor(container.clientWidth || 560));
    const chartHeight = 320;
    const padding = { top: 24, right: rightMargin, bottom: 128, left: leftMargin };
    const plotWidth = Math.max(220, chartWidth - padding.left - padding.right);
    const plotHeight = chartHeight - padding.top - padding.bottom;
    const maxValue = Math.max(...safeRows.map((row) => row[valueKey]));
    const gap = 10;
    const barWidth = Math.max(16, (plotWidth - (safeRows.length - 1) * gap) / safeRows.length);
    const plotStartX = padding.left + 8;
    const tickCount = 4;
    const yAxisX = padding.left;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("class", "nature-finance-output-bar-chart");

    const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    yAxis.setAttribute("x1", yAxisX);
    yAxis.setAttribute("x2", yAxisX);
    yAxis.setAttribute("y1", padding.top);
    yAxis.setAttribute("y2", chartHeight - padding.bottom);
    yAxis.setAttribute("class", "nature-finance-grid-line");
    svg.appendChild(yAxis);

    const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    xAxis.setAttribute("x1", yAxisX);
    xAxis.setAttribute("x2", chartWidth - padding.right);
    xAxis.setAttribute("y1", chartHeight - padding.bottom);
    xAxis.setAttribute("y2", chartHeight - padding.bottom);
    xAxis.setAttribute("class", "nature-finance-grid-line");
    svg.appendChild(xAxis);

    for (let i = 0; i <= tickCount; i += 1) {
      const tickValue = maxValue * (i / tickCount);
      const tickY = chartHeight - padding.bottom - (plotHeight * i / tickCount);

      const tickLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tickLine.setAttribute("x1", yAxisX - 6);
      tickLine.setAttribute("x2", yAxisX);
      tickLine.setAttribute("y1", tickY);
      tickLine.setAttribute("y2", tickY);
      tickLine.setAttribute("class", "nature-finance-grid-line");
      svg.appendChild(tickLine);

      const tickLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tickLabel.setAttribute("x", yAxisX - 8);
      tickLabel.setAttribute("y", tickY + 4);
      tickLabel.setAttribute("class", "nature-finance-axis-tick");
      tickLabel.setAttribute("text-anchor", "end");
      tickLabel.textContent = tickFormatter(tickValue);
      svg.appendChild(tickLabel);
    }

    const sectionColorMap = buildIsicSectionColorMap(safeRows);

    safeRows.forEach((row, index) => {
      const barHeight = (row[valueKey] / maxValue) * plotHeight;
      const x = plotStartX + index * (barWidth + gap);
      const y = chartHeight - padding.bottom - barHeight;
      const fillColor = sectionColorMap.get(row.sectorLabel) || "#8a8f99";

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", barWidth);
      rect.setAttribute("height", barHeight);
      rect.setAttribute("rx", "4");
      rect.setAttribute("fill", fillColor);
      rect.setAttribute("stroke", fillColor);
      rect.setAttribute("stroke-width", "1");
      svg.appendChild(rect);

      const valueLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      valueLabel.setAttribute("x", x + barWidth / 2);
      valueLabel.setAttribute("y", Math.max(20, y - 10));
      valueLabel.setAttribute("class", "nature-finance-bar-value-label");
      valueLabel.setAttribute("text-anchor", "middle");
      valueLabel.textContent = valueFormatter(row[valueKey]);
      svg.appendChild(valueLabel);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", x + barWidth / 2 + 2);
      label.setAttribute("y", chartHeight - padding.bottom + 18);
      label.setAttribute("class", "nature-finance-bar-category-label");
      label.setAttribute("text-anchor", "end");
      label.setAttribute("transform", `rotate(-38 ${x + barWidth / 2 + 2} ${chartHeight - padding.bottom + 30})`);
      label.textContent = shortenSectorLabel(row.sectorLabel);
      svg.appendChild(label);
    });

    const xLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    xLabel.setAttribute("x", plotStartX + (safeRows.length - 1) * (barWidth + gap) + barWidth / 2);
    xLabel.setAttribute("y", chartHeight - 18);
    xLabel.setAttribute("class", "nature-finance-axis-title");
    xLabel.setAttribute("text-anchor", "middle");
    xLabel.textContent = axisLabel;
    svg.appendChild(xLabel);

    const yLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    yLabel.setAttribute("x", 20);
    yLabel.setAttribute("y", padding.top + plotHeight / 2);
    yLabel.setAttribute("class", "nature-finance-axis-title");
    yLabel.setAttribute("transform", `rotate(-90 20 ${padding.top + plotHeight / 2})`);
    yLabel.setAttribute("text-anchor", "middle");
    yLabel.textContent = yAxisTitle;
    svg.appendChild(yLabel);

    container.innerHTML = "";
    container.appendChild(svg);
  };

  renderChart();

  if (typeof ResizeObserver !== "undefined") {
    if (container.__natureFinanceResizeObserver) {
      container.__natureFinanceResizeObserver.disconnect();
    }

    const resizeObserver = new ResizeObserver(() => {
      renderChart();
    });
    resizeObserver.observe(container);
    container.__natureFinanceResizeObserver = resizeObserver;
  }
}

function renderEconomicOutputBarChart(container, rows) {
  const safeRows = [...rows]
    .filter((row) => Number.isFinite(row?.annualOutputBn) && row.annualOutputBn > 0)
    .slice(0, 9);

  renderResponsiveBarChart(container, safeRows, {
    valueKey: "annualOutputBn",
    valueFormatter: (value) => `${value.toFixed(1)}bn`,
    tickFormatter: (value) => `${value.toFixed(0)}£`,
    axisLabel: "Sector",
    leftMargin: 84,
    rightMargin: 20,
    yAxisTitle: "Annual output (£bn)",
  });
}

function renderEmploymentFteBarChart(container, rows) {
  const safeRows = [...rows]
    .filter((row) => Number.isFinite(row?.employmentFte) && row.employmentFte > 0)
    .sort((a, b) => b.employmentFte - a.employmentFte)
    .slice(0, 9);

  renderResponsiveBarChart(container, safeRows, {
    valueKey: "employmentFte",
    valueFormatter: (value) => `${Math.round(value).toLocaleString()}`,
    tickFormatter: (value) => `${Math.round(value).toLocaleString()}`,
    axisLabel: "Sector",
    leftMargin: 98,
    rightMargin: 20,
    yAxisTitle: "Employment (FTE)",
  });
}

function createKpiCard(label, valueId, detailId) {
  const card = document.createElement("article");
  card.className = "statistics-metric-card nature-finance-kpi-card";
  card.innerHTML = `
    <div class="statistics-metric-label">${label}</div>
    <div id="${valueId}" class="statistics-metric-value nature-finance-kpi-value">&mdash;</div>
    <div id="${detailId}" class="nature-finance-kpi-detail">Placeholder</div>
  `;
  return card;
}

function createSortHeader(label, sortKey) {
  return `
    <th scope="col">
      <button type="button" class="nature-finance-sort-trigger" data-sort-key="${sortKey}" aria-label="Sort by ${label}">
        ${label}
      </button>
    </th>
  `;
}

function createCoverageHeader() {
  return `
    <th scope="col">
      <div class="nature-finance-header-with-info">
        <button type="button" class="nature-finance-sort-trigger" data-sort-key="coverage" aria-label="Sort by Coverage">
          Coverage
        </button>
        <button
          type="button"
          class="nature-finance-coverage-info-trigger"
          data-nature-finance-coverage-info-trigger
          aria-label="Coverage definitions"
          aria-describedby="nature-finance-coverage-info-tooltip"
        >i</button>
      </div>
    </th>
  `;
}

const COVERAGE_INFO_TOOLTIP_HTML = `
  <div class="nature-finance-coverage-info-title">Coverage</div>
  <p class="nature-finance-coverage-info-text">Coverage - how completely the sector is represented by the underlying economic and vulnerability data used to calculate the Economic Exposure Index.</p>
  <ul class="nature-finance-coverage-info-list">
    <li><strong>Full</strong> - The sector has comprehensive supporting data, so the exposure estimate is considered robust.</li>
    <li><strong>Partial</strong> - Only part of the sector could be quantified (for example, some ISIC divisions or economic statistics were unavailable or only partially matched), so the ranking should be interpreted with more caution.</li>
    <li><strong>Uncertain</strong> - The estimate is based on substantial assumptions, proxies, or sparse data, meaning the sector's ranking has relatively low confidence.</li>
  </ul>
`;

function ensureCoverageInfoTooltip() {
  let tooltip = document.getElementById("nature-finance-coverage-info-tooltip");
  if (tooltip) {
    return tooltip;
  }

  tooltip = document.createElement("div");
  tooltip.id = "nature-finance-coverage-info-tooltip";
  tooltip.className = "nature-finance-coverage-info-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.hidden = true;
  tooltip.innerHTML = COVERAGE_INFO_TOOLTIP_HTML;
  document.body.append(tooltip);
  return tooltip;
}

function positionCoverageInfoTooltip(tooltip, clientX, clientY) {
  const margin = 12;
  tooltip.style.left = `${clientX - margin}px`;
  tooltip.style.top = `${clientY - margin}px`;

  const rect = tooltip.getBoundingClientRect();
  let adjustedLeft = clientX - margin;
  let adjustedTop = clientY - margin;

  if (rect.left < 8) {
    adjustedLeft += 8 - rect.left;
  }

  if (rect.top < 8) {
    adjustedTop += 8 - rect.top;
  }

  if (rect.bottom > window.innerHeight - 8) {
    adjustedTop -= rect.bottom - (window.innerHeight - 8);
  }

  tooltip.style.left = `${adjustedLeft}px`;
  tooltip.style.top = `${adjustedTop}px`;
}

function bindCoverageInfoTooltip(scope) {
  const trigger = scope.querySelector("[data-nature-finance-coverage-info-trigger]");
  if (!(trigger instanceof HTMLElement)) {
    return;
  }

  if (trigger.dataset.tooltipBound === "true") {
    return;
  }
  trigger.dataset.tooltipBound = "true";

  const tooltip = ensureCoverageInfoTooltip();

  const show = (clientX, clientY) => {
    tooltip.hidden = false;
    tooltip.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-expanded", "true");
    positionCoverageInfoTooltip(tooltip, clientX, clientY);
  };

  const hide = () => {
    tooltip.hidden = true;
    tooltip.setAttribute("aria-hidden", "true");
    trigger.setAttribute("aria-expanded", "false");
  };

  trigger.addEventListener("mouseenter", (event) => {
    show(event.clientX, event.clientY);
  });

  trigger.addEventListener("mousemove", (event) => {
    show(event.clientX, event.clientY);
  });

  trigger.addEventListener("mouseleave", hide);

  trigger.addEventListener("focus", () => {
    const rect = trigger.getBoundingClientRect();
    show(rect.left, rect.top);
  });

  trigger.addEventListener("blur", hide);

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hide();
    }
  });
}

const ISIC_SCATTER_INFO_TOOLTIP_HTML = `
  <p class="nature-finance-isic-info-text">The government statistics actually show the top 10 highest contributing SIC sectors to the Scottish economy, however, the ISIC sectors do not map evenly across to SIC sectors so some have been combined. A breakdown of this mapping can be seen in the accompanying report.</p>
`;

function ensureIsicScatterInfoTooltip() {
  let tooltip = document.getElementById("nature-finance-isic-info-tooltip");
  if (tooltip) {
    return tooltip;
  }

  tooltip = document.createElement("div");
  tooltip.id = "nature-finance-isic-info-tooltip";
  tooltip.className = "nature-finance-isic-info-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.hidden = true;
  tooltip.innerHTML = ISIC_SCATTER_INFO_TOOLTIP_HTML;
  document.body.append(tooltip);
  return tooltip;
}

function positionIsicScatterInfoTooltip(tooltip, clientX, clientY) {
  const margin = 12;
  tooltip.style.left = `${clientX - margin}px`;
  tooltip.style.top = `${clientY - margin}px`;

  const rect = tooltip.getBoundingClientRect();
  let adjustedLeft = clientX - margin;
  let adjustedTop = clientY - margin;

  if (rect.left < 8) {
    adjustedLeft += 8 - rect.left;
  }

  if (rect.top < 8) {
    adjustedTop += 8 - rect.top;
  }

  if (rect.bottom > window.innerHeight - 8) {
    adjustedTop -= rect.bottom - (window.innerHeight - 8);
  }

  tooltip.style.left = `${adjustedLeft}px`;
  tooltip.style.top = `${adjustedTop}px`;
}

function bindIsicScatterInfoTooltip(scope) {
  const trigger = scope.querySelector("[data-nature-finance-isic-info-trigger]");
  if (!(trigger instanceof HTMLElement)) {
    return;
  }

  if (trigger.dataset.tooltipBound === "true") {
    return;
  }
  trigger.dataset.tooltipBound = "true";

  const tooltip = ensureIsicScatterInfoTooltip();

  const show = (clientX, clientY) => {
    tooltip.hidden = false;
    tooltip.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-expanded", "true");
    positionIsicScatterInfoTooltip(tooltip, clientX, clientY);
  };

  const hide = () => {
    tooltip.hidden = true;
    tooltip.setAttribute("aria-hidden", "true");
    trigger.setAttribute("aria-expanded", "false");
  };

  trigger.addEventListener("mouseenter", (event) => {
    show(event.clientX, event.clientY);
  });

  trigger.addEventListener("mousemove", (event) => {
    show(event.clientX, event.clientY);
  });

  trigger.addEventListener("mouseleave", hide);

  trigger.addEventListener("focus", () => {
    const rect = trigger.getBoundingClientRect();
    show(rect.left, rect.top);
  });

  trigger.addEventListener("blur", hide);

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hide();
    }
  });
}

export function createNatureFinancePage() {
  const page = document.createElement("main");
  page.className = "nature-finance-page";

  const titleCard = document.createElement("section");
  titleCard.className = "panel ecosystem-services-title-card";
  titleCard.innerHTML = `
    <div class="panel-head nature-finance-title-head">
      <div class="nature-finance-title-copy">
        <h2 class="panel-title">Economic Exposure &amp; Nature Finance Prioritisation</h2>
        <p class="panel-subtitle">Combining sector vulnerability with Scottish economic activity to identify potential priorities for resilience and nature investment.</p>
        <p class="panel-subtitle"> Only the <strong>TOP 9 </strong> ISIC sectors contributing to the Scottish economy are used in this analysis - as found in 2026 Economic Statistics.</p>
      </div>
      <p class="nature-finance-title-formula">
        <span>Economic Exposure</span>
        <span class="nature-finance-title-formula-operator">=</span>
        <span>(0.5 x Normalised Nature Vulnerability)</span>
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
        <span>+ (0.5 x Normalised Annual Output)</span>
      </p>
    </div>
  `;

  const kpiSection = document.createElement("section");
  kpiSection.className = "nature-finance-kpi-row";
  kpiSection.innerHTML = `
    <div class="statistics-grid nature-finance-kpi-grid" aria-label="Economic exposure overview"></div>
  `;

  const kpiGrid = kpiSection.querySelector(".nature-finance-kpi-grid");
  const prioritySectorCard = createKpiCard("Highest Priority Sector", "nature-finance-kpi-priority-sector", "nature-finance-kpi-priority-sector-detail");
  prioritySectorCard.classList.add("nature-finance-kpi-card--primary");

  kpiGrid.append(
    prioritySectorCard,
    createKpiCard("Annual Output Represented", "nature-finance-kpi-output", "nature-finance-kpi-output-detail"),
    createKpiCard("Employment Represented", "nature-finance-kpi-employment", "nature-finance-kpi-employment-detail")
  );

  const analyticsRow = document.createElement("section");
  analyticsRow.className = "nature-finance-analytics-row";

  const exposureCard = document.createElement("section");
  exposureCard.className = "panel nature-finance-exposure-card";
  exposureCard.innerHTML = `
    <div class="panel-head nature-finance-chart-head">
      <h3 class="panel-title">Economic Exposure by ISIC Sector</h3>
      <button
        type="button"
        class="nature-finance-isic-info-trigger"
        data-nature-finance-isic-info-trigger
        aria-label="ISIC to SIC mapping note"
        aria-describedby="nature-finance-isic-info-tooltip"
      >i</button>
    </div>
    <div class="nature-finance-chart-slot">
      <div id="nature-finance-bubble-chart" class="nature-finance-bubble-chart" aria-label="Economic exposure bubble chart">
        <div id="nature-finance-bubble-empty" class="nature-finance-empty-state">Loading bubble chart...</div>
      </div>
      <p class="nature-finance-chart-note">Sectors toward the upper-right combine greater nature vulnerability with greater economic activity.</p>
    </div>
  `;
  bindIsicScatterInfoTooltip(exposureCard);

  const explanationCard = document.createElement("section");
  explanationCard.className = "panel nature-finance-explanation-card";
  explanationCard.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">Why is this sector a priority?</h3>
    </div>
    <div class="nature-finance-explanation-body">
      <div class="nature-finance-drivers-head">Priority Evidence - Filtered by Bubble Graph</div>
      <div id="nature-finance-drivers-bars" class="nature-finance-drivers-bars">
        <div class="nature-finance-empty-state">Sector evidence will appear here.</div>
      </div>
    </div>
  `;

  const rightStack = document.createElement("section");
  rightStack.className = "panel nature-finance-right-stack";
  rightStack.innerHTML = `
    <div class="nature-finance-bar-chart-card">
      <div class="panel-head nature-finance-chart-head">
        <h3 class="panel-title">Annual Output by Sector</h3>
      </div>
      <div class="nature-finance-chart-slot nature-finance-bar-chart-slot">
        <div id="nature-finance-output-bar-chart" class="nature-finance-bar-chart-container" aria-label="Annual output bar chart">
          <div class="nature-finance-empty-state">Loading annual output chart...</div>
        </div>
      </div>
    </div>
    <div class="nature-finance-bar-chart-card">
      <div class="panel-head nature-finance-chart-head">
        <h3 class="panel-title">Employment by Sector</h3>
      </div>
      <div class="nature-finance-chart-slot nature-finance-bar-chart-slot">
        <div id="nature-finance-employment-bar-chart" class="nature-finance-bar-chart-container" aria-label="Employment bar chart">
          <div class="nature-finance-empty-state">Loading employment chart...</div>
        </div>
      </div>
    </div>
  `;

  analyticsRow.append(exposureCard, rightStack);

  const rankingCard = document.createElement("section");
  rankingCard.className = "panel nature-finance-ranking-card";
  rankingCard.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">Sector Prioritisation Ranking</h3>
    </div>
    <div class="nature-finance-table-shell">
      <table id="nature-finance-priority-table" class="nature-finance-table" aria-label="Sector prioritisation ranking table">
        <thead>
          <tr>
            ${createSortHeader("Rank", "rank")}
            ${createSortHeader("ISIC Sector", "sector")}
            ${createSortHeader("Economic Exposure Index", "economic_exposure_index")}
            ${createSortHeader("Normalised Vulnerability", "normalised_vulnerability")}
            ${createSortHeader("Annual Output (£bn)", "annual_output")}
            ${createSortHeader("Employment (FTE)", "employment_fte")}
            ${createSortHeader("Business Count", "business_count")}
            ${createCoverageHeader()}
          </tr>
        </thead>
        <tbody id="nature-finance-priority-table-body">
          <tr>
            <td colspan="8" class="nature-finance-table-empty">Loading ranking table...</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p id="nature-finance-methodology-note" class="nature-finance-methodology-note">Potential economic exposure is a comparative screening indicator combining sector-level nature vulnerability with Scottish economic activity. It does not represent a forecast of realised financial loss.</p>
  `;
  bindCoverageInfoTooltip(rankingCard);

  const interpretationPanel = document.createElement("section");
  interpretationPanel.className = "panel nature-finance-interpretation-panel";
  interpretationPanel.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">How to interpret this page:</h3>
    </div>
    <div class="nature-finance-interpretation-body">
      <p>Economic output describes the scale of activity potentially exposed.</p>
      <p>Vulnerability describes the potential severity of disruption if ecosystem services decline.</p>
      <p>The combined indicator supports comparative prioritisation.</p>
      <p>It should not be interpreted as a prediction of exact monetary loss.</p>
    </div>
  `;

  const lowerRow = document.createElement("section");
  lowerRow.className = "nature-finance-lower-row";
  lowerRow.append(explanationCard);

  loadNatureFinanceSharedRows()
    .then((rows) => {
      if (Array.isArray(rows) && rows.length > 0) {
        const outputChartRoot = page.querySelector("#nature-finance-output-bar-chart");
        const employmentChartRoot = page.querySelector("#nature-finance-employment-bar-chart");
        if (outputChartRoot) {
          renderEconomicOutputBarChart(outputChartRoot, rows);
        }
        if (employmentChartRoot) {
          renderEmploymentFteBarChart(employmentChartRoot, rows);
        }
      }
    })
    .catch(() => {
      const outputChartRoot = page.querySelector("#nature-finance-output-bar-chart");
      const employmentChartRoot = page.querySelector("#nature-finance-employment-bar-chart");
      if (outputChartRoot) {
        outputChartRoot.innerHTML = '<div class="nature-finance-empty-state">Unable to load annual output chart.</div>';
      }
      if (employmentChartRoot) {
        employmentChartRoot.innerHTML = '<div class="nature-finance-empty-state">Unable to load employment chart.</div>';
      }
    });

  page.append(titleCard, kpiSection, analyticsRow, lowerRow, rankingCard, interpretationPanel);
  return page;
}
