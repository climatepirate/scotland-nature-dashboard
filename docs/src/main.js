import { renderDashboardShell } from "./pages/dashboardShell.js";
import { createDashboardAppShell } from "./pages/dashboardAppShell.js";
import { initOverallBusinessMap } from "./maps/overallBusinessMap.js";
import { initEcosystemDependencyMap } from "./maps/ecosystemDependencyMap.js";
import { initEcosystemPressureMap } from "./maps/ecosystemPressureMap.js";
import { initDependencyTotalServiceBarChart } from "./charts/dependencyTotalServiceBarChart.js";
import { initPressureTotalServiceBarChart } from "./charts/pressureTotalServiceBarChart.js";
import { initDependencyRidgelineChart } from "./charts/dependencyRidgelineChart.js";
import { initPressureRidgelineChart } from "./charts/pressureRidgelineChart.js";
import { initEcosystemServicesSankeyChart } from "./charts/ecosystemServicesSankeyChart.js";
import { initEcosystemServicesCoarseScatterChart } from "./charts/ecosystemServicesCoarseScatterChart.js";
import { initEcosystemServicesIsicScatterChart } from "./charts/ecosystemServicesIsicScatterChart.js";
import { initEcosystemServicesCompanyScatterChart } from "./charts/ecosystemServicesCompanyScatterChart.js";
import { initEcosystemServicesSummaryRankingTable } from "./tables/ecosystemServicesSummaryRankingTable.js";
import { initBusinessVulnerabilitySummaryCards } from "./charts/businessVulnerabilitySummaryCards.js";
import { initBusinessVulnerabilityMap } from "./maps/businessVulnerabilityMap.js";
import { initBusinessVulnerabilityProfileTable } from "./tables/businessVulnerabilityProfileTable.js";
import { initNatureFinanceBubbleChart } from "./charts/natureFinanceBubbleChart.js";
import { initNatureFinanceKpiCards } from "./charts/natureFinanceKpiCards.js";
import { initNatureFinancePriorityPanel } from "./charts/natureFinancePriorityPanel.js";
import { initNatureFinancePriorityRankingTable } from "./tables/natureFinancePriorityRankingTable.js";
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
