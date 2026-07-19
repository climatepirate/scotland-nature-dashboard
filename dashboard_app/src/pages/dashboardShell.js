import { createMapPanel, createChartPanel } from "../components/panelPlaceholders.js";
import { createOverallBusinessMapPanel } from "../components/overallBusinessMapPanel.js";
import { createDependencyMapPanel } from "../components/dependencyMapPanel.js";
import { createPressureMapPanel } from "../components/pressureMapPanel.js";
import { createDependencyRidgelinePanel } from "../components/dependencyRidgelinePanel.js";
import { createPressureRidgelinePanel } from "../components/pressureRidgelinePanel.js";
import { createStatisticsPanel } from "../components/statisticsPanel.js";
import { createGlobalFilterBar } from "../layout/filterBar.js";
import { createHeader } from "../layout/header.js";

function createColumn(mapTitle, mapSubtitle, chartTitle, chartSubtitle) {
  const column = document.createElement("section");
  column.className = "column";
  column.append(
    createMapPanel(mapTitle, mapSubtitle),
    createChartPanel(chartTitle, chartSubtitle),
  );
  return column;
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

  shell.append(createHeader(), topSplit, bottomSplit);
  return shell;
}
