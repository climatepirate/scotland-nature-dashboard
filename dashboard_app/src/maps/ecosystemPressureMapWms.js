import { qgisServerConfig, qgisWmsLayers } from "../config/qgisServer.js";
import { bindGlobalFiltersToWmsLayers } from "../filters/globalMapFilter.js";
import { createScotlandHexOutlineLayer } from "./sharedHexOutlineLayer.js";
import { updateState } from "../state/state.js";
import { pressureLegendByLayerName } from "../config/pressureLegendData.js";

const allPressureLegendStops = [
  { label: "4.00 - 5.00", color: "255,242,221,190" },
  { label: "5.00 - 6.00", color: "224,173,160,190" },
  { label: "6.00 - 7.00", color: "198,117,109,190" },
  { label: "7.00 - 8.00", color: "180,76,73,190" },
  { label: "8.00 - 11.00", color: "168,50,50,190" },
];

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

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function firstDefinedValue(properties, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      const value = properties[key];
      if (value !== null && value !== undefined && value !== "") {
        return value;
      }
    }
  }
  return undefined;
}

function formatNumericValue(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return String(value);
  }
  if (Number.isInteger(numberValue)) {
    return String(numberValue);
  }
  return numberValue.toFixed(2);
}

function buildGetFeatureInfoUrl(map, wmsLayer, latlng, options = {}) {
  const point = map.latLngToContainerPoint(latlng, map.getZoom());
  const size = map.getSize();
  const bounds = map.getBounds();
  const sw = map.options.crs.project(bounds.getSouthWest());
  const ne = map.options.crs.project(bounds.getNorthEast());
  const wmsParams = wmsLayer.wmsParams || {};

  const version = String(wmsParams.version || wmsParams.VERSION || "1.3.0");
  const crs = wmsParams.crs || wmsParams.CRS || map.options.crs.code;
  const layers = wmsParams.layers || wmsParams.LAYERS;
  const mapPath = wmsParams.MAP || wmsParams.map;
  const uppercase = Boolean(wmsLayer.options?.uppercase);

  const requestParams = {
    service: "WMS",
    request: "GetFeatureInfo",
    version,
    layers,
    query_layers: layers,
    styles: wmsParams.styles || wmsParams.STYLES || "",
    format: wmsParams.format || wmsParams.FORMAT || "image/png",
    transparent: wmsParams.transparent ?? wmsParams.TRANSPARENT ?? true,
    feature_count: options.featureCount || 1,
    info_format: options.infoFormat || "application/json",
    bbox: [sw.x, sw.y, ne.x, ne.y].join(","),
    height: size.y,
    width: size.x,
  };

  if (mapPath) {
    requestParams.MAP = mapPath;
  }

  if (version === "1.3.0") {
    requestParams.crs = crs;
    requestParams.i = Math.floor(point.x);
    requestParams.j = Math.floor(point.y);
  } else {
    requestParams.srs = crs;
    requestParams.x = Math.floor(point.x);
    requestParams.y = Math.floor(point.y);
  }

  return wmsLayer._url + L.Util.getParamString(requestParams, wmsLayer._url, uppercase);
}

function withInfoFormat(url, infoFormat) {
  const parsed = new URL(url, window.location.href);
  parsed.searchParams.set("info_format", infoFormat);
  parsed.searchParams.set("INFO_FORMAT", infoFormat);
  return parsed.toString();
}

function createPressureLayerSelector(selectElement, pressureLayers, initialLabel, onChange) {
  if (!selectElement) {
    return;
  }

  const labels = Object.keys(pressureLayers);
  labels.forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    selectElement.append(option);
  });

  selectElement.value = initialLabel;
  selectElement.addEventListener("change", (event) => {
    onChange(event.target.value);
  });
}

export function initEcosystemPressureMapWms() {
  const qgisStyleRevision = Date.now();

  const container = document.getElementById("ecosystem-pressure-map");
  const pressureSelector = document.getElementById("ecosystem-pressure-service-select");
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

  map.createPane("pressBasemapPane");
  map.getPane("pressBasemapPane").style.zIndex = "200";
  map.createPane("pressHexOutlinePane");
  map.getPane("pressHexOutlinePane").style.zIndex = "300";
  map.createPane("pressThematicPane");
  map.getPane("pressThematicPane").style.zIndex = "400";

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    pane: "pressBasemapPane",
  }).addTo(map);

  createScotlandHexOutlineLayer("pressHexOutlinePane").addTo(map);

  const pressureLayers = {
    "All ecosystem pressures": L.tileLayer.wms(qgisServerConfig.baseUrl, {
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
      pane: "pressThematicPane",
    }),
    "Freshwater area use": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressFreshwaterAreaUse,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Land use": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressLandUse,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Seabed use": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressSeabedUse,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Water use": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressWaterUse,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Biotic resource extraction": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressBioticResourceExtraction,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Abiotic resource extraction": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressAbioticResourceExtraction,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Greenhouse-gas emissions": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressGreenhouseGasEmissions,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Non-GHG air pollutants": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressNonGhgAirPollutants,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Nutrient soil and water pollutants": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressNutrientSoilWaterPollutants,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Toxic soil and water pollutants": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressToxicSoilWaterPollutants,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Solid-waste generation": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressSolidWasteGeneration,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Introduction of invasive species": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressIntroductionOfInvasiveSpecies,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
    "Disturbance: noise and light": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.pressDisturbanceNoiseLight,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "pressThematicPane",
    }),
  };

  Object.values(pressureLayers).forEach((layer) => {
    layer.setParams({ _style_rev: qgisStyleRevision });
  });

  const initialLayer = pressureLayers["All ecosystem pressures"];

  bindGlobalFiltersToWmsLayers(Object.values(pressureLayers));
  initialLayer.addTo(map);
  let activeLayer = initialLayer;
  let activePressureLabel = "All ecosystem pressures";
  updateState({ selectedPressure: activePressureLabel });

  const updatePressureLegend = (pressureLabel, layer) => {
    const legendConfig = pressureLabel === "All ecosystem pressures"
      ? allPressureLegendStops
      : pressureLegendByLayerName[pressureLabel];
    if (!legendConfig || !legendConfig.length) {
      return;
    }

    const gradientStops = legendConfig.map((stop, index) => {
      const pct = legendConfig.length <= 1 ? 0 : (index / (legendConfig.length - 1)) * 100;
      return `${rgba255ToCss(stop.color)} ${pct.toFixed(2)}%`;
    });

    const firstRange = parseRangeLabel(legendConfig[0].label);
    const lastRange = parseRangeLabel(legendConfig[legendConfig.length - 1].label);
    const rangeMin = firstRange?.min;
    const rangeMax = lastRange?.max;
    const rangeMid = Number.isFinite(rangeMin) && Number.isFinite(rangeMax)
      ? (rangeMin + rangeMax) / 2
      : null;

    legendTitle.textContent = pressureLabel;
    legendBar.style.background = `linear-gradient(90deg, ${gradientStops.join(", ")})`;
    legendMin.textContent = formatLegendNumber(rangeMin);
    legendMid.textContent = Number.isFinite(rangeMid) ? formatLegendNumber(rangeMid) : "";
    legendMax.textContent = formatLegendNumber(rangeMax);
  };

  updatePressureLegend(activePressureLabel, activeLayer);

  const averagePressureFieldByService = {
    "All ecosystem pressures": "mean_press_score",
    "Freshwater area use": "avg_press_area_of_freshwater_use",
    "Land use": "avg_press_area_of_land_use",
    "Seabed use": "avg_press_area_of_seabed_use",
    "Water use": "avg_press_volume_of_water_use",
    "Biotic resource extraction": "avg_press_other_biotic_resource_extraction_e_g_fish_timber",
    "Abiotic resource extraction": "avg_press_other_abiotic_resource_extraction",
    "Greenhouse-gas emissions": "avg_press_emissions_of_ghg",
    "Non-GHG air pollutants": "avg_press_emissions_of_non_ghg_air_pollutants",
    "Nutrient soil and water pollutants": "avg_press_emissions_of_nutrient_soil_and_water_pollutants",
    "Toxic soil and water pollutants": "avg_press_emissions_of_toxic_soil_and_water_pollutants",
    "Solid-waste generation": "avg_press_generation_and_release_of_solid_waste",
    "Introduction of invasive species": "avg_press_introduction_of_invasive_species",
    "Disturbance: noise and light": "avg_press_disturbances_e_g_noise_light",
  };

  map.on("click", async (event) => {
    try {
      const featureInfoUrl = buildGetFeatureInfoUrl(map, activeLayer, event.latlng, {
        infoFormat: "application/json",
      });
      const response = await fetch(withInfoFormat(featureInfoUrl, "application/json"));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const features = Array.isArray(payload?.features) ? payload.features : [];
      if (!features.length) {
        return;
      }

      const properties = features[0]?.properties || {};
      const hexId = firstDefinedValue(properties, ["hex_id", "hexid", "hex_id_1", "HEX_ID", "id"]);
      const companyCount = firstDefinedValue(properties, ["company_count", "count", "company_cou", "COMPANY_COUNT"]);
      const scoreField = averagePressureFieldByService[activePressureLabel];
      const averagePressure = scoreField ? firstDefinedValue(properties, [scoreField]) : undefined;

      const rows = [];
      rows.push(`<div><strong>Ecosystem pressure:</strong> ${escapeHtml(activePressureLabel)}</div>`);
      if (hexId !== undefined) {
        rows.push(`<div><strong>Hexagon ID:</strong> ${escapeHtml(String(hexId))}</div>`);
      }
      if (companyCount !== undefined) {
        rows.push(`<div><strong>Company count:</strong> ${escapeHtml(formatNumericValue(companyCount))}</div>`);
      }
      if (averagePressure !== undefined) {
        rows.push(`<div><strong>Average pressure per business:</strong> ${escapeHtml(formatNumericValue(averagePressure))}</div>`);
      }

      if (rows.length <= 1) {
        return;
      }

      L.popup()
        .setLatLng(event.latlng)
        .setContent(`<div>${rows.join("")}</div>`)
        .openOn(map);
    } catch (error) {
      console.error("[Pressure GetFeatureInfo] request failed", error?.message || error);
    }
  });

  createPressureLayerSelector(
    pressureSelector,
    pressureLayers,
    "All ecosystem pressures",
    (selectedLabel) => {
      const nextLayer = pressureLayers[selectedLabel];
      if (!nextLayer || nextLayer === activeLayer) {
        return;
      }
      if (map.hasLayer(activeLayer)) {
        map.removeLayer(activeLayer);
      }
      nextLayer.addTo(map);
      activeLayer = nextLayer;
      activePressureLabel = selectedLabel;
      updateState({ selectedPressure: activePressureLabel });
      updatePressureLegend(activePressureLabel, activeLayer);
    },
  );
}
