import { initEcosystemDependencyMapPmtiles } from "./ecosystemDependencyMapPmtiles.js?v=1";
import { initEcosystemDependencyMapWms } from "./ecosystemDependencyMapWms.js";

export async function initEcosystemDependencyMap() {
  try {
    return await initEcosystemDependencyMapPmtiles();
  } catch (error) {
    console.error("[Dependency PMTiles] initialization failed, falling back to WMS.", error);
    return initEcosystemDependencyMapWms();
  }
}
