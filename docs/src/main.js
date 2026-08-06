import { renderDashboardShell } from "./pages/dashboardShell.js?v=2";
import { createDashboardAppShell } from "./pages/dashboardAppShell.js";
import { initOverallBusinessMap } from "./maps/overallBusinessMap.js";
import { initEcosystemDependencyMap } from "./maps/ecosystemDependencyMap.js";
import { initEcosystemPressureMap } from "./maps/ecosystemPressureMap.js";
import { initDependencyTotalServiceBarChart } from "./charts/dependencyTotalServiceBarChart.js";
import { initPressureTotalServiceBarChart } from "./charts/pressureTotalServiceBarChart.js";
import { initDependencyRidgelineChart } from "./charts/dependencyRidgelineChart.js";
import { initPressureRidgelineChart } from "./charts/pressureRidgelineChart.js";
import { initEcosystemServicesSankeyChart } from "./charts/ecosystemServicesSankeyChart.js?v=3";
import { initEcosystemServicesCoarseScatterChart } from "./charts/ecosystemServicesCoarseScatterChart.js?v=3";
import { initEcosystemServicesIsicScatterChart } from "./charts/ecosystemServicesIsicScatterChart.js?v=3";
import { initEcosystemServicesCompanyScatterChart } from "./charts/ecosystemServicesCompanyScatterChart.js?v=3";
import { initEcosystemServicesSummaryRankingTable } from "./tables/ecosystemServicesSummaryRankingTable.js?v=4";
import { initBusinessVulnerabilitySummaryCards } from "./charts/businessVulnerabilitySummaryCards.js?v=4";
import { initBusinessVulnerabilityMap } from "./maps/businessVulnerabilityMap.js?v=4";
import { initBusinessVulnerabilityProfileTable } from "./tables/businessVulnerabilityProfileTable.js?v=4";
import { initNatureFinanceBubbleChart } from "./charts/natureFinanceBubbleChart.js?v=3";
import { initNatureFinanceKpiCards } from "./charts/natureFinanceKpiCards.js?v=3";
import { initNatureFinancePriorityPanel } from "./charts/natureFinancePriorityPanel.js?v=3";
import { initNatureFinancePriorityRankingTable } from "./tables/natureFinancePriorityRankingTable.js?v=3";
import { initEcosystemServicesDonutChart } from "./charts/ecosystemServicesDonutChart.js";
import { initEnvironmentalPressuresDonutChart } from "./charts/environmentalPressuresDonutChart.js";

const appRoot = document.getElementById("app");
const dashboardShell = renderDashboardShell();
const appShell = createDashboardAppShell(dashboardShell);
appRoot.append(appShell.element);
appShell.setPageFromHash();

let businessVulnerabilityPageInitialized = false;
const scheduleBusinessVulnerabilityPageInit = () => {
	if (businessVulnerabilityPageInitialized) {
		return;
	}

	businessVulnerabilityPageInitialized = true;
	initBusinessVulnerabilitySummaryCards();
	initBusinessVulnerabilityMap();
	initBusinessVulnerabilityProfileTable();
};

const maybeInitBusinessVulnerabilityPage = () => {
	const hashPageId = window.location.hash.replace(/^#/, "");
	if (hashPageId !== "business-vulnerability" && hashPageId !== "pressures") {
		return;
	}

	if (typeof window.requestIdleCallback === "function") {
		window.requestIdleCallback(scheduleBusinessVulnerabilityPageInit, { timeout: 2000 });
		return;
	}

	window.setTimeout(scheduleBusinessVulnerabilityPageInit, 0);
};

window.addEventListener("hashchange", () => {
	appShell.setPageFromHash();
	maybeInitBusinessVulnerabilityPage();
});

initDependencyRidgelineChart();
initPressureRidgelineChart();
initOverallBusinessMap();
initEcosystemDependencyMap();
initEcosystemPressureMap();
initDependencyTotalServiceBarChart();
initPressureTotalServiceBarChart();
initEcosystemServicesSankeyChart();
initEcosystemServicesCoarseScatterChart();
initEcosystemServicesIsicScatterChart();
initEcosystemServicesCompanyScatterChart();
initEcosystemServicesSummaryRankingTable();
initNatureFinanceBubbleChart();
initNatureFinanceKpiCards();
initNatureFinancePriorityPanel();
initNatureFinancePriorityRankingTable();
initEcosystemServicesDonutChart();
initEnvironmentalPressuresDonutChart();

maybeInitBusinessVulnerabilityPage();
