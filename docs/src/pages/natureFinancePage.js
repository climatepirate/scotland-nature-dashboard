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
      <div class="nature-finance-selection-empty" id="nature-finance-selection-empty">Select a sector from the bubble chart or ranking table to see details.</div>
      <div class="nature-finance-selection-block">
        <div class="nature-finance-selection-label">Selected sector</div>
        <div id="nature-finance-selected-sector-name" class="nature-finance-selection-value">&mdash;</div>
      </div>
      <div class="nature-finance-selection-block">
        <div class="nature-finance-selection-label">Priority classification</div>
        <div id="nature-finance-priority-score" class="nature-finance-selection-value">&mdash;</div>
      </div>
      <p id="nature-finance-priority-explainer" class="nature-finance-priority-explainer">This explanation will describe how vulnerability, economic activity and ecosystem-service dependencies combine for the selected sector.</p>
      <div class="nature-finance-drivers-head">Priority evidence</div>
      <div id="nature-finance-drivers-bars" class="nature-finance-drivers-bars">
        <div class="nature-finance-empty-state">Sector evidence will appear here.</div>
      </div>
    </div>
  `;

  analyticsRow.append(exposureCard, explanationCard);

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

  page.append(titleCard, kpiSection, analyticsRow, rankingCard, interpretationPanel);
  return page;
}
