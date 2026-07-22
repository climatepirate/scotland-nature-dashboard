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

export function createNatureFinancePage() {
  const page = document.createElement("main");
  page.className = "nature-finance-page";

  const titleCard = document.createElement("section");
  titleCard.className = "panel ecosystem-services-title-card";
  titleCard.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Economic Exposure &amp; Nature Finance Prioritisation</h2>
      <p class="panel-subtitle">Combining sector vulnerability with Scottish economic activity to identify potential priorities for resilience and nature investment.</p>
      <p class="panel-subtitle"> Only the <strong>TOP 9 </strong> ISIC sectors contributing to the Scottish economy are used in this analysis - as found in 2026 Economic Statistics.</p>
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
    <div class="panel-head">
      <h3 class="panel-title">Economic exposure by sector</h3>
    </div>
    <div class="nature-finance-chart-slot">
      <div id="nature-finance-bubble-chart" class="nature-finance-bubble-chart" aria-label="Economic exposure bubble chart">
        <div id="nature-finance-bubble-empty" class="nature-finance-empty-state">Loading bubble chart...</div>
      </div>
      <p class="nature-finance-chart-note">Sectors toward the upper-right combine greater nature vulnerability with greater economic activity.</p>
    </div>
  `;

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
      <h3 class="panel-title">Sector prioritisation ranking</h3>
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
            ${createSortHeader("Coverage", "coverage")}
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

  const interpretationPanel = document.createElement("section");
  interpretationPanel.className = "panel nature-finance-interpretation-panel";
  interpretationPanel.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">How to interpret this page</h3>
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
