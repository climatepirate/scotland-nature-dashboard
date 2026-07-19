import { qgisServerConfig, qgisWmsLayers } from "../config/qgisServer.js";
import { dependencyLegendByLayerName } from "../config/dependencyLegendData.js";
import { bindGlobalFiltersToWmsLayers } from "../filters/globalMapFilter.js";
import { createScotlandHexOutlineLayer } from "./sharedHexOutlineLayer.js";
import { updateState } from "../state/state.js";
import { initDependencyRidgelineChart } from "../charts/dependencyRidgelineChart.js";

const allDependencyLegendStops = [
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
];

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

function createDependencyLayerSelector(selectElement, dependencyLayers, initialLabel, onChange) {
  if (!selectElement) {
    return;
  }

  const labels = Object.keys(dependencyLayers);
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

export function initEcosystemDependencyMap() {
  initDependencyRidgelineChart();

  const container = document.getElementById("ecosystem-dependency-map");
  const serviceSelector = document.getElementById("ecosystem-dependency-service-select");
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

  map.createPane("depBasemapPane");
  map.getPane("depBasemapPane").style.zIndex = "200";
  map.createPane("depHexOutlinePane");
  map.getPane("depHexOutlinePane").style.zIndex = "300";
  map.createPane("depThematicPane");
  map.getPane("depThematicPane").style.zIndex = "400";

  const basemapLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    pane: "depBasemapPane",
  }).addTo(map);

  createScotlandHexOutlineLayer("depHexOutlinePane").addTo(map);

  const dependencyLayers = {
    "All ecosystem dependencies": L.tileLayer.wms(qgisServerConfig.baseUrl, {
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
      pane: "depThematicPane",
    }),
    "Air filtration": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depAirFiltration,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Biological control": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depBiologicalControl,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Biomass provisioning": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depBiomassProvisioning,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Education, scientific and research services": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depEducationScientificResearchServices,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Flood control": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depFloodControl,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Genetic material": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depGeneticMaterial,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Global climate regulation": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depGlobalClimateRegulation,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Local climate regulation": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depLocalClimateRegulation,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Noise attenuation": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depNoiseAttenuation,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Nursery population and habitat maintenance": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depNurseryHabitatMaintenance,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Animal-based energy": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depAnimalBasedEnergy,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Dilution by atmosphere and ecosystems": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depDilutionAtmosphereEcosystems,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Mediation of sensory impacts": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depMediationSensoryImpacts,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    Pollination: L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depPollination,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Rainfall pattern regulation": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depRainfallPatternRegulation,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Recreation-related services": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depRecreationRelatedServices,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Soil and sediment retention": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depSoilSedimentRetention,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Soil quality regulation": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depSoilQualityRegulation,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Solid-waste remediation": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depSolidWasteRemediation,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Spiritual, artistic and symbolic services": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depSpiritualArtisticSymbolicServices,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Storm mitigation": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depStormMitigation,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Visual amenity services": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depVisualAmenityServices,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Water-flow regulation": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depWaterFlowRegulation,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Water purification": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depWaterPurification,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
    "Water supply": L.tileLayer.wms(qgisServerConfig.baseUrl, {
      uppercase: true,
      service: "WMS",
      request: "GetMap",
      version: "1.3.0",
      layers: qgisWmsLayers.depWaterSupply,
      styles: "",
      format: "image/png",
      transparent: true,
      MAP: qgisServerConfig.projectPath,
      crs: L.CRS.EPSG3857,
      pane: "depThematicPane",
    }),
  };

  const initialLayer = dependencyLayers["All ecosystem dependencies"];
  bindGlobalFiltersToWmsLayers(Object.values(dependencyLayers));
  initialLayer.addTo(map);
  let activeLayer = initialLayer;
  let activeServiceLabel = "All ecosystem dependencies";
  updateState({ selectedDependency: activeServiceLabel });

  const updateDependencyLegend = (serviceLabel, wmsLayerName) => {
    const legendConfig = serviceLabel === "All ecosystem dependencies"
      ? allDependencyLegendStops
      : dependencyLegendByLayerName[wmsLayerName];
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

    legendTitle.textContent = serviceLabel;
    legendBar.style.background = `linear-gradient(90deg, ${gradientStops.join(", ")})`;
    legendMin.textContent = formatLegendNumber(rangeMin);
    legendMid.textContent = Number.isFinite(rangeMid) ? formatLegendNumber(rangeMid) : "";
    legendMax.textContent = formatLegendNumber(rangeMax);
  };

  updateDependencyLegend(activeServiceLabel, activeLayer.wmsParams.layers);

  const averageDependencyFieldByService = {
    "All ecosystem dependencies": "mean_dep_score",
    "Air filtration": "avg_dep_air_filtration",
    "Biological control": "avg_dep_biological_control",
    "Biomass provisioning": "avg_dep_biomass_provisioning",
    "Education, scientific and research services": "avg_dep_education_scientific_and_research_services",
    "Flood control": "avg_dep_flood_control",
    "Genetic material": "avg_dep_genetic_material",
    "Global climate regulation": "avg_dep_global_climate_regulation",
    "Local climate regulation": "avg_dep_local_micro_and_meso_climate_regulation",
    "Noise attenuation": "avg_dep_noise_attenuation",
    "Nursery population and habitat maintenance": "avg_dep_nursery_population_and_habitat_maintenance",
    "Animal-based energy": "avg_dep_other_provisioning_services_animal_based_energy",
    "Dilution by atmosphere and ecosystems": "avg_dep_other_regulating_and_maintenance_service_dilution_by_atmosphere_and_ecosystems",
    "Mediation of sensory impacts": "avg_dep_other_regulating_and_maintenance_service_mediation_of_sensory_impacts_other_than_noise",
    Pollination: "avg_dep_pollination",
    "Rainfall pattern regulation": "avg_dep_rainfall_pattern_regulation",
    "Recreation-related services": "avg_dep_recreation_related_services",
    "Soil and sediment retention": "avg_dep_soil_and_sediment_retention",
    "Soil quality regulation": "avg_dep_soil_quality_regulation",
    "Solid-waste remediation": "avg_dep_solid_waste_remediation",
    "Spiritual, artistic and symbolic services": "avg_dep_spiritual_artistic_and_symbolic_services",
    "Storm mitigation": "avg_dep_storm_mitigation",
    "Visual amenity services": "avg_dep_visual_amenity_services",
    "Water-flow regulation": "avg_dep_water_flow_regulation",
    "Water purification": "avg_dep_water_purification",
    "Water supply": "avg_dep_water_supply",
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
      const scoreField = averageDependencyFieldByService[activeServiceLabel];
      const averageDependency = scoreField ? firstDefinedValue(properties, [scoreField]) : undefined;

      const rows = [];
      rows.push(`<div><strong>Ecosystem service:</strong> ${escapeHtml(activeServiceLabel)}</div>`);
      if (hexId !== undefined) {
        rows.push(`<div><strong>Hexagon ID:</strong> ${escapeHtml(String(hexId))}</div>`);
      }
      if (companyCount !== undefined) {
        rows.push(`<div><strong>Company count:</strong> ${escapeHtml(formatNumericValue(companyCount))}</div>`);
      }
      if (averageDependency !== undefined) {
        rows.push(`<div><strong>Average dependency per business:</strong> ${escapeHtml(formatNumericValue(averageDependency))}</div>`);
      }

      if (rows.length <= 1) {
        return;
      }

      L.popup()
        .setLatLng(event.latlng)
        .setContent(`<div>${rows.join("")}</div>`)
        .openOn(map);
    } catch (error) {
      console.error("[Dependency GetFeatureInfo] request failed", error?.message || error);
    }
  });

  createDependencyLayerSelector(
    serviceSelector,
    dependencyLayers,
    "All ecosystem dependencies",
    (selectedLabel) => {
      const nextLayer = dependencyLayers[selectedLabel];
      if (!nextLayer || nextLayer === activeLayer) {
        return;
      }
      if (map.hasLayer(activeLayer)) {
        map.removeLayer(activeLayer);
      }
      nextLayer.addTo(map);
      activeLayer = nextLayer;
      activeServiceLabel = selectedLabel;
      updateState({ selectedDependency: activeServiceLabel });
      updateDependencyLegend(activeServiceLabel, activeLayer.wmsParams.layers);
    },
  );
}
