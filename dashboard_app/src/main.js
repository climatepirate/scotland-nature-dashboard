import { renderDashboardShell } from "./pages/dashboardShell.js";
import { initOverallBusinessMap } from "./maps/overallBusinessMap.js";
import { initEcosystemDependencyMap } from "./maps/ecosystemDependencyMap.js";
import { initEcosystemPressureMap } from "./maps/ecosystemPressureMap.js";

const appRoot = document.getElementById("app");
appRoot.append(renderDashboardShell());

initOverallBusinessMap();
initEcosystemDependencyMap();
initEcosystemPressureMap();
