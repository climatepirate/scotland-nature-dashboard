import { createMapPanel, createChartPanel } from "../components/panelPlaceholders.js";
import { createOverallBusinessMapPanel } from "../components/overallBusinessMapPanel.js";
import { createDependencyMapPanel } from "../components/dependencyMapPanel.js";
import { createPressureMapPanel } from "../components/pressureMapPanel.js";
import { createDependencyRidgelinePanel } from "../components/dependencyRidgelinePanel.js";
import { createPressureRidgelinePanel } from "../components/pressureRidgelinePanel.js";
import { createStatisticsPanel } from "../components/statisticsPanel.js";
import { createGlobalFilterBar } from "../layout/filterBar.js";

function createColumn(mapTitle, mapSubtitle, chartTitle, chartSubtitle) {
  const column = document.createElement("section");
  column.className = "column";
  column.append(
    createMapPanel(mapTitle, mapSubtitle),
    createChartPanel(chartTitle, chartSubtitle),
  );
  return column;
}

function createOverviewInterpretationPanel() {
  const panel = document.createElement("section");
  panel.className = "panel overview-interpretation-panel";
  panel.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">How to interpret this page</h3>
    </div>
    <div class="overview-interpretation-body">
      <p>Business statistics summarise the scale and characteristics of the selected business population.</p>
      <p>The maps identify where businesses, ecosystem service dependencies and nature-related pressures are spatially concentrated.</p>
      <p>The distribution plots compare how dependency and pressure scores vary between broad business categories.</p>
      <p>This page provides an overview for exploration and screening rather than a detailed assessment of individual businesses.</p>
    </div>
  `;

  return panel;
}

export function renderDashboardShell() {
  const shell = document.createElement("main");
  shell.className = "dashboard-shell";

  const topSplit = document.createElement("section");
  topSplit.className = "top-split";

  const leftColumn = document.createElement("section");
  leftColumn.className = "top-left-column";
  leftColumn.append(
    createGlobalFilterBar(),
    createStatisticsPanel(),
  );

  const rightColumn = document.createElement("section");
  rightColumn.className = "top-right-column";
  rightColumn.append(createOverallBusinessMapPanel());

  topSplit.append(leftColumn, rightColumn);

  const bottomSplit = document.createElement("section");
  bottomSplit.className = "bottom-split";

  const dependencyColumn = document.createElement("section");
  dependencyColumn.className = "column";
  dependencyColumn.append(
    createDependencyMapPanel(),
    createDependencyRidgelinePanel(),
  );

  const pressureColumn = document.createElement("section");
  pressureColumn.className = "column";
  pressureColumn.append(
    createPressureMapPanel(),
    createPressureRidgelinePanel(),
  );

  bottomSplit.append(
    dependencyColumn,
    pressureColumn,
  );

  shell.append(topSplit, bottomSplit, createOverviewInterpretationPanel());
  return shell;
}
