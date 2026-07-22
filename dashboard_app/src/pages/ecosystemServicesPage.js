import { createEcosystemServicesSummaryRankingTableSection } from "../tables/ecosystemServicesSummaryRankingTable.js";

function createFilterField(labelText, id, placeholderText) {
  const item = document.createElement("div");
  item.className = "global-filter-item";

  const label = document.createElement("label");
  label.className = "global-filter-label";
  label.setAttribute("for", id);
  label.textContent = labelText;

  const select = document.createElement("select");
  select.id = id;
  select.className = "global-filter-input";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = placeholderText;
  select.append(placeholder);

  item.append(label, select);
  return item;
}

function createSankeySection() {
  const card = document.createElement("section");
  card.className = "panel ecosystem-services-section";

  const head = document.createElement("div");
  head.className = "panel-head";

  const heading = document.createElement("h3");
  heading.className = "panel-title";
  heading.textContent = "Ecosystem Service Dependency Flow (Sankey)";

  const subheading = document.createElement("p");
  subheading.className = "panel-subtitle";
  subheading.textContent = "Business counts flowing from coarse category to ISIC section under active filters.";

  const body = document.createElement("div");
  body.className = "ecosystem-services-slot ecosystem-services-slot--sankey";

  const status = document.createElement("p");
  status.id = "ecosystem-services-sankey-status";
  status.className = "ecosystem-services-sankey-status";
  status.textContent = "Loading Sankey data...";

  const chartWrap = document.createElement("div");
  chartWrap.id = "ecosystem-services-sankey-chart";
  chartWrap.className = "ecosystem-services-sankey-chart";

  body.append(status, chartWrap);
  head.append(heading, subheading);
  card.append(head, body);

  return card;
}

function createCoarseCategoryScatterSection() {
  const card = document.createElement("section");
  card.className = "panel ecosystem-services-section";

  const head = document.createElement("div");
  head.className = "panel-head";

  const heading = document.createElement("h3");
  heading.className = "panel-title";
  heading.textContent = "Coarse Category: Dependency vs Pressure";

  const subheading = document.createElement("p");
  subheading.className = "panel-subtitle";
  subheading.textContent = "Median dependency and pressure scores by coarse category under active filters.";

  const body = document.createElement("div");
  body.className = "ecosystem-services-slot ecosystem-services-slot--scatter";

  const status = document.createElement("p");
  status.id = "ecosystem-services-coarse-scatter-status";
  status.className = "ecosystem-services-scatter-status";
  status.textContent = "Loading coarse category scatter...";

  const chartWrap = document.createElement("div");
  chartWrap.id = "ecosystem-services-coarse-scatter-chart";
  chartWrap.className = "ecosystem-services-scatter-chart";

  body.append(status, chartWrap);
  head.append(heading, subheading);
  card.append(head, body);
  return card;
}

function createIsicScatterSection() {
  const card = document.createElement("section");
  card.className = "panel ecosystem-services-section";

  const head = document.createElement("div");
  head.className = "panel-head";

  const heading = document.createElement("h3");
  heading.className = "panel-title";
  heading.textContent = "ISIC Section: Dependency vs Pressure";

  const subheading = document.createElement("p");
  subheading.className = "panel-subtitle";
  subheading.textContent = "Median dependency and pressure scores by ISIC section, coloured by coarse category.";

  const body = document.createElement("div");
  body.className = "ecosystem-services-slot ecosystem-services-slot--scatter";

  const status = document.createElement("p");
  status.id = "ecosystem-services-isic-scatter-status";
  status.className = "ecosystem-services-scatter-status";
  status.textContent = "Loading ISIC scatter...";

  const chartWrap = document.createElement("div");
  chartWrap.id = "ecosystem-services-isic-scatter-chart";
  chartWrap.className = "ecosystem-services-scatter-chart";

  body.append(status, chartWrap);
  head.append(heading, subheading);
  card.append(head, body);
  return card;
}

function createCompanyScatterSection() {
  const card = document.createElement("section");
  card.className = "panel ecosystem-services-section";

  const head = document.createElement("div");
  head.className = "panel-head";

  const heading = document.createElement("h3");
  heading.className = "panel-title";
  heading.textContent = "High Dependency vs High Pressure, Company-Level Scatter";

  const subheading = document.createElement("p");
  subheading.className = "panel-subtitle";
  subheading.textContent = "All companies plotted, coloured by ISIC section. Use the in-chart coarse category filter to subset.";

  const body = document.createElement("div");
  body.className = "ecosystem-services-slot ecosystem-services-slot--company-scatter";

  const status = document.createElement("p");
  status.id = "ecosystem-services-company-scatter-status";
  status.className = "ecosystem-services-scatter-status";
  status.textContent = "Loading company scatter...";

  const chartWrap = document.createElement("div");
  chartWrap.id = "ecosystem-services-company-scatter-chart";
  chartWrap.className = "ecosystem-services-company-scatter-chart";

  const controls = document.createElement("div");
  controls.className = "ecosystem-services-company-scatter-controls";

  const coarseLabel = document.createElement("label");
  coarseLabel.className = "ecosystem-services-company-scatter-filter-label";
  coarseLabel.setAttribute("for", "ecosystem-services-company-coarse-filter");
  coarseLabel.textContent = "Coarse Category";

  const coarseSelect = document.createElement("select");
  coarseSelect.id = "ecosystem-services-company-coarse-filter";
  coarseSelect.className = "ecosystem-services-company-scatter-filter-input";

  controls.append(coarseLabel, coarseSelect);
  chartWrap.append(controls);

  body.append(status, chartWrap);
  head.append(heading, subheading);
  card.append(head, body);

  return card;
}

function createSectionCard(title, subtitle, bodyClassName) {
  const card = document.createElement("section");
  card.className = "panel ecosystem-services-section";

  const head = document.createElement("div");
  head.className = "panel-head";

  const heading = document.createElement("h3");
  heading.className = "panel-title";
  heading.textContent = title;

  const subheading = document.createElement("p");
  subheading.className = "panel-subtitle";
  subheading.textContent = subtitle;

  const body = document.createElement("div");
  body.className = bodyClassName;

  const placeholder = document.createElement("div");
  placeholder.className = "placeholder";
  placeholder.innerHTML = "<strong>Placeholder</strong> Module ready for visualisation insertion.";

  body.append(placeholder);
  head.append(heading, subheading);
  card.append(head, body);

  return card;
}

function createEcosystemServicesInterpretationPanel() {
  const panel = document.createElement("section");
  panel.className = "panel ecosystem-services-interpretation-panel";
  panel.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">How to interpret this page</h3>
    </div>
    <div class="ecosystem-services-interpretation-body">
      <p>The Sankey diagram shows how businesses are distributed from broad business categories into individual ISIC sectors.</p>
      <p>The dependency and pressure plots compare nature-related scores across sectors, helping identify industries with relatively greater interactions with ecosystem services.</p>
      <p>The company-level scatter illustrates the relationship between ecosystem service dependency and environmental pressure for businesses within the selected filters.</p>
      <p>The ranking table summarises sector and company performance, supporting comparison and prioritisation rather than representing absolute measures of nature-related risk.</p>
    </div>
  `;

  return panel;
}

export function createEcosystemServicesPage() {
  const page = document.createElement("main");
  page.className = "ecosystem-services-page";

  const titleCard = document.createElement("section");
  titleCard.className = "panel ecosystem-services-title-card";
  titleCard.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Sector Analysis</h2>
      <p class="panel-subtitle">Page structure scaffold for upcoming visualisations.</p>
    </div>
  `;

  const filterBar = document.createElement("section");
  filterBar.className = "panel ecosystem-services-filter-bar";

  const filterGrid = document.createElement("div");
  filterGrid.className = "ecosystem-services-filter-grid";
  filterGrid.append(
    createFilterField("Coarse Category", "ecosystem-services-coarse-category", "All Categories"),
    createFilterField("ISIC Section", "ecosystem-services-isic-section", "All ISIC Sections"),
    createFilterField("Local Authority", "ecosystem-services-local-authority", "All Scotland"),
  );

  const resetWrap = document.createElement("div");
  resetWrap.className = "ecosystem-services-filter-reset";

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "ecosystem-services-reset-button";
  resetButton.id = "ecosystem-services-reset-filters";
  resetButton.textContent = "Reset Filters";

  resetWrap.append(resetButton);
  filterBar.append(filterGrid, resetWrap);

  const sankeySection = createSankeySection();

  const midGrid = document.createElement("section");
  midGrid.className = "ecosystem-services-two-col";
  midGrid.append(
    createCoarseCategoryScatterSection(),
    createIsicScatterSection(),
  );

  const companyScatterSection = createCompanyScatterSection();

  const summaryTableSection = createEcosystemServicesSummaryRankingTableSection();

  page.append(
    titleCard,
    filterBar,
    sankeySection,
    midGrid,
    companyScatterSection,
    summaryTableSection,
    createEcosystemServicesInterpretationPanel(),
  );

  return page;
}
