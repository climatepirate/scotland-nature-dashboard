import { initOverallBusinessMapPmtiles } from "./overallBusinessMapPmtiles.js";
import { initOverallBusinessMapWms } from "./overallBusinessMapWms.js";

export async function initOverallBusinessMap() {
  try {
    return await initOverallBusinessMapPmtiles();
  } catch (error) {
    console.error("[Overview PMTiles] initialization failed, falling back to WMS.", error);
    return initOverallBusinessMapWms();
  }
}
