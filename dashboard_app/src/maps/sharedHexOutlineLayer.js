import { qgisServerConfig, qgisWmsLayers } from "../config/qgisServer.js";

export function createScotlandHexOutlineLayer(paneName) {
  return L.tileLayer.wms(qgisServerConfig.baseUrl, {
    uppercase: true,
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    layers: qgisWmsLayers.scotlandHexGrid,
    styles: "",
    format: "image/png",
    transparent: true,
    MAP: qgisServerConfig.projectPath,
    crs: L.CRS.EPSG3857,
    pane: paneName,
  });
}