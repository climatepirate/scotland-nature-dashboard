import { initEcosystemPressureMapPmtiles } from "./ecosystemPressureMapPmtiles.js";
import { initEcosystemPressureMapWms } from "./ecosystemPressureMapWms.js";

export async function initEcosystemPressureMap() {
  try {
    return await initEcosystemPressureMapPmtiles();
  } catch (error) {
    console.error("[Pressure PMTiles] initialization failed, falling back to WMS.", error);
    return initEcosystemPressureMapWms();
  }
}
