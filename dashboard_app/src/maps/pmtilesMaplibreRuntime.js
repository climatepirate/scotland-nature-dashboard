// SHARED PMTILES RUNTIME UTILITIES
// Provides infrastructure for MapLibre + PMTiles map initialization
// All functions here are generic and map-agnostic

const MAPLIBRE_CSS_URL = new URL("../../vendor/maplibre-gl.css", import.meta.url).toString();
const MAPLIBRE_MODULE_URL = new URL("../../vendor/maplibre-gl.mjs", import.meta.url).toString();
const PMTILES_MODULE_URL = new URL("../../vendor/pmtiles.mjs", import.meta.url).toString();

let assetLoadPromise = null;
let pmtilesProtocolRegistered = false;

// Load CSS stylesheet only once (prevent duplicates)
function loadStyleSheetOnce(url) {
  if (document.querySelector(`link[href="${url}"]`)) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  document.head.append(link);
}

// Lazy-load MapLibre and PMTiles libraries (shared across all maps)
export async function loadMapLibrePmtilesAssets() {
  if (!assetLoadPromise) {
    assetLoadPromise = (async () => {
      loadStyleSheetOnce(MAPLIBRE_CSS_URL);
      const [maplibregl, pmtiles] = await Promise.all([
        import(MAPLIBRE_MODULE_URL),
        import(PMTILES_MODULE_URL),
      ]);
      return { maplibregl, pmtiles };
    })();
  }

  return assetLoadPromise;
}

// Register pmtiles:// protocol exactly once (singleton pattern)
export function ensurePmtilesProtocolRegistered(maplibregl, pmtiles) {
  if (!pmtilesProtocolRegistered) {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    pmtilesProtocolRegistered = true;
  }
}

// ============================================
// GENERIC DATA FORMATTING UTILITIES
// ============================================

// Escape HTML special characters to prevent XSS in popups
export function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Find first defined (non-null, non-empty) value in properties by key list
export function firstDefinedValue(properties, keys) {
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

// Format number for display (integers as-is, decimals to 2 places)
export function formatNumericValue(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return String(value);
  }
  if (Number.isInteger(numberValue)) {
    return String(numberValue);
  }
  return numberValue.toFixed(2);
}

// Convert RGBA 255 color string to CSS rgba() format
export function rgba255ToCss(rgba255) {
  const [r = 0, g = 0, b = 0, a = 255] = rgba255.split(",").map((value) => Number(value.trim()));
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

// Parse min/max values from legend label (e.g. "1.00 - 2.00")
export function parseRangeLabel(label) {
  const values = label.match(/-?\d+(?:\.\d+)?/g) || [];
  if (values.length < 2) {
    return null;
  }
  return {
    min: Number(values[0]),
    max: Number(values[1]),
  };
}

// Format number for legend (thousands separator, limited decimals)
export function formatLegendNumber(value) {
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

// ============================================
// GENERIC MAPLIBRE UTILITIES
// ============================================

// Build MapLibre filter expression from state (Local Authority + Coarse Category)
export function buildGlobalFilterExpression(state, allScotland = "All Scotland", allCategories = "All Categories") {
  const filters = [];
  if (state.localAuthorityCode && state.localAuthorityCode !== allScotland) {
    filters.push(["==", ["get", "local_authority"], state.localAuthorityCode]);
  }
  if (state.coarseCategory && state.coarseCategory !== allCategories) {
    filters.push(["==", ["get", "coarse_category"], state.coarseCategory]);
  }
  if (!filters.length) {
    return null;
  }
  if (filters.length === 1) {
    return filters[0];
  }
  return ["all", ...filters];
}

// Create legend DOM elements with standard structure
export function createLegendElement(container) {
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

  return {
    title: legendElement.querySelector(".overall-gradient-legend-title"),
    bar: legendElement.querySelector(".overall-gradient-legend-bar"),
    min: legendElement.querySelector(".overall-gradient-legend-min"),
    mid: legendElement.querySelector(".overall-gradient-legend-mid"),
    max: legendElement.querySelector(".overall-gradient-legend-max"),
  };
}

// Apply legend values (title, gradient, min/mid/max labels)
export function applyLegendValues(legend, title, stops) {
  if (!legend || !stops.length) {
    return;
  }

  const gradientStops = stops.map((stop, index) => {
    const pct = stops.length <= 1 ? 0 : (index / (stops.length - 1)) * 100;
    return `${rgba255ToCss(stop.color)} ${pct.toFixed(2)}%`;
  });

  const firstRange = parseRangeLabel(stops[0].label);
  const lastRange = parseRangeLabel(stops[stops.length - 1].label);
  const rangeMin = firstRange?.min;
  const rangeMax = lastRange?.max;
  const rangeMid = Number.isFinite(rangeMin) && Number.isFinite(rangeMax)
    ? (rangeMin + rangeMax) / 2
    : null;

  legend.title.textContent = title;
  legend.bar.style.background = `linear-gradient(90deg, ${gradientStops.join(", ")})`;
  legend.min.textContent = formatLegendNumber(rangeMin);
  legend.mid.textContent = Number.isFinite(rangeMid) ? formatLegendNumber(rangeMid) : "";
  legend.max.textContent = formatLegendNumber(rangeMax);
}
