import { fetchDashboardDataText } from "../config/dataAssetLoader.js";
import { getState, subscribe } from "../state/state.js";

const ALL_SCOTLAND = "All Scotland";
const ALL_CATEGORIES = "All Categories";
const ALL_ISIC = "All ISIC Sections";

const COARSE_COLORS = {
  "Business & Property Services": "#6b6fae",
  "Consumer & Visitor Economy": "#3d8a95",
  "Primary & Resource Industries": "#d18b2f",
  "Public & Community Services": "#6c9b57",
  Unclassified: "#8a8f99",
};

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseTable(csvText) {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((value) => value.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || "").trim();
    });
    rows.push(row);
  }

  return rows;
}

function median(values) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function computePearson(points) {
  if (points.length < 2) {
    return null;
  }

  const xs = points.map((point) => point.medianDep);
  const ys = points.map((point) => point.medianPress);

  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;

  let numerator = 0;
  let xDenom = 0;
  let yDenom = 0;

  for (let i = 0; i < xs.length; i += 1) {
    const xDiff = xs[i] - xMean;
    const yDiff = ys[i] - yMean;
    numerator += xDiff * yDiff;
    xDenom += xDiff * xDiff;
    yDenom += yDiff * yDiff;
  }

  if (!xDenom || !yDenom) {
    return null;
  }

  return numerator / Math.sqrt(xDenom * yDenom);
}

function formatNumber(value, digits = 2) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function getCoarseColor(name) {
  return COARSE_COLORS[name] || COARSE_COLORS.Unclassified;
}

function normalizeCompanyId(value) {
  if (!value) {
    return "";
  }
  return String(value).replace(/\.0+$/, "").trim();
}

function buildScatterRows(dashboardRows, profileRows) {
  const profileByCompanyId = new Map();
  profileRows.forEach((row) => {
    const companyId = normalizeCompanyId(row.company_id);
    if (!companyId) {
      return;
    }

    const dep = Number.parseFloat(row.dep_score);
    const press = Number.parseFloat(row.press_score);
    if (!Number.isFinite(dep) || !Number.isFinite(press)) {
      return;
    }

    profileByCompanyId.set(companyId, {
      dep,
      press,
      coarseCategory: row["Coarse Category"] || row.coarse_category || "",
    });
  });

  const rows = [];
  dashboardRows.forEach((row) => {
    const scorable = String(row.scorable_flag || "").toLowerCase() === "true";
    if (!scorable) {
      return;
    }

    const companyId = normalizeCompanyId(row.company_id);
    const profile = profileByCompanyId.get(companyId);
    if (!profile) {
      return;
    }

    const coarseCategory = (row.coarse_category || profile.coarseCategory || "").trim();
    const isicSection = (row.first_isic_section || "").trim();
    const localAuthorityCode = (row.local_authority_code || "").trim();

    if (!coarseCategory || coarseCategory === "Dormant Company") {
      return;
    }

    rows.push({
      coarseCategory,
      isicSection,
      localAuthorityCode,
      dep: profile.dep,
      press: profile.press,
    });
  });

  return rows;
}

function aggregateScatter(rows, state) {
  const filtered = rows.filter((row) => {
    if (state.localAuthorityCode !== ALL_SCOTLAND && row.localAuthorityCode !== state.localAuthorityCode) {
      return false;
    }
    if (state.coarseCategory !== ALL_CATEGORIES && row.coarseCategory !== state.coarseCategory) {
      return false;
    }
    if (state.isicSection !== ALL_ISIC && row.isicSection !== state.isicSection) {
      return false;
    }
    return true;
  });

  const byCategory = new Map();
  filtered.forEach((row) => {
    if (!byCategory.has(row.coarseCategory)) {
      byCategory.set(row.coarseCategory, { dep: [], press: [] });
    }
    const entry = byCategory.get(row.coarseCategory);
    entry.dep.push(row.dep);
    entry.press.push(row.press);
  });

  const points = [...byCategory.entries()]
    .map(([category, values]) => ({
      category,
      medianDep: median(values.dep),
      medianPress: median(values.press),
      n: values.dep.length,
    }))
    .filter((point) => Number.isFinite(point.medianDep) && Number.isFinite(point.medianPress) && point.n > 0)
    .sort((a, b) => b.n - a.n || a.category.localeCompare(b.category));

  return {
    points,
    filteredCount: filtered.length,
  };
}

function buildScatterSvg(points, width, height) {
  const margin = { top: 22, right: 18, bottom: 54, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const depValues = points.map((point) => point.medianDep);
  const pressValues = points.map((point) => point.medianPress);

  const depMin = Math.min(...depValues);
  const depMax = Math.max(...depValues);
  const pressMin = Math.min(...pressValues);
  const pressMax = Math.max(...pressValues);

  const xPad = Math.max(0.2, (depMax - depMin) * 0.15 || 0.6);
  const yPad = Math.max(0.2, (pressMax - pressMin) * 0.15 || 0.6);

  const xDomain = [depMin - xPad, depMax + xPad];
  const yDomain = [pressMin - yPad, pressMax + yPad];

  const xScale = (value) => margin.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotWidth;
  const yScale = (value) => margin.top + ((yDomain[1] - value) / (yDomain[1] - yDomain[0])) * plotHeight;

  const xMedian = median(depValues);
  const yMedian = median(pressValues);

  const nMin = Math.min(...points.map((point) => point.n));
  const nMax = Math.max(...points.map((point) => point.n));
  const radiusFor = (count) => {
    if (nMin === nMax) {
      return 13;
    }
    const t = (count - nMin) / (nMax - nMin);
    return 9 + (t * 10);
  };

  const axisAndGrid = `
    <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" class="scatter-axis-line" />
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" class="scatter-axis-line" />
    <line x1="${xScale(xMedian)}" y1="${margin.top}" x2="${xScale(xMedian)}" y2="${margin.top + plotHeight}" class="scatter-median-line" />
    <line x1="${margin.left}" y1="${yScale(yMedian)}" x2="${margin.left + plotWidth}" y2="${yScale(yMedian)}" class="scatter-median-line" />
  `;

  const bubbles = points.map((point) => {
    const x = xScale(point.medianDep);
    const y = yScale(point.medianPress);
    const radius = radiusFor(point.n);
    const color = getCoarseColor(point.category);
    const primaryLabel = point.category.startsWith("Primary");
    const labelX = primaryLabel ? (x - radius - 7) : (x + radius + 7);
    const labelClass = primaryLabel ? "scatter-label scatter-label--left" : "scatter-label";
    return `
      <g>
        <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${color}" class="scatter-point"></circle>
        <text x="${labelX.toFixed(2)}" y="${(y - 2).toFixed(2)}" class="${labelClass}">${point.category}</text>
        <title>${point.category}: n=${point.n}, median dependency=${formatNumber(point.medianDep)}, median pressure=${formatNumber(point.medianPress)}</title>
      </g>
    `;
  }).join("");

  const axisLabels = `
    <text x="${margin.left + (plotWidth / 2)}" y="${height - 14}" class="scatter-axis-title scatter-axis-title--x">Median dependency score</text>
    <text x="18" y="${margin.top + (plotHeight / 2)}" transform="rotate(-90, 18, ${margin.top + (plotHeight / 2)})" class="scatter-axis-title">Median pressure score</text>
  `;

  return `
    <svg viewBox="0 0 ${width} ${height}" class="ecosystem-scatter-svg" role="img" aria-label="Coarse category median dependency versus pressure scatter">
      ${axisAndGrid}
      ${bubbles}
      ${axisLabels}
    </svg>
  `;
}

export function initEcosystemServicesCoarseScatterChart() {
  const chartRoot = document.getElementById("ecosystem-services-coarse-scatter-chart");
  const statusElement = document.getElementById("ecosystem-services-coarse-scatter-status");

  if (!chartRoot || !statusElement) {
    return;
  }

  let rows = [];
  let renderQueued = false;

  const setStatus = (text) => {
    statusElement.textContent = text;
  };

  const queueRender = () => {
    if (renderQueued) {
      return;
    }

    renderQueued = true;
    window.requestAnimationFrame(() => {
      renderQueued = false;
      const state = getState();
      const aggregated = aggregateScatter(rows, state);
      const points = aggregated.points;

      if (!points.length) {
        chartRoot.innerHTML = '<div class="placeholder"><strong>No Results</strong>Adjust filters to view the coarse category scatter.</div>';
        setStatus("No categories available for the current filter combination.");
        return;
      }

      const width = Math.max(560, chartRoot.clientWidth || 0);
      const height = 360;
      chartRoot.innerHTML = buildScatterSvg(points, width, height);

      const r = computePearson(points);
      const rText = Number.isFinite(r) ? `Pearson r = ${formatNumber(r, 3)}` : "Pearson r unavailable";
      setStatus(`${aggregated.filteredCount.toLocaleString()} businesses represented across ${points.length} categories. ${rText}.`);
    });
  };

  subscribe(() => {
    queueRender();
  });

  window.addEventListener("resize", () => {
    queueRender();
  });

  Promise.all([
    fetchDashboardDataText("dashboard_master.csv", "dashboard master"),
    fetchDashboardDataText("company_integrated_profile.csv", "company integrated profile"),
  ])
    .then(([dashboardCsv, profileCsv]) => {
      const dashboardRows = parseTable(dashboardCsv);
      const profileRows = parseTable(profileCsv);
      rows = buildScatterRows(dashboardRows, profileRows);
      queueRender();
    })
    .catch((error) => {
      setStatus(`Unable to load coarse category scatter data: ${error?.message || error}`);
      chartRoot.innerHTML = '<div class="placeholder"><strong>Load Error</strong>The coarse category scatter could not be initialized.</div>';
    });
}
