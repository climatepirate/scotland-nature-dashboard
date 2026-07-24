import { getState, subscribe } from "../state/state.js";
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

// PAGE-SPECIFIC CONFIGURATION: Overview map
const CORE_HEX_PM_TILES_URL = new URL("../../Data/tiles/core_hex.pmtiles", import.meta.url).toString();
const HEX_OUTLINE_PM_TILES_URL = new URL("../../Data/tiles/hex_outline.pmtiles", import.meta.url).toString();

const BUSINESS_OUTLINE_ID = "overall-business-outline-layer";
const BUSINESS_LAYER_ID = "overall-business-thematic-layer";
const BUSINESS_OUTLINE_SOURCE = "overall-business-outline-source";
const BUSINESS_THEMATIC_SOURCE = "overall-business-thematic-source";

const BUSINESS_LEGEND_STOPS = [
  { label: "1.00 - 2.00", color: "220,225,235,190" },
  { label: "2.00 - 3.00", color: "170,185,205,190" },
  { label: "3.00 - 5.00", color: "150,165,190,190" },
  { label: "5.00 - 7.00", color: "130,150,180,190" },
  { label: "7.00 - 11.00", color: "115,135,170,190" },
  { label: "11.00 - 13.00", color: "100,125,165,190" },
  { label: "13.00 - 21.00", color: "90,115,155,190" },
  { label: "21.00 - 50.00", color: "77,105,150,190" },
  { label: "50.00 - 102.00", color: "65,95,145,190" },
  { label: "102.00 - 237.76", color: "55,85,140,190" },
  { label: "237.76 - 389.84", color: "45,75,135,190" },
  { label: "389.84 - 729.76", color: "35,65,125,190" },
  { label: "729.76 - 1188.84", color: "27,55,120,190" },
  { label: "1188.84 - 1975.75", color: "18,45,115,190" },
  { label: "1975.75 - 33068.00", color: "10,35,110,190" },
];

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
    const range = parseRangeLabel(stops[index].label);
    if (!range) {
      continue;
    }
    expression.push(range.min, rgba255ToCss(stops[index].color));
  }

  return expression;
}

// PAGE-SPECIFIC: Build opacity expression (hover-based)
function buildOpacityExpression() {
  return ["case", ["boolean", ["feature-state", "hover"], false], 0.8, 0.7];
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
    zoom: 6,
    minZoom: 5,
    maxZoom: 12,
    attributionControl: false,
    interactive: true,
  });
  container._overallBusinessPmtilesMap = map;

  const legend = createLegendElement(container);

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
        "fill-color": buildColorExpression(BUSINESS_LEGEND_STOPS),
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
    applyLegendValues(legend, "Company Concentration (count of)", BUSINESS_LEGEND_STOPS);

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

    // Bind context layer selector (UI only, for future WMS context layers)
    if (contextLayerSelect) {
      if (contextLayerSelect._overallBusinessContextHandler) {
        contextLayerSelect.removeEventListener("change", contextLayerSelect._overallBusinessContextHandler);
      }

      contextLayerSelect.value = "None";
      contextLayerSelect._overallBusinessContextHandler = (event) => {
        // Placeholder for context layer logic (future enhancement)
      };
      contextLayerSelect.addEventListener("change", contextLayerSelect._overallBusinessContextHandler);
    }

    // ============================================
    // CLEANUP: On map removal
    // ============================================

    map.on("remove", () => {
      unsubscribe();
      if (contextLayerSelect?._overallBusinessContextHandler) {
        contextLayerSelect.removeEventListener("change", contextLayerSelect._overallBusinessContextHandler);
        delete contextLayerSelect._overallBusinessContextHandler;
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
