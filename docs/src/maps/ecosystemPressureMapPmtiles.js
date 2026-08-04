import { pressureLegendByLayerName } from "../config/pressureLegendData.js";
import { getState, subscribe, updateState } from "../state/state.js";
import {
  ensurePmtilesProtocolRegistered,
  loadMapLibrePmtilesAssets,
  escapeHtml,
  firstDefinedValue,
  formatNumericValue,
  rgba255ToCss,
  formatLegendNumber,
  buildGlobalFilterExpression,
  createLegendElement,
} from "./pmtilesMaplibreRuntime.js";

// PAGE-SPECIFIC CONFIGURATION: Pressure map
const CORE_HEX_PM_TILES_URL = new URL("../../Data/tiles/core_hex.pmtiles", import.meta.url).toString();
const HEX_OUTLINE_PM_TILES_URL = new URL("../../Data/tiles/hex_outline.pmtiles", import.meta.url).toString();

const PRESSURE_OUTLINE_ID = "ecosystem-pressure-outline-layer";
const PRESSURE_LAYER_ID = "ecosystem-pressure-thematic-layer";
const PRESSURE_OUTLINE_SOURCE = "ecosystem-pressure-outline-source";
const PRESSURE_THEMATIC_SOURCE = "ecosystem-pressure-thematic-source";

const DEFAULT_SERVICE = "All ecosystem pressures";
const PRESSURE_LAYER_STOPS = [
  { min: 0.02, max: 3.36, color: "255,250,230,240" },
  { min: 3.36, max: 5.07, color: "255,227,170,240" },
  { min: 5.07, max: 5.70, color: "252,180,98,240" },
  { min: 5.70, max: 6.55, color: "244,120,62,240" },
  { min: 6.55, max: 8.05, color: "208,62,45,240" },
  { min: 8.05, max: 10.50, color: "126,16,27,240" },
];

const PRESSURE_LEGEND_STOPS = [
  { label: "4.00 - 5.00", color: "255,242,221,190" },
  { label: "5.00 - 6.00", color: "224,173,160,190" },
  { label: "6.00 - 7.00", color: "198,117,109,190" },
  { label: "7.00 - 8.00", color: "180,76,73,190" },
  { label: "8.00 - 11.00", color: "168,50,50,190" },
];

const PRESSURE_OPTIONS = [
  { label: "All ecosystem pressures", field: "mean_press_score", legendLayerName: "All ecosystem pressures" },
  { label: "Freshwater area use", field: "avg_press_area_of_freshwater_use", legendLayerName: "Freshwater area use" },
  { label: "Land use", field: "avg_press_area_of_land_use", legendLayerName: "Land use" },
  { label: "Seabed use", field: "avg_press_area_of_seabed_use", legendLayerName: "Seabed use" },
  { label: "Water use", field: "avg_press_volume_of_water_use", legendLayerName: "Water use" },
  { label: "Biotic resource extraction", field: "avg_press_other_biotic_resource_extraction_e_g_fish_timber", legendLayerName: "Biotic resource extraction" },
  { label: "Abiotic resource extraction", field: "avg_press_other_abiotic_resource_extraction", legendLayerName: "Abiotic resource extraction" },
  { label: "Greenhouse-gas emissions", field: "avg_press_emissions_of_ghg", legendLayerName: "Greenhouse-gas emissions" },
  { label: "Non-GHG air pollutants", field: "avg_press_emissions_of_non_ghg_air_pollutants", legendLayerName: "Non-GHG air pollutants" },
  { label: "Nutrient soil and water pollutants", field: "avg_press_emissions_of_nutrient_soil_and_water_pollutants", legendLayerName: "Nutrient soil and water pollutants" },
  { label: "Toxic soil and water pollutants", field: "avg_press_emissions_of_toxic_soil_and_water_pollutants", legendLayerName: "Toxic soil and water pollutants" },
  { label: "Solid-waste generation", field: "avg_press_generation_and_release_of_solid_waste", legendLayerName: "Solid-waste generation" },
  { label: "Introduction of invasive species", field: "avg_press_introduction_of_invasive_species", legendLayerName: "Introduction of invasive species" },
  { label: "Disturbance: noise and light", field: "avg_press_disturbances_e_g_noise_light", legendLayerName: "Disturbance: noise and light" },
];

const pressureConfigByLabel = new Map(PRESSURE_OPTIONS.map((entry) => [entry.label, entry]));

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
    return PRESSURE_LEGEND_STOPS;
  }
  if (config.label === DEFAULT_SERVICE) {
    return PRESSURE_LEGEND_STOPS;
  }
  return pressureLegendByLayerName[config.legendLayerName] || [];
}

function getLayerStopsForSelection(config) {
  return PRESSURE_LAYER_STOPS;
}

function renderClassifiedLegend(legend, title, subtitle, stops) {
  if (!legend) {
    return;
  }

  legend.title.innerHTML = "";
  const titleText = document.createElement("span");
  titleText.className = "overall-gradient-legend-title-text";

  const legendLabel = document.createElement("span");
  legendLabel.className = "overall-gradient-legend-kicker";
  legendLabel.textContent = "Legend";

  const titleMain = document.createElement("span");
  titleMain.className = "overall-gradient-legend-main";
  titleMain.textContent = title;

  const titleSub = document.createElement("span");
  titleSub.className = "overall-gradient-legend-sub";
  titleSub.textContent = subtitle;

  titleText.append(legendLabel, titleMain, titleSub);
  legend.title.append(titleText);
  legend.bar.style.display = "none";

  const labelsContainer = legend.bar.nextElementSibling;
  if (!labelsContainer) {
    return;
  }
  labelsContainer.className = "overall-gradient-legend-labels overall-gradient-legend-classes";
  labelsContainer.innerHTML = "";

  stops.forEach((stop) => {
    const row = document.createElement("div");
    row.className = "overall-gradient-legend-class-row";

    const swatch = document.createElement("span");
    swatch.className = "overall-gradient-legend-class-swatch";
    swatch.style.background = rgba255ToCss(stop.color);
    swatch.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "overall-gradient-legend-class-label";
    label.textContent = `${formatLegendNumber(stop.min)} - ${formatLegendNumber(stop.max)}`;

    row.append(swatch, label);
    labelsContainer.append(row);
  });
}

function makeLegendCollapsible(legend) {
  if (!legend) {
    return null;
  }

  const legendRoot = legend.title?.closest(".overall-gradient-legend");
  if (!legendRoot) {
    return null;
  }

  legendRoot.classList.add("overall-gradient-legend--collapsible");

  const title = legend.title;
  const chevron = document.createElement("span");
  chevron.className = "overall-gradient-legend-chevron";
  chevron.setAttribute("aria-hidden", "true");
  title.append(chevron);

  title.setAttribute("role", "button");
  title.setAttribute("tabindex", "0");
  title.setAttribute("aria-label", "Toggle map legend");
  legendRoot.classList.add("is-collapsed");
  title.setAttribute("aria-expanded", "false");
  chevron.textContent = ">";

  const onToggle = () => {
    const collapsed = legendRoot.classList.toggle("is-collapsed");
    title.setAttribute("aria-expanded", collapsed ? "false" : "true");
    chevron.textContent = collapsed ? ">" : "v";
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };

  title.addEventListener("click", onToggle);
  title.addEventListener("keydown", onKeyDown);

  return () => {
    title.removeEventListener("click", onToggle);
    title.removeEventListener("keydown", onKeyDown);
    title.removeAttribute("role");
    title.removeAttribute("tabindex");
    title.removeAttribute("aria-label");
    title.removeAttribute("aria-expanded");
    chevron.remove();
  };
}

// PAGE-SPECIFIC: Build color step expression for pressure value
function buildColorExpression(propertyName, stops) {
  const expression = ["step", ["to-number", ["coalesce", ["get", propertyName], 0], 0]];
  if (!stops.length) {
    return expression;
  }

  expression.push(rgba255ToCss(stops[0].color));
  for (let index = 1; index < stops.length; index += 1) {
    const threshold = Number(stops[index].min);
    if (!Number.isFinite(threshold)) {
      continue;
    }
    expression.push(threshold, rgba255ToCss(stops[index].color));
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
  PRESSURE_OPTIONS.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.label;
    option.textContent = entry.label;
    selectElement.append(option);
  });

  selectElement.value = selectedLabel;
}

export async function initEcosystemPressureMapPmtiles() {
  const container = document.getElementById("ecosystem-pressure-map");
  const serviceSelector = document.getElementById("ecosystem-pressure-service-select");
  if (!container) {
    return;
  }

  // ============================================
  // INITIALIZE: Clean up and load assets
  // ============================================

  if (container._ecosystemPressurePmtilesMap) {
    container._ecosystemPressurePmtilesMap.remove();
    container._ecosystemPressurePmtilesMap = null;
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
  container._ecosystemPressurePmtilesMap = map;

  const legend = createLegendElement(container);
  let disposeLegendToggle = null;
  let activeServiceLabel = DEFAULT_SERVICE;
  let activeConfig = pressureConfigByLabel.get(activeServiceLabel) || PRESSURE_OPTIONS[0];

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
    map.addSource(PRESSURE_OUTLINE_SOURCE, {
      type: "vector",
      url: `pmtiles://${HEX_OUTLINE_PM_TILES_URL}`,
    });

    map.addSource(PRESSURE_THEMATIC_SOURCE, {
      type: "vector",
      url: `pmtiles://${CORE_HEX_PM_TILES_URL}`,
    });

    map.addLayer({
      id: PRESSURE_OUTLINE_ID,
      type: "line",
      source: PRESSURE_OUTLINE_SOURCE,
      "source-layer": "hex_outline",
      paint: {
        "line-color": "#6e6c66",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.45, 12, 1.25],
        "line-opacity": 0.9,
      },
    });

    map.addLayer({
      id: PRESSURE_LAYER_ID,
      type: "fill",
      source: PRESSURE_THEMATIC_SOURCE,
      "source-layer": "hex_thematic",
      paint: {
        "fill-color": buildColorExpression(activeConfig.field, getLayerStopsForSelection(activeConfig)),
        "fill-opacity": buildOpacityExpression(activeConfig.field),
      },
    }, PRESSURE_OUTLINE_ID);

    // Apply initial filters from state
    const applyFilters = (state) => {
      if (!map.getLayer(PRESSURE_LAYER_ID)) {
        return;
      }
      map.setFilter(PRESSURE_LAYER_ID, buildGlobalFilterExpression(state));
    };

    applyFilters(getState());

    // Set active service and sync UI
    const setActiveService = (serviceLabel, syncSelector = false) => {
      const nextConfig = pressureConfigByLabel.get(serviceLabel) || pressureConfigByLabel.get(DEFAULT_SERVICE);
      if (!nextConfig) {
        return;
      }

      activeServiceLabel = nextConfig.label;
      activeConfig = nextConfig;

      if (syncSelector && serviceSelector && serviceSelector.value !== activeServiceLabel) {
        serviceSelector.value = activeServiceLabel;
      }

      updateState({ selectedPressure: activeServiceLabel });

      const layerStops = getLayerStopsForSelection(nextConfig);
      map.setPaintProperty(PRESSURE_LAYER_ID, "fill-color", buildColorExpression(activeConfig.field, layerStops));
      map.setPaintProperty(PRESSURE_LAYER_ID, "fill-opacity", buildOpacityExpression(activeConfig.field));
      renderClassifiedLegend(legend, activeServiceLabel, "(Mean pressure score per Hexagon)", layerStops);
      if (disposeLegendToggle) {
        disposeLegendToggle();
      }
      disposeLegendToggle = makeLegendCollapsible(legend);
    };

    setActiveService(activeServiceLabel, true);

    // Bind click handler for popups
    map.on("click", (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: [PRESSURE_LAYER_ID] });
      if (!features.length) {
        return;
      }

      const properties = features[0].properties || {};
      const hexId = firstDefinedValue(properties, ["hex_id", "hexid", "hex_id_1", "HEX_ID", "id"]);
      const companyCount = firstDefinedValue(properties, ["company_count", "count", "company_cou", "COMPANY_COUNT"]);
      const averagePressure = activeConfig?.field ? firstDefinedValue(properties, [activeConfig.field]) : undefined;

      const rows = [];
      rows.push(`<div><strong>Ecosystem pressure:</strong> ${escapeHtml(activeServiceLabel)}</div>`);
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

      new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "320px" })
        .setLngLat(event.lngLat)
        .setHTML(`<div>${rows.join("")}</div>`)
        .addTo(map);
    });

    // Bind service selector for dynamic service switching
    if (serviceSelector) {
      if (serviceSelector._ecosystemPressureHandler) {
        serviceSelector.removeEventListener("change", serviceSelector._ecosystemPressureHandler);
      }

      setSelectorOptions(serviceSelector, activeServiceLabel);
      serviceSelector._ecosystemPressureHandler = (event) => {
        setActiveService(event.target.value);
      };
      serviceSelector.addEventListener("change", serviceSelector._ecosystemPressureHandler);
    }

    // ============================================
    // CLEANUP: On map removal
    // ============================================

    map.on("remove", () => {
      unsubscribe();
      if (disposeLegendToggle) {
        disposeLegendToggle();
      }
      if (serviceSelector?._ecosystemPressureHandler) {
        serviceSelector.removeEventListener("change", serviceSelector._ecosystemPressureHandler);
        delete serviceSelector._ecosystemPressureHandler;
      }
      if (container._ecosystemPressurePmtilesMap === map) {
        container._ecosystemPressurePmtilesMap = null;
      }
    });
  });

  // Subscribe to state changes for filter updates
  const unsubscribe = subscribe((nextState, previousState) => {
    if (
      nextState.localAuthorityCode !== previousState.localAuthorityCode
      || nextState.coarseCategory !== previousState.coarseCategory
    ) {
      const applyFilters = (state) => {
        if (!map.getLayer(PRESSURE_LAYER_ID)) {
          return;
        }
        map.setFilter(PRESSURE_LAYER_ID, buildGlobalFilterExpression(state));
      };
      applyFilters(nextState);
    }
  });

  map.resize();
}
