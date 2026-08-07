import { getState, subscribe } from "../state/state.js";
import {
  ensurePmtilesProtocolRegistered,
  loadMapLibrePmtilesAssets,
  addRecenterControl,
  escapeHtml,
  firstDefinedValue,
  formatNumericValue,
  rgba255ToCss,
  parseRangeLabel,
  formatLegendNumber,
  buildGlobalFilterExpression,
  createLegendElement,
} from "./pmtilesMaplibreRuntime.js";

// PAGE-SPECIFIC CONFIGURATION: Overview map
const CORE_HEX_PM_TILES_URL = new URL("../../Data/tiles/core_hex.pmtiles", import.meta.url).toString();
const HEX_OUTLINE_PM_TILES_URL = new URL("../../Data/tiles/hex_outline.pmtiles", import.meta.url).toString();

const BUSINESS_OUTLINE_ID = "overall-business-outline-layer";
const BUSINESS_LAYER_ID = "overall-business-thematic-layer";
const BUSINESS_OUTLINE_SOURCE = "overall-business-outline-source";
const BUSINESS_THEMATIC_SOURCE = "overall-business-thematic-source";

const COMPANY_CONCENTRATION_CLASS_COUNT = 6;
const COMPANY_CONCENTRATION_PALETTE = [
  "232,241,251,235",
  "145,179,218,235",
  "106,152,204,235",
  "72,124,186,235",
  "24,72,140,235",
  "10,50,118,235",
];
const COMPANY_CONCENTRATION_BREAKS = [1, 2, 5, 12, 30, 80, 33068];

function roundClassBound(value, mode = "nearest") {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (mode === "floor") {
    return Math.floor(value);
  }
  if (mode === "ceil") {
    return Math.ceil(value);
  }
  return Math.round(value);
}

function uniqueSortedNumbers(values) {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value)))).sort((a, b) => a - b);
}

function computeJenksBreaks(values, classCount) {
  const sortedValues = [...values].sort((a, b) => a - b);
  const n = sortedValues.length;
  if (!n) {
    return [];
  }

  const uniqueValues = uniqueSortedNumbers(sortedValues);
  const k = Math.max(2, Math.min(classCount, uniqueValues.length));
  if (uniqueValues.length <= 1) {
    return [uniqueValues[0], uniqueValues[0]];
  }

  const lowerClassLimits = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0));
  const varianceCombinations = Array.from({ length: n + 1 }, () => Array(k + 1).fill(Infinity));

  for (let i = 1; i <= k; i += 1) {
    lowerClassLimits[0][i] = 1;
    varianceCombinations[0][i] = 0;
  }

  for (let l = 1; l <= n; l += 1) {
    let sum = 0;
    let sumSquares = 0;
    let w = 0;
    let variance = 0;

    for (let m = 1; m <= l; m += 1) {
      const lowerClassLimit = l - m + 1;
      const value = sortedValues[lowerClassLimit - 1];
      w += 1;
      sum += value;
      sumSquares += value * value;
      variance = sumSquares - (sum * sum) / w;

      if (lowerClassLimit > 1) {
        for (let j = 2; j <= k; j += 1) {
          const candidate = variance + varianceCombinations[lowerClassLimit - 1][j - 1];
          if (candidate < varianceCombinations[l][j]) {
            lowerClassLimits[l][j] = lowerClassLimit;
            varianceCombinations[l][j] = candidate;
          }
        }
      }
    }

    lowerClassLimits[l][1] = 1;
    varianceCombinations[l][1] = variance;
  }

  const breaks = Array(k + 1).fill(0);
  breaks[k] = sortedValues[n - 1];
  breaks[0] = sortedValues[0];

  let count = k;
  let last = n;
  while (count > 1) {
    const idx = Math.max(1, lowerClassLimits[last][count]) - 1;
    breaks[count - 1] = sortedValues[Math.max(0, idx - 1)];
    last = idx;
    count -= 1;
  }

  const cleaned = [breaks[0]];
  for (let i = 1; i < breaks.length; i += 1) {
    if (breaks[i] > cleaned[cleaned.length - 1]) {
      cleaned.push(breaks[i]);
    }
  }
  if (cleaned[cleaned.length - 1] !== sortedValues[n - 1]) {
    cleaned.push(sortedValues[n - 1]);
  }

  return cleaned.length >= 2 ? cleaned : [];
}

function buildClassifiedStopsFromBreaks(rawBreaks, palette) {
  if (!rawBreaks || rawBreaks.length < 2) {
    return [];
  }

  const breaks = [...rawBreaks].sort((a, b) => a - b);
  const stops = [];
  for (let i = 0; i < breaks.length - 1; i += 1) {
    const min = i === 0 ? roundClassBound(breaks[i], "floor") : roundClassBound(breaks[i], "ceil");
    const max = roundClassBound(breaks[i + 1], "ceil");
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      continue;
    }
    const color = palette[Math.min(i, palette.length - 1)];
    stops.push({
      min,
      max,
      color,
      label: `${formatLegendNumber(min)} - ${formatLegendNumber(max)}`,
    });
  }

  return stops;
}

function extractCompanyCountsFromSource(map) {
  const features = map.querySourceFeatures(BUSINESS_THEMATIC_SOURCE, {
    sourceLayer: "hex_thematic",
  });

  const seenHexIds = new Set();
  const values = [];
  for (const feature of features) {
    const properties = feature.properties || {};
    const hexId = firstDefinedValue(properties, ["hex_id", "hexid", "hex_id_1", "HEX_ID", "id"]);
    if (hexId !== undefined && seenHexIds.has(hexId)) {
      continue;
    }
    if (hexId !== undefined) {
      seenHexIds.add(hexId);
    }

    const rawCount = firstDefinedValue(properties, ["company_count", "count", "company_cou", "COMPANY_COUNT"]);
    const count = Number(rawCount);
    if (Number.isFinite(count)) {
      values.push(count);
    }
  }

  return values;
}

function renderClassifiedLegend(legend, stops) {
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
  titleMain.textContent = "Company Concentration";

  const titleSub = document.createElement("span");
  titleSub.className = "overall-gradient-legend-sub";
  titleSub.textContent = "(Businesses per Hexagon)";

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

const CONTEXT_LAYER_DEFINITIONS = {
  "National Parks": {
    key: "national-parks",
    dataUrl: new URL("../../Data/context/national_parks.geojson", import.meta.url).toString(),
    fillColor: "#4f8f72",
    lineColor: "#2f6d53",
  },
  "National Nature Reserves": {
    key: "national-nature-reserves",
    dataUrl: new URL("../../Data/context/national_nature_reserves.geojson", import.meta.url).toString(),
    fillColor: "#7a8f55",
    lineColor: "#57683a",
  },
  "Sites of Special Scientific Interest (SSSI)": {
    key: "sssi",
    dataUrl: new URL("../../Data/context/sssi.geojson", import.meta.url).toString(),
    fillColor: "#8f9ab3",
    lineColor: "#62708e",
  },
  "Wild Land Areas": {
    key: "wild-land-areas",
    dataUrl: new URL("../../Data/context/wild_land_areas.geojson", import.meta.url).toString(),
    fillColor: "#9b7f6a",
    lineColor: "#6f5644",
  },
  "World Heritage Sites": {
    key: "world-heritage-sites",
    dataUrl: new URL("../../Data/context/world_heritage_sites.geojson", import.meta.url).toString(),
    fillColor: "#8f6f95",
    lineColor: "#65456b",
  },
};

function contextSourceId(contextKey) {
  return `overall-context-source-${contextKey}`;
}

function contextFillLayerId(contextKey) {
  return `overall-context-fill-${contextKey}`;
}

function contextLineLayerId(contextKey) {
  return `overall-context-line-${contextKey}`;
}

function contextCircleLayerId(contextKey) {
  return `overall-context-circle-${contextKey}`;
}

function removeContextLayers(map, contextKey) {
  const fillId = contextFillLayerId(contextKey);
  const lineId = contextLineLayerId(contextKey);
  const circleId = contextCircleLayerId(contextKey);

  if (map.getLayer(fillId)) {
    map.removeLayer(fillId);
  }
  if (map.getLayer(lineId)) {
    map.removeLayer(lineId);
  }
  if (map.getLayer(circleId)) {
    map.removeLayer(circleId);
  }

  const sourceId = contextSourceId(contextKey);
  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

function addContextLayers(map, contextName) {
  const config = CONTEXT_LAYER_DEFINITIONS[contextName];
  if (!config) {
    return;
  }

  const sourceId = contextSourceId(config.key);
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: "geojson",
      data: config.dataUrl,
    });
  }

  const beforeLayerId = map.getLayer(BUSINESS_OUTLINE_ID) ? BUSINESS_OUTLINE_ID : undefined;

  map.addLayer({
    id: contextFillLayerId(config.key),
    type: "fill",
    source: sourceId,
    paint: {
      "fill-color": config.fillColor,
      "fill-opacity": 0.22,
    },
    filter: ["==", ["geometry-type"], "Polygon"],
  }, beforeLayerId);

  map.addLayer({
    id: contextLineLayerId(config.key),
    type: "line",
    source: sourceId,
    paint: {
      "line-color": config.lineColor,
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 12, 2.2],
      "line-opacity": 0.95,
    },
    filter: ["in", ["geometry-type"], ["literal", ["Polygon", "LineString", "MultiLineString"]]],
  }, beforeLayerId);

  map.addLayer({
    id: contextCircleLayerId(config.key),
    type: "circle",
    source: sourceId,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 12, 5],
      "circle-color": config.lineColor,
      "circle-opacity": 0.85,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 0.7,
    },
    filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
  }, beforeLayerId);
}

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
    glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  };
}

// PAGE-SPECIFIC: Build color step expression for company count
function buildColorExpression(stops) {
  const expression = ["step", ["to-number", ["coalesce", ["get", "company_count"], 0], 0]];
  if (!stops.length) {
    return expression;
  }

  expression.push(rgba255ToCss(stops[0].color));
  for (let index = 1; index < stops.length; index += 1) {
    const threshold = Number.isFinite(stops[index].min)
      ? Number(stops[index].min)
      : parseRangeLabel(stops[index].label)?.min;
    if (!Number.isFinite(threshold)) {
      continue;
    }
    expression.push(threshold, rgba255ToCss(stops[index].color));
  }

  return expression;
}

// PAGE-SPECIFIC: Build opacity expression (hover-based)
function buildOpacityExpression() {
  return ["case", ["boolean", ["feature-state", "hover"], false], 0.86, 0.72];
}

export async function initOverallBusinessMapPmtiles() {
  const container = document.getElementById("overall-business-map");
  const contextLayerSelect = document.getElementById("overall-context-layer-select");
  if (!container) {
    return;
  }

  // ============================================
  // INITIALIZE: Clean up and load assets
  // ============================================

  if (container._overallBusinessPmtilesMap) {
    container._overallBusinessPmtilesMap.remove();
    container._overallBusinessPmtilesMap = null;
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
    zoom: 5.7,
    minZoom: 5,
    maxZoom: 12,
    attributionControl: false,
    interactive: true,
  });
  container._overallBusinessPmtilesMap = map;

  addRecenterControl(map, maplibregl, {
    center: [-4.3, 56.7],
    zoom: 5.7,
    bearing: 0,
    pitch: 0,
  });

  const legend = createLegendElement(container);
  let disposeLegendToggle = null;
  let activeContextName = "None";
  let companyConcentrationStops = buildClassifiedStopsFromBreaks(
    COMPANY_CONCENTRATION_BREAKS,
    COMPANY_CONCENTRATION_PALETTE,
  );

  const applyCompanyConcentrationLegend = () => {
    renderClassifiedLegend(legend, companyConcentrationStops);
    if (disposeLegendToggle) {
      disposeLegendToggle();
    }
    disposeLegendToggle = makeLegendCollapsible(legend);
  };

  // ============================================
  // LOAD: Sources (PMTiles)
  // ============================================

  const onLoad = () => {
    map.addSource(BUSINESS_OUTLINE_SOURCE, {
      type: "vector",
      url: `pmtiles://${HEX_OUTLINE_PM_TILES_URL}`,
    });

    map.addSource(BUSINESS_THEMATIC_SOURCE, {
      type: "vector",
      url: `pmtiles://${CORE_HEX_PM_TILES_URL}`,
    });

    // ============================================
    // CREATE: Layers (outline, thematic)
    // ============================================

    map.addLayer({
      id: BUSINESS_OUTLINE_ID,
      type: "line",
      source: BUSINESS_OUTLINE_SOURCE,
      "source-layer": "hex_outline",
      paint: {
        "line-color": "#6e6c66",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.45, 12, 1.25],
        "line-opacity": 0.9,
      },
    });

    map.addLayer({
      id: BUSINESS_LAYER_ID,
      type: "fill",
      source: BUSINESS_THEMATIC_SOURCE,
      "source-layer": "hex_thematic",
      paint: {
        "fill-color": buildColorExpression(companyConcentrationStops),
        "fill-opacity": buildOpacityExpression(),
      },
    }, BUSINESS_OUTLINE_ID);

    // ============================================
    // BIND: Events (filters, popups, UI)
    // ============================================

    // Apply initial filters from state
    const applyFilters = (state) => {
      if (!map.getLayer(BUSINESS_LAYER_ID)) {
        return;
      }
      map.setFilter(BUSINESS_LAYER_ID, buildGlobalFilterExpression(state));
    };

    applyFilters(getState());

    // Apply initial legend
    applyCompanyConcentrationLegend();

    // Keep one stable class scheme so the map does not "flash" into a second styling pass.

    // Bind click handler for popups
    map.on("click", (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: [BUSINESS_LAYER_ID] });
      if (!features.length) {
        return;
      }

      const properties = features[0].properties || {};
      const hexId = firstDefinedValue(properties, ["hex_id", "hexid", "hex_id_1", "HEX_ID", "id"]);
      const companyCount = firstDefinedValue(properties, ["company_count", "count", "company_cou", "COMPANY_COUNT"]);
      const averageDependency = firstDefinedValue(properties, ["mean_dep_score", "mean_dependency_score", "dependency_mean", "mean_dep", "MEAN_DEPENDENCY_SCORE"]);
      const averagePressure = firstDefinedValue(properties, ["mean_press_score", "mean_pressure_score", "pressure_mean", "mean_pres", "MEAN_PRESSURE_SCORE"]);

      const rows = [];
      if (hexId !== undefined) {
        rows.push(`<div><strong>Hexagon ID:</strong> ${escapeHtml(String(hexId))}</div>`);
      }
      if (companyCount !== undefined) {
        rows.push(`<div><strong>Company count:</strong> ${escapeHtml(formatNumericValue(companyCount))}</div>`);
      }
      if (averageDependency !== undefined) {
        rows.push(`<div><strong>Average dependency per business:</strong> ${escapeHtml(formatNumericValue(averageDependency))}</div>`);
      }
      if (averagePressure !== undefined) {
        rows.push(`<div><strong>Average pressure per business:</strong> ${escapeHtml(formatNumericValue(averagePressure))}</div>`);
      }

      if (!rows.length) {
        return;
      }

      new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "320px" })
        .setLngLat(event.lngLat)
        .setHTML(`<div>${rows.join("")}</div>`)
        .addTo(map);
    });

    // Bind context layer selector (local GeoJSON overlays)
    if (contextLayerSelect) {
      if (contextLayerSelect._overallBusinessContextHandler) {
        contextLayerSelect.removeEventListener("change", contextLayerSelect._overallBusinessContextHandler);
      }

      contextLayerSelect.value = "None";
      contextLayerSelect._overallBusinessContextHandler = (event) => {
        const nextContextName = event.target.value || "None";
        if (nextContextName === activeContextName) {
          return;
        }

        if (activeContextName !== "None") {
          const previousConfig = CONTEXT_LAYER_DEFINITIONS[activeContextName];
          if (previousConfig) {
            removeContextLayers(map, previousConfig.key);
          }
        }

        activeContextName = nextContextName;

        if (activeContextName !== "None") {
          addContextLayers(map, activeContextName);
        }
      };
      contextLayerSelect.addEventListener("change", contextLayerSelect._overallBusinessContextHandler);
    }

    // ============================================
    // CLEANUP: On map removal
    // ============================================

    map.on("remove", () => {
      unsubscribe();
      if (disposeLegendToggle) {
        disposeLegendToggle();
      }
      if (contextLayerSelect?._overallBusinessContextHandler) {
        contextLayerSelect.removeEventListener("change", contextLayerSelect._overallBusinessContextHandler);
        delete contextLayerSelect._overallBusinessContextHandler;
      }
      if (activeContextName !== "None") {
        const config = CONTEXT_LAYER_DEFINITIONS[activeContextName];
        if (config) {
          removeContextLayers(map, config.key);
        }
      }
      if (container._overallBusinessPmtilesMap === map) {
        container._overallBusinessPmtilesMap = null;
      }
    });
  };

  map.on("load", onLoad);

  // Subscribe to state changes for filter updates
  const unsubscribe = subscribe((nextState, previousState) => {
    if (
      nextState.localAuthorityCode !== previousState.localAuthorityCode
      || nextState.coarseCategory !== previousState.coarseCategory
    ) {
      const applyFilters = (state) => {
        if (!map.getLayer(BUSINESS_LAYER_ID)) {
          return;
        }
        map.setFilter(BUSINESS_LAYER_ID, buildGlobalFilterExpression(state));
      };
      applyFilters(nextState);
    }
  });

  map.resize();
}
