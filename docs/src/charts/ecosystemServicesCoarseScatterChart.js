import { fetchDashboardDataText } from "../config/dataAssetLoader.js";

const COARSE_COLORS = {
  "Business & Property Services": "#6b6fae",
  "Consumer & Visitor Economy": "#3d8a95",
  "Primary & Resource Industries": "#d18b2f",
  "Public & Community Services": "#6c9b57",
  Unclassified: "#8a8f99",
};

const SHARED_QUADRANT_EVENT = "ecosystem-services:isic-quadrants-updated";
const SHARED_QUADRANT_KEY = "__ecosystemServicesIsicQuadrants";

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

function buildLinearTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [];
  }
  if (min === max) {
    return [min];
  }

  const ticks = [];
  for (let index = 0; index < count; index += 1) {
    const ratio = count === 1 ? 0 : index / (count - 1);
    ticks.push(min + ((max - min) * ratio));
  }
  return ticks;
}

function formatAxisTick(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
}

function getCoarseColor(name) {
  return COARSE_COLORS[name] || COARSE_COLORS.Unclassified;
}

function buildScoreLookup(scoreRows) {
  const scoreByCompanyId = new Map();
  scoreRows.forEach((row) => {
    const companyId = String(row.company_id || "").trim();
    if (!companyId) {
      return;
    }

    const dep = Number.parseFloat(row.dep_score);
    const press = Number.parseFloat(row.press_score);
    if (!Number.isFinite(dep) || !Number.isFinite(press)) {
      return;
    }

    scoreByCompanyId.set(companyId, { dep, press });
  });
  return scoreByCompanyId;
}

function buildCoarseModel(masterRows, scoreByCompanyId) {
  const grouped = new Map();

  masterRows.forEach((row) => {
    const category = (row.coarse_category || row["Coarse Category"] || "").trim();

    if (!category || category === "Dormant Company" || category === "Unclassified") {
      return;
    }

    const companyId = String(row.company_id || "").trim();
    const score = scoreByCompanyId.get(companyId) || null;

    if (!grouped.has(category)) {
      grouped.set(category, {
        category,
        n: 0,
        depValues: [],
        pressValues: [],
      });
    }

    const entry = grouped.get(category);
    entry.n += 1;
    if (score) {
      entry.depValues.push(score.dep);
      entry.pressValues.push(score.press);
    }
  });

  const points = [...grouped.values()]
    .map((entry) => ({
      category: entry.category,
      n: entry.n,
      medianDep: median(entry.depValues),
      medianPress: median(entry.pressValues),
    }))
    .filter((point) => Number.isFinite(point.medianDep) && Number.isFinite(point.medianPress) && point.n > 0)
    .sort((a, b) => b.n - a.n || a.category.localeCompare(b.category));

  const depValues = points.map((point) => point.medianDep);
  const pressValues = points.map((point) => point.medianPress);
  const axisStats = points.length
    ? {
      depMin: Math.min(...depValues),
      depMax: Math.max(...depValues),
      pressMin: Math.min(...pressValues),
      pressMax: Math.max(...pressValues),
      xMedian: median(depValues),
      yMedian: median(pressValues),
    }
    : null;

  return {
    points,
    totalCompanies: points.reduce((sum, point) => sum + point.n, 0),
    axisStats,
  };
}

function buildScatterSvg(points, width, height, axisStats, sharedQuadrants = null) {
  const margin = { top: 22, right: 18, bottom: 68, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const depValues = points.map((point) => point.medianDep);
  const pressValues = points.map((point) => point.medianPress);

  const depMin = Number.isFinite(axisStats?.depMin) ? axisStats.depMin : Math.min(...depValues);
  const depMax = Number.isFinite(axisStats?.depMax) ? axisStats.depMax : Math.max(...depValues);
  const pressMin = Number.isFinite(axisStats?.pressMin) ? axisStats.pressMin : Math.min(...pressValues);
  const pressMax = Number.isFinite(axisStats?.pressMax) ? axisStats.pressMax : Math.max(...pressValues);

  const depRange = depMax - depMin;
  const pressRange = pressMax - pressMin;
  const nMin = Math.min(...points.map((point) => point.n));
  const nMax = Math.max(...points.map((point) => point.n));
  const radiusFor = (count) => {
    if (nMin === nMax) {
      return 13;
    }
    const t = (count - nMin) / (nMax - nMin);
    return 9 + (t * 10);
  };
  const maxRadius = Math.max(...points.map((point) => radiusFor(point.n)));
  const domainXPadForRadius = ((maxRadius + 10) / Math.max(plotWidth, 1)) * (depRange || 1);
  const domainYPadForRadius = ((maxRadius + 10) / Math.max(plotHeight, 1)) * (pressRange || 1);
  const xPad = Math.max(0.24, (depRange || 1) * 0.14, domainXPadForRadius);
  const yPad = Math.max(0.24, (pressRange || 1) * 0.14, domainYPadForRadius);

  const xDomain = depRange > 0
    ? [Math.max(0, depMin - xPad), depMax + xPad]
    : [Math.max(0, depMin - 0.8), depMax + 0.8];
  const yDomain = pressRange > 0
    ? [Math.max(0, pressMin - yPad), pressMax + yPad]
    : [Math.max(0, pressMin - 0.8), pressMax + 0.8];

  const xScale = (value) => margin.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotWidth;
  const yScale = (value) => margin.top + ((yDomain[1] - value) / (yDomain[1] - yDomain[0])) * plotHeight;
  const xTicks = buildLinearTicks(xDomain[0], xDomain[1], 5);
  const yTicks = buildLinearTicks(yDomain[0], yDomain[1], 5);

  const fallbackXMedian = Number.isFinite(axisStats?.xMedian) ? axisStats.xMedian : median(depValues);
  const fallbackYMedian = Number.isFinite(axisStats?.yMedian) ? axisStats.yMedian : median(pressValues);
  const xMedian = Number.isFinite(sharedQuadrants?.xMedian) ? sharedQuadrants.xMedian : fallbackXMedian;
  const yMedian = Number.isFinite(sharedQuadrants?.yMedian) ? sharedQuadrants.yMedian : fallbackYMedian;

  const axisAndGrid = `
    <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" class="scatter-axis-line" />
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" class="scatter-axis-line" />
    ${xTicks.map((tick) => {
      const x = xScale(tick);
      return `
        <line x1="${x.toFixed(2)}" y1="${margin.top + plotHeight}" x2="${x.toFixed(2)}" y2="${margin.top + plotHeight + 6}" stroke="#8b9b98" stroke-width="1" />
        <text x="${x.toFixed(2)}" y="${margin.top + plotHeight + 20}" text-anchor="middle" fill="#495957" font-size="11">${formatAxisTick(tick)}</text>
      `;
    }).join("")}
    ${yTicks.map((tick) => {
      const y = yScale(tick);
      return `
        <line x1="${margin.left - 6}" y1="${y.toFixed(2)}" x2="${margin.left}" y2="${y.toFixed(2)}" stroke="#8b9b98" stroke-width="1" />
        <text x="${margin.left - 10}" y="${(y + 4).toFixed(2)}" text-anchor="end" fill="#495957" font-size="11">${formatAxisTick(tick)}</text>
      `;
    }).join("")}
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
        <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${color}" class="scatter-point coarse-scatter-point" data-n="${point.n}" data-dep="${formatNumber(point.medianDep)}" data-press="${formatNumber(point.medianPress)}"></circle>
        <text x="${labelX.toFixed(2)}" y="${(y - 2).toFixed(2)}" class="${labelClass}">${point.category}</text>
      </g>
    `;
  }).join("");

  const axisLabels = `
    <text x="${margin.left + (plotWidth / 2)}" y="${height - 30}" class="scatter-axis-title scatter-axis-title--x">Median dependency score</text>
    <text x="18" y="${margin.top + (plotHeight / 2)}" transform="rotate(-90, 18, ${margin.top + (plotHeight / 2)})" class="scatter-axis-title scatter-axis-title--y">Median pressure score</text>
  `;

  const sizeLegend = `
    <g aria-hidden="true">
      <text x="${(margin.left + (plotWidth / 2) - 18).toFixed(2)}" y="${height - 8}" text-anchor="end" fill="#586967" font-size="10" font-weight="600">Point size = number of businesses (n)</text>
      <circle cx="${(margin.left + (plotWidth / 2) + 18).toFixed(2)}" cy="${height - 11}" r="5" fill="#9db4af" stroke="#ffffff" stroke-width="1"></circle>
      <text x="${(margin.left + (plotWidth / 2) + 30).toFixed(2)}" y="${height - 8}" fill="#586967" font-size="9">smaller n</text>
      <circle cx="${(margin.left + (plotWidth / 2) + 98).toFixed(2)}" cy="${height - 11}" r="9" fill="#9db4af" stroke="#ffffff" stroke-width="1"></circle>
      <text x="${(margin.left + (plotWidth / 2) + 113).toFixed(2)}" y="${height - 8}" fill="#586967" font-size="9">larger n</text>
    </g>
  `;

  return `
    <svg viewBox="0 0 ${width} ${height}" class="ecosystem-scatter-svg" role="img" aria-label="Coarse category median dependency versus pressure scatter">
      ${sizeLegend}
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

  let model = { points: [], totalCompanies: 0, axisStats: null };
  let renderQueued = false;
  let tooltipEl = null;
  let isDataLoaded = false;

  const setStatus = (text) => {
    statusElement.textContent = text;
  };

  const getSharedQuadrants = () => {
    const shared = window[SHARED_QUADRANT_KEY];
    if (!shared || !Number.isFinite(shared.xMedian) || !Number.isFinite(shared.yMedian)) {
      return null;
    }
    return {
      xMedian: shared.xMedian,
      yMedian: shared.yMedian,
    };
  };

  const hideTooltip = () => {
    if (tooltipEl) {
      tooltipEl.style.display = "none";
    }
  };

  const ensureTooltip = () => {
    if (tooltipEl) {
      return tooltipEl;
    }

    tooltipEl = document.createElement("div");
    tooltipEl.style.position = "fixed";
    tooltipEl.style.zIndex = "1500";
    tooltipEl.style.pointerEvents = "none";
    tooltipEl.style.display = "none";
    tooltipEl.style.minWidth = "220px";
    tooltipEl.style.maxWidth = "320px";
    tooltipEl.style.padding = "8px 10px";
    tooltipEl.style.border = "1px solid rgba(27, 44, 42, 0.24)";
    tooltipEl.style.borderRadius = "8px";
    tooltipEl.style.background = "rgba(255, 255, 255, 0.96)";
    tooltipEl.style.boxShadow = "0 4px 14px rgba(0, 0, 0, 0.16)";
    tooltipEl.style.color = "#1f2b2a";
    tooltipEl.style.fontSize = "0.78rem";
    tooltipEl.style.lineHeight = "1.35";
    document.body.append(tooltipEl);
    return tooltipEl;
  };

  const queueRender = () => {
    if (renderQueued) {
      return;
    }

    renderQueued = true;
    window.requestAnimationFrame(() => {
      renderQueued = false;
      const points = model.points;

      if (!points.length) {
        if (!isDataLoaded) {
          chartRoot.innerHTML = '<div class="placeholder"><strong>Loading</strong>Preparing coarse category scatter…</div>';
          setStatus("Loading coarse category scatter...");
          return;
        }
        chartRoot.innerHTML = '<div class="placeholder"><strong>No Results</strong>Adjust filters to view the coarse category scatter.</div>';
        setStatus("No categories available for the current filter combination.");
        return;
      }

      const width = Math.max(560, chartRoot.clientWidth || 0);
      const height = 374;
      chartRoot.innerHTML = buildScatterSvg(points, width, height, model.axisStats, getSharedQuadrants());

      const r = computePearson(points);
      const rText = Number.isFinite(r) ? `Pearson r = ${formatNumber(r, 3)}` : "Pearson r unavailable";
      setStatus(`${Math.round(model.totalCompanies).toLocaleString()} businesses represented across ${points.length} categories. ${rText}.`);
    });
  };

  window.addEventListener("resize", () => {
    queueRender();
  });
  window.addEventListener(SHARED_QUADRANT_EVENT, () => {
    queueRender();
  });

  chartRoot.addEventListener("pointermove", (event) => {
    const target = event.target instanceof Element ? event.target.closest(".coarse-scatter-point") : null;
    if (!target) {
      hideTooltip();
      return;
    }

    const tooltip = ensureTooltip();
    const n = target.getAttribute("data-n") || "";
    const dep = target.getAttribute("data-dep") || "";
    const press = target.getAttribute("data-press") || "";

    tooltip.innerHTML = `<div><strong>n: ${n}</strong></div><div>dep: ${dep} | press: ${press}</div>`;
    tooltip.style.display = "block";
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
  });

  chartRoot.addEventListener("pointerleave", () => {
    hideTooltip();
  });

  Promise.all([
    fetchDashboardDataText("dashboard_master.csv", "dashboard master"),
    fetchDashboardDataText("company_integrated_profile.csv", "company integrated profile"),
  ])
    .then(([masterCsv, scoreCsv]) => {
      const masterRows = parseTable(masterCsv);
      const scoreRows = parseTable(scoreCsv);
      const scoreByCompanyId = buildScoreLookup(scoreRows);
      model = buildCoarseModel(masterRows, scoreByCompanyId);
      isDataLoaded = true;
      queueRender();
    })
    .catch((error) => {
      setStatus(`Unable to load coarse category scatter data: ${error?.message || error}`);
      chartRoot.innerHTML = '<div class="placeholder"><strong>Load Error</strong>The coarse category scatter could not be initialized.</div>';
    });
}
