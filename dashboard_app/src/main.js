import { renderDashboardShell } from "./pages/dashboardShell.js";
import { initOverallBusinessMap } from "./maps/overallBusinessMap.js";
import { initEcosystemDependencyMap } from "./maps/ecosystemDependencyMap.js";
import { initEcosystemPressureMap } from "./maps/ecosystemPressureMap.js";
import { initDependencyRidgelineChart } from "./charts/dependencyRidgelineChart.js";
import { initPressureRidgelineChart } from "./charts/pressureRidgelineChart.js";

const appRoot = document.getElementById("app");
appRoot.append(renderDashboardShell());

initDependencyRidgelineChart();
initPressureRidgelineChart();
initOverallBusinessMap();
initEcosystemDependencyMap();
initEcosystemPressureMap();
