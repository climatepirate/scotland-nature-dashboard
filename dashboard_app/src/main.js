import { renderDashboardShell } from "./pages/dashboardShell.js";
import { createDashboardAppShell } from "./pages/dashboardAppShell.js";
import { initOverallBusinessMap } from "./maps/overallBusinessMap.js";
import { initEcosystemDependencyMap } from "./maps/ecosystemDependencyMap.js";
import { initEcosystemPressureMap } from "./maps/ecosystemPressureMap.js";
import { initDependencyRidgelineChart } from "./charts/dependencyRidgelineChart.js";
import { initPressureRidgelineChart } from "./charts/pressureRidgelineChart.js";
import { initEcosystemServicesSankeyChart } from "./charts/ecosystemServicesSankeyChart.js";
import { initEcosystemServicesCoarseScatterChart } from "./charts/ecosystemServicesCoarseScatterChart.js";
import { initEcosystemServicesIsicScatterChart } from "./charts/ecosystemServicesIsicScatterChart.js";
import { initEcosystemServicesCompanyScatterChart } from "./charts/ecosystemServicesCompanyScatterChart.js";
import { initEcosystemServicesSummaryRankingTable } from "./tables/ecosystemServicesSummaryRankingTable.js";

const appRoot = document.getElementById("app");
const dashboardShell = renderDashboardShell();
const appShell = createDashboardAppShell(dashboardShell);
appRoot.append(appShell.element);
appShell.setPageFromHash();

window.addEventListener("hashchange", () => {
	appShell.setPageFromHash();
});

initDependencyRidgelineChart();
initPressureRidgelineChart();
initOverallBusinessMap();
initEcosystemDependencyMap();
initEcosystemPressureMap();
initEcosystemServicesSankeyChart();
initEcosystemServicesCoarseScatterChart();
initEcosystemServicesIsicScatterChart();
initEcosystemServicesCompanyScatterChart();
initEcosystemServicesSummaryRankingTable();
