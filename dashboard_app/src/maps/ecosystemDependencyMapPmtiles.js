import { dependencyLegendByLayerName } from "../config/dependencyLegendData.js";
import { initDependencyRidgelineChart } from "../charts/dependencyRidgelineChart.js";
import { getState, subscribe, updateState } from "../state/state.js";
import {
  ensurePmtilesProtocolRegistered,
  loadMapLibrePmtilesAssets,
  escapeHtml,
  firstDefinedValue,
  formatNumericValue,
  rgba255ToCss,
  parseRangeLabel,
  formatLegendNumber,
  buildGlobalFilterExpression,
  createLegendElement,
  applyLegendValues,
} from "./pmtilesMaplibreRuntime.js";

// PAGE-SPECIFIC CONFIGURATION: Dependency map
const CORE_HEX_PM_TILES_URL = new URL("../../Data/tiles/core_hex.pmtiles", import.meta.url).toString();
const HEX_OUTLINE_PM_TILES_URL = new URL("../../Data/tiles/hex_outline.pmtiles", import.meta.url).toString();

const DEPENDENCY_OUTLINE_ID = "ecosystem-dependency-outline-layer";
const DEPENDENCY_LAYER_ID = "ecosystem-dependency-thematic-layer";
const DEPENDENCY_OUTLINE_SOURCE = "ecosystem-dependency-outline-source";
const DEPENDENCY_THEMATIC_SOURCE = "ecosystem-dependency-thematic-source";

const DEFAULT_SERVICE = "All ecosystem dependencies";

const DEPENDENCY_LEGEND_STOPS = [
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

const DEPENDENCY_OPTIONS = [
  { label: "All ecosystem dependencies", field: "mean_dep_score", legendLayerName: "Average dependency" },
  { label: "Air filtration", field: "avg_dep_air_filtration", legendLayerName: "Air filtration" },
  { label: "Biological control", field: "avg_dep_biological_control", legendLayerName: "Biological control" },
  { label: "Biomass provisioning", field: "avg_dep_biomass_provisioning", legendLayerName: "Biomass provisioning" },
  { label: "Education, scientific and research services", field: "avg_dep_education_scientific_and_research_services", legendLayerName: "Education scientific and research services" },
  { label: "Flood control", field: "avg_dep_flood_control", legendLayerName: "Flood control" },
  { label: "Genetic material", field: "avg_dep_genetic_material", legendLayerName: "Genetic material" },
  { label: "Global climate regulation", field: "avg_dep_global_climate_regulation", legendLayerName: "Global climate regulation" },
  { label: "Local climate regulation", field: "avg_dep_local_micro_and_meso_climate_regulation", legendLayerName: "Local climate regulation" },
  { label: "Noise attenuation", field: "avg_dep_noise_attenuation", legendLayerName: "Noise attenuation" },
  { label: "Nursery population and habitat maintenance", field: "avg_dep_nursery_population_and_habitat_maintenance", legendLayerName: "Nursery population and habitat maintenance" },
  { label: "Animal-based energy", field: "avg_dep_other_provisioning_services_animal_based_energy", legendLayerName: "Animal-based energy" },
  { label: "Dilution by atmosphere and ecosystems", field: "avg_dep_other_regulating_and_maintenance_service_dilution_by_atmosphere_and_ecosystems", legendLayerName: "Dilution by atmosphere and ecosystems" },
  { label: "Mediation of sensory impacts", field: "avg_dep_other_regulating_and_maintenance_service_mediation_of_sensory_impacts_other_than_noise", legendLayerName: "Mediation of sensory impacts" },
  { label: "Pollination", field: "avg_dep_pollination", legendLayerName: "Pollination" },
  { label: "Rainfall pattern regulation", field: "avg_dep_rainfall_pattern_regulation", legendLayerName: "Rainfall pattern regulation" },
  { label: "Recreation-related services", field: "avg_dep_recreation_related_services", legendLayerName: "Recreation-related services" },
  { label: "Soil and sediment retention", field: "avg_dep_soil_and_sediment_retention", legendLayerName: "Soil and sediment retention" },
  { label: "Soil quality regulation", field: "avg_dep_soil_quality_regulation", legendLayerName: "Soil quality regulation" },
  { label: "Solid-waste remediation", field: "avg_dep_solid_waste_remediation", legendLayerName: "Solid-waste remediation" },
  { label: "Spiritual, artistic and symbolic services", field: "avg_dep_spiritual_artistic_and_symbolic_services", legendLayerName: "Spiritual artistic and symbolic services" },
  { label: "Storm mitigation", field: "avg_dep_storm_mitigation", legendLayerName: "Storm mitigation" },
  { label: "Visual amenity services", field: "avg_dep_visual_amenity_services", legendLayerName: "Visual amenity services" },
  { label: "Water-flow regulation", field: "avg_dep_water_flow_regulation", legendLayerName: "Water-flow regulation" },
  { label: "Water purification", field: "avg_dep_water_purification", legendLayerName: "Water purification" },
  { label: "Water supply", field: "avg_dep_water_supply", legendLayerName: "Water supply" },
];

const dependencyConfigByLabel = new Map(DEPENDENCY_OPTIONS.map((entry) => [entry.label, entry]));

// PAGE-SPECIFIC: Create MapLibre style
const CARTO_BASEMAP_ATTRIBUTION = "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors &copy; <a href='https://carto.com/attributions'>CARTO</a>";

function buildMapStyle() {
  return {
    version: 8,
    sources: {
      "carto-basemap": {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: CARTO_BASEMAP_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: "carto-basemap-layer",
        type: "raster",
        source: "carto-basemap",
      },
    ],
  };
}

// PAGE-SPECIFIC: Get legend stops for the selected service
function getLegendStopsForSelection(config) {
  if (!config) {
    return DEPENDENCY_LEGEND_STOPS;
  }
  if (config.label === DEFAULT_SERVICE) {
    return DEPENDENCY_LEGEND_STOPS;
  }
  return dependencyLegendByLayerName[config.legendLayerName] || [];
}

// PAGE-SPECIFIC: Build color step expression for dependency value
function buildColorExpression(propertyName, stops) {
  const expression = ["step", ["to-number", ["coalesce", ["get", propertyName], 0], 0]];
  if (!stops.length) {
    return expression;
  }

  expression.push(rgba255ToCss(stops[0].color));
  for (let index = 1; index < stops.length; index += 1) {
    const range = parseRangeLabel(stops[index].label);
    if (!range) {
      continue;
    }
    expression.push(range.min, rgba255ToCss(stops[index].color));
  }

  return expression;
}

// PAGE-SPECIFIC: Build opacity expression (null-check based)
function buildOpacityExpression(propertyName) {
  return ["case", ["==", ["get", propertyName], null], 0, 0.88];
}

// PAGE-SPECIFIC: Populate service selector with all options
function setSelectorOptions(selectElement, selectedLabel) {
  if (!selectElement) {
    return;
  }

  selectElement.innerHTML = "";
  DEPENDENCY_OPTIONS.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.label;
    option.textContent = entry.label;
    selectElement.append(option);
  });

  selectElement.value = selectedLabel;
}

export async function initEcosystemDependencyMapPmtiles() {
  initDependencyRidgelineChart();

  const container = document.getElementById("ecosystem-dependency-map");
  const serviceSelector = document.getElementById("ecosystem-dependency-service-select");
  if (!container) {
    return;
  }

  // ============================================
  // INITIALIZE: Clean up and load assets
  // ============================================

  if (container._ecosystemDependencyPmtilesMap) {
    container._ecosystemDependencyPmtilesMap.remove();
    container._ecosystemDependencyPmtilesMap = null;
  }
  container.innerHTML = "";

  const { maplibregl, pmtiles } = await loadMapLibrePmtilesAssets();
  ensurePmtilesProtocolRegistered(maplibregl, pmtiles);

  // ============================================
  // CREATE: Map instance and legend
  // ============================================

  const map = new maplibregl.Map({
    container,
    style: buildMapStyle(),
    center: [-4.3, 56.7],
    zoom: 6,
    minZoom: 5,
    maxZoom: 12,
    attributionControl: false,
    interactive: true,
  });
  container._ecosystemDependencyPmtilesMap = map;

  const legend = createLegendElement(container);
  let activeServiceLabel = DEFAULT_SERVICE;
  let activeConfig = dependencyConfigByLabel.get(activeServiceLabel) || DEPENDENCY_OPTIONS[0];

  const applyFilters = (state) => {
    if (!map.getLayer(DEPENDENCY_LAYER_ID)) {
      return;
    }
    map.setFilter(DEPENDENCY_LAYER_ID, buildGlobalFilterExpression(state));
  };

  const setActiveService = (serviceLabel, syncSelector = false) => {
    const nextConfig = dependencyConfigByLabel.get(serviceLabel) || dependencyConfigByLabel.get(DEFAULT_SERVICE);
    if (!nextConfig) {
      return;
    }

    activeServiceLabel = nextConfig.label;
    activeConfig = nextConfig;

    if (syncSelector && serviceSelector && serviceSelector.value !== activeServiceLabel) {
      serviceSelector.value = activeServiceLabel;
    }

    const stops = getLegendStopsForSelection(nextConfig);
    map.setPaintProperty(DEPENDENCY_LAYER_ID, "fill-color", buildColorExpression(activeConfig.field, stops));
    map.setPaintProperty(DEPENDENCY_LAYER_ID, "fill-opacity", buildOpacityExpression(activeConfig.field));
    applyLegendValues(legend, activeServiceLabel, stops);
    updateState({ selectedDependency: activeServiceLabel });
  };

  // ============================================
  // LOAD: Sources (PMTiles)
  // ============================================

  // ============================================
  // CREATE: Layers (outline, thematic)
  // ============================================

  // ============================================
  // BIND: Events (filters, selectors, popups)
  // ============================================

  map.on("load", () => {
    map.addSource(DEPENDENCY_OUTLINE_SOURCE, {
      type: "vector",
      url: `pmtiles://${HEX_OUTLINE_PM_TILES_URL}`,
    });

    map.addSource(DEPENDENCY_THEMATIC_SOURCE, {
      type: "vector",
      url: `pmtiles://${CORE_HEX_PM_TILES_URL}`,
    });

    map.addLayer({
      id: DEPENDENCY_OUTLINE_ID,
      type: "line",
      source: DEPENDENCY_OUTLINE_SOURCE,
      "source-layer": "hex_outline",
      paint: {
        "line-color": "#6e6c66",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.45, 12, 1.25],
        "line-opacity": 0.9,
      },
    });

    map.addLayer({
      id: DEPENDENCY_LAYER_ID,
      type: "fill",
      source: DEPENDENCY_THEMATIC_SOURCE,
      "source-layer": "hex_thematic",
      paint: {
        "fill-color": buildColorExpression(activeConfig.field, getLegendStopsForSelection(activeConfig)),
        "fill-opacity": buildOpacityExpression(activeConfig.field),
      },
    }, DEPENDENCY_OUTLINE_ID);

    applyFilters(getState());
    setActiveService(activeServiceLabel, true);

    map.on("click", (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: [DEPENDENCY_LAYER_ID] });
      if (!features.length) {
        return;
      }

      const properties = features[0].properties || {};
      const hexId = firstDefinedValue(properties, ["hex_id", "hexid", "hex_id_1", "HEX_ID", "id"]);
      const companyCount = firstDefinedValue(properties, ["company_count", "count", "company_cou", "COMPANY_COUNT"]);
      const averageDependency = activeConfig?.field ? firstDefinedValue(properties, [activeConfig.field]) : undefined;

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

      new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "320px" })
        .setLngLat(event.lngLat)
        .setHTML(`<div>${rows.join("")}</div>`)
        .addTo(map);
    });
  });

  if (serviceSelector) {
    if (serviceSelector._ecosystemDependencyHandler) {
      serviceSelector.removeEventListener("change", serviceSelector._ecosystemDependencyHandler);
    }

    setSelectorOptions(serviceSelector, activeServiceLabel);
    serviceSelector._ecosystemDependencyHandler = (event) => {
      setActiveService(event.target.value);
    };
    serviceSelector.addEventListener("change", serviceSelector._ecosystemDependencyHandler);
  }

  const unsubscribe = subscribe((nextState, previousState) => {
    if (
      nextState.localAuthorityCode !== previousState.localAuthorityCode
      || nextState.coarseCategory !== previousState.coarseCategory
    ) {
      applyFilters(nextState);
    }
  });

  map.on("remove", () => {
    unsubscribe();
    if (serviceSelector?._ecosystemDependencyHandler) {
      serviceSelector.removeEventListener("change", serviceSelector._ecosystemDependencyHandler);
      delete serviceSelector._ecosystemDependencyHandler;
    }
    if (container._ecosystemDependencyPmtilesMap === map) {
      container._ecosystemDependencyPmtilesMap = null;
    }
  });

  applyLegendValues(legend, activeServiceLabel, getLegendStopsForSelection(activeConfig));
  map.resize();
}
