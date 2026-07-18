import { qgisServerConfig, qgisWmsLayers } from "../config/qgisServer.js";
import { attachWmsFeatureInfoPopup } from "./wmsFeatureInfo.js";
import { bindGlobalFiltersToWmsLayers } from "../filters/globalMapFilter.js";

const overallBusinessLegendByLayer = {
  "Company Concentration": {
    title: "Company Concentration (count of)",
    stops: [
      { label: "1.00 - 2.00", color: "242,245,250,190" },
      { label: "2.00 - 3.00", color: "193,205,223,190" },
      { label: "3.00 - 5.00", color: "170,186,211,190" },
      { label: "5.00 - 7.00", color: "152,172,201,190" },
      { label: "7.00 - 11.00", color: "137,159,192,190" },
      { label: "11.00 - 13.00", color: "123,148,185,190" },
      { label: "13.00 - 21.00", color: "110,138,178,190" },
      { label: "21.00 - 50.00", color: "99,128,171,190" },
      { label: "50.00 - 102.00", color: "88,119,165,190" },
      { label: "102.00 - 237.76", color: "77,111,160,190" },
      { label: "237.76 - 389.84", color: "67,103,154,190" },
      { label: "389.84 - 729.76", color: "58,95,149,190" },
      { label: "729.76 - 1188.84", color: "49,88,144,190" },
      { label: "1188.84 - 1975.75", color: "40,81,140,190" },
      { label: "1975.75 - 33068.00", color: "32,74,135,190" },
    ],
  },
  "Average Dependency per Business": {
    title: "Average Dependency per Business",
    stops: [
      { label: "2.27 - 2.48", color: "237,247,241,190" },
      { label: "2.48 - 2.75", color: "184,216,207,190" },
      { label: "2.75 - 2.85", color: "159,201,191,190" },
      { label: "2.85 - 2.99", color: "139,190,179,190" },
      { label: "2.99 - 3.16", color: "122,180,168,190" },
      { label: "3.16 - 3.27", color: "107,172,159,190" },
      { label: "3.27 - 3.36", color: "94,164,150,190" },
      { label: "3.36 - 3.44", color: "81,156,142,190" },
      { label: "3.44 - 3.52", color: "69,149,135,190" },
      { label: "3.52 - 3.60", color: "58,143,128,190" },
      { label: "3.60 - 3.70", color: "47,137,121,190" },
      { label: "3.70 - 3.82", color: "37,131,115,190" },
      { label: "3.82 - 3.92", color: "27,125,108,190" },
      { label: "3.92 - 4.15", color: "18,119,102,190" },
      { label: "4.15 - 4.56", color: "9,114,97,190" },
      { label: "4.56 - 5.54", color: "0,109,91,190" },
    ],
  },
  "Average Pressure per Business": {
    title: "Average Pressure per Business",
    stops: [
      { label: "2.57 - 3.19", color: "255,242,221,190" },
      { label: "3.19 - 3.35", color: "235,199,182,190" },
      { label: "3.35 - 3.49", color: "226,179,165,190" },
      { label: "3.49 - 3.57", color: "219,163,150,190" },
      { label: "3.57 - 3.71", color: "213,149,138,190" },
      { label: "3.71 - 3.81", color: "207,137,128,190" },
      { label: "3.81 - 3.97", color: "202,126,118,190" },
      { label: "3.97 - 4.06", color: "198,116,109,190" },
      { label: "4.06 - 4.20", color: "193,106,100,190" },
      { label: "4.20 - 4.41", color: "189,97,92,190" },
      { label: "4.41 - 4.60", color: "185,88,84,190" },
      { label: "4.60 - 5.09", color: "182,80,77,190" },
      { label: "5.09 - 5.52", color: "178,72,70,190" },
      { label: "5.52 - 5.85", color: "175,65,63,190" },
      { label: "5.85 - 6.38", color: "171,57,56,190" },
      { label: "6.38 - 7.82", color: "168,50,50,190" },
    ],
  },
};

function rgba255ToCss(rgba255) {
  const [r = 0, g = 0, b = 0, a = 255] = rgba255.split(",").map((value) => Number(value.trim()));
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

function parseRangeLabel(label) {
  const values = label.match(/-?\d+(?:\.\d+)?/g) || [];
  if (values.length < 2) {
    return null;
  }
  return {
    min: Number(values[0]),
    max: Number(values[1]),
  };
}

function findFirstRange(stops) {
  for (const stop of stops) {
    const range = parseRangeLabel(stop.label);
    if (range) {
      return range;
    }
  }
  return null;
}

function findLastRange(stops) {
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    const range = parseRangeLabel(stops[index].label);
    if (range) {
      return range;
    }
  }
  return null;
}

function formatLegendNumber(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  if (Math.abs(value) >= 100) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function refreshWmsTiles(layer) {
  if (!layer) {
    return;
  }

  if (typeof layer.setParams === "function") {
    layer.setParams({
      _ts: Date.now(),
    });
  }

  if (typeof layer.redraw === "function") {
    layer.redraw();
  }
}

export function initOverallBusinessMap() {
  const container = document.getElementById("overall-business-map");
  const businessLayerSelect = document.getElementById("overall-business-layer-select");
  const contextLayerSelect = document.getElementById("overall-context-layer-select");
  if (!container || typeof L === "undefined") {
    return;
  }

  const map = L.map(container, {
    center: [56.7, -4.3],
    zoom: 6,
    minZoom: 5,
    maxZoom: 12,
    zoomControl: false,
  });

  const legendElement = document.createElement("div");
  legendElement.className = "overall-gradient-legend";
  legendElement.innerHTML = `
    <div class="overall-gradient-legend-title"></div>
    <div class="overall-gradient-legend-bar" aria-hidden="true"></div>
    <div class="overall-gradient-legend-labels">
      <span class="overall-gradient-legend-min"></span>
      <span class="overall-gradient-legend-mid"></span>
      <span class="overall-gradient-legend-max"></span>
    </div>
  `;
  container.append(legendElement);

  const legendTitle = legendElement.querySelector(".overall-gradient-legend-title");
  const legendBar = legendElement.querySelector(".overall-gradient-legend-bar");
  const legendMin = legendElement.querySelector(".overall-gradient-legend-min");
  const legendMid = legendElement.querySelector(".overall-gradient-legend-mid");
  const legendMax = legendElement.querySelector(".overall-gradient-legend-max");

  map.createPane("basemapPane");
  map.getPane("basemapPane").style.zIndex = "200";
  map.createPane("thematicPane");
  map.getPane("thematicPane").style.zIndex = "400";
  map.createPane("contextPane");
  map.getPane("contextPane").style.zIndex = "450";

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    pane: "basemapPane",
  }).addTo(map);

  const companyConcentrationLayer = L.tileLayer.wms(qgisServerConfig.baseUrl, {
    uppercase: true,
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    layers: qgisWmsLayers.companyConcentration,
    styles: "",
    format: "image/png",
    transparent: true,
    MAP: qgisServerConfig.projectPath,
    crs: L.CRS.EPSG3857,
    pane: "thematicPane",
  }).addTo(map);

  const totalDependencyLayer = L.tileLayer.wms(qgisServerConfig.baseUrl, {
    uppercase: true,
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    layers: qgisWmsLayers.totalDependency,
    styles: "",
    format: "image/png",
    transparent: true,
    MAP: qgisServerConfig.projectPath,
    crs: L.CRS.EPSG3857,
    pane: "thematicPane",
  });

  const totalPressureLayer = L.tileLayer.wms(qgisServerConfig.baseUrl, {
    uppercase: true,
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    layers: qgisWmsLayers.totalPressure,
    styles: "",
    format: "image/png",
    transparent: true,
    MAP: qgisServerConfig.projectPath,
    crs: L.CRS.EPSG3857,
    pane: "thematicPane",
  });

  const nationalParksLayer = L.tileLayer.wms(qgisServerConfig.baseUrl, {
    uppercase: true,
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    layers: [
      qgisWmsLayers.cairngormsNationalPark,
      qgisWmsLayers.lochLomondAndTrossachsNationalPark,
    ].join(","),
    styles: "",
    format: "image/png",
    transparent: true,
    MAP: qgisServerConfig.projectPath,
    crs: L.CRS.EPSG3857,
    pane: "contextPane",
  });

  const nationalNatureReservesLayer = L.tileLayer.wms(qgisServerConfig.baseUrl, {
    uppercase: true,
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    layers: qgisWmsLayers.nationalNatureReserves,
    styles: "",
    format: "image/png",
    transparent: true,
    MAP: qgisServerConfig.projectPath,
    crs: L.CRS.EPSG3857,
    pane: "contextPane",
  });

  const sssiLayer = L.tileLayer.wms(qgisServerConfig.baseUrl, {
    uppercase: true,
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    layers: qgisWmsLayers.sssi,
    styles: "",
    format: "image/png",
    transparent: true,
    MAP: qgisServerConfig.projectPath,
    crs: L.CRS.EPSG3857,
    pane: "contextPane",
  });

  const wildLandAreasLayer = L.tileLayer.wms(qgisServerConfig.baseUrl, {
    uppercase: true,
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    layers: qgisWmsLayers.wildLandAreas,
    styles: "",
    format: "image/png",
    transparent: true,
    MAP: qgisServerConfig.projectPath,
    crs: L.CRS.EPSG3857,
    pane: "contextPane",
  });

  const worldHeritageSitesLayer = L.tileLayer.wms(qgisServerConfig.baseUrl, {
    uppercase: true,
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    layers: qgisWmsLayers.worldHeritageSites,
    styles: "",
    format: "image/png",
    transparent: true,
    MAP: qgisServerConfig.projectPath,
    crs: L.CRS.EPSG3857,
    pane: "contextPane",
  });

  const thematicLayers = [
    companyConcentrationLayer,
    totalDependencyLayer,
    totalPressureLayer,
  ];
  bindGlobalFiltersToWmsLayers(thematicLayers);
  let activeThematicLayer = companyConcentrationLayer;

  const thematicLayerByLabel = {
    "Company Concentration": companyConcentrationLayer,
    "Average Dependency per Business": totalDependencyLayer,
    "Average Pressure per Business": totalPressureLayer,
  };

  const contextLayerByLabel = {
    None: null,
    "National Parks": nationalParksLayer,
    "National Nature Reserves": nationalNatureReservesLayer,
    "Sites of Special Scientific Interest (SSSI)": sssiLayer,
    "Wild Land Areas": wildLandAreasLayer,
    "World Heritage Sites": worldHeritageSitesLayer,
  };

  const contextLayers = [
    nationalParksLayer,
    nationalNatureReservesLayer,
    sssiLayer,
    wildLandAreasLayer,
    worldHeritageSitesLayer,
  ];

  attachWmsFeatureInfoPopup(map, {
    get wmsParams() {
      return activeThematicLayer.wmsParams;
    },
    get _url() {
      return activeThematicLayer._url;
    },
    get options() {
      return activeThematicLayer.options;
    },
  }, [
    { label: "Hex ID", keys: ["hex_id", "hexid", "hex_id_1", "HEX_ID", "id"] },
    { label: "Company count", keys: ["company_count", "count", "company_cou", "COMPANY_COUNT"] },
    { label: "Average dependency per business", keys: ["mean_dep_score", "mean_dependency_score", "dependency_mean", "mean_dep", "MEAN_DEPENDENCY_SCORE"] },
    { label: "Average pressure per business", keys: ["mean_press_score", "mean_pressure_score", "pressure_mean", "mean_pres", "MEAN_PRESSURE_SCORE"] },
  ]);

  const setActiveThematicLayer = (layerLabel) => {
    const nextLayer = thematicLayerByLabel[layerLabel] ?? companyConcentrationLayer;

    thematicLayers.forEach((layer) => {
      if (layer !== nextLayer && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    if (!map.hasLayer(nextLayer)) {
      map.addLayer(nextLayer);
    }

    refreshWmsTiles(nextLayer);

    activeThematicLayer = nextLayer;

    const legendConfig = overallBusinessLegendByLayer[layerLabel] ?? overallBusinessLegendByLayer["Company Concentration"];
    const stops = legendConfig.stops;
    const gradientStops = stops.map((stop, index) => {
      const pct = stops.length <= 1 ? 0 : (index / (stops.length - 1)) * 100;
      return `${rgba255ToCss(stop.color)} ${pct.toFixed(2)}%`;
    });
    const firstRange = findFirstRange(stops);
    const lastRange = findLastRange(stops);
    const rangeMin = firstRange?.min;
    const rangeMax = lastRange?.max;
    const rangeMid = Number.isFinite(rangeMin) && Number.isFinite(rangeMax)
      ? (rangeMin + rangeMax) / 2
      : null;

    legendTitle.textContent = legendConfig.title;
    legendBar.style.background = `linear-gradient(90deg, ${gradientStops.join(", ")})`;
    legendMin.textContent = formatLegendNumber(rangeMin);
    legendMid.textContent = Number.isFinite(rangeMid) ? formatLegendNumber(rangeMid) : "";
    legendMax.textContent = formatLegendNumber(rangeMax);
  };

  const setActiveContextLayer = (layerLabel) => {
    const nextLayer = contextLayerByLabel[layerLabel] ?? null;

    contextLayers.forEach((layer) => {
      if (layer !== nextLayer && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });

    if (nextLayer && !map.hasLayer(nextLayer)) {
      map.addLayer(nextLayer);
    }
  };

  if (businessLayerSelect) {
    businessLayerSelect.value = "Company Concentration";
    setActiveThematicLayer(businessLayerSelect.value);
    businessLayerSelect.addEventListener("change", (event) => {
      setActiveThematicLayer(event.target.value);
    });
  }

  if (contextLayerSelect) {
    contextLayerSelect.value = "None";
    setActiveContextLayer(contextLayerSelect.value);
    contextLayerSelect.addEventListener("change", (event) => {
      setActiveContextLayer(event.target.value);
    });
  }

  companyConcentrationLayer.on("tileerror", (event) => {
    console.error("[WMS tile error] Company concentration", {
      tileSrc: event?.tile?.src,
      coords: event?.coords,
      error: event?.error,
    });
  });

  totalDependencyLayer.on("tileerror", (event) => {
    console.error("[WMS tile error] Average dependency", {
      tileSrc: event?.tile?.src,
      coords: event?.coords,
      error: event?.error,
    });
  });

  totalPressureLayer.on("tileerror", (event) => {
    console.error("[WMS tile error] Average pressure", {
      tileSrc: event?.tile?.src,
      coords: event?.coords,
      error: event?.error,
    });
  });
}
