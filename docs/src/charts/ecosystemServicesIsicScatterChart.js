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
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
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
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildRows(compactRows) {
  return compactRows
    .map((row) => {
      const coarseCategory = (row.coarse_category || row["Coarse Category"] || "").trim();
      const isicSection = (row.first_isic_section || row["ISIC Section"] || "").trim();
      const dep = Number.parseFloat(row.dep_score);
      const press = Number.parseFloat(row.press_score);
      return {
        coarseCategory,
        isicSection,
        dep: Number.isFinite(dep) ? dep : null,
        press: Number.isFinite(press) ? press : null,
      };
    })
    .filter((row) => row.coarseCategory
      && row.coarseCategory !== "Dormant Company"
      && row.coarseCategory !== "Unclassified"
      && row.isicSection);
}

function aggregate(rows) {
  const grouped = new Map();
  const scoredDepValues = [];
  const scoredPressValues = [];
  rows.forEach((row) => {
    const key = `${row.coarseCategory}||${row.isicSection}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        coarseCategory: row.coarseCategory,
        isicSection: row.isicSection,
        total: 0,
        dep: [],
        press: [],
      });
    }
    const bucket = grouped.get(key);
    bucket.total += 1;
    if (Number.isFinite(row.dep) && Number.isFinite(row.press)) {
      bucket.dep.push(row.dep);
      bucket.press.push(row.press);
      scoredDepValues.push(row.dep);
      scoredPressValues.push(row.press);
    }
  });

  const globalDepMedian = median(scoredDepValues);
  const globalPressMedian = median(scoredPressValues);

  const points = [...grouped.values()]
    .map((bucket) => ({
      coarseCategory: bucket.coarseCategory,
      isicSection: bucket.isicSection,
      medianDep: bucket.dep.length ? median(bucket.dep) : globalDepMedian,
      medianPress: bucket.press.length ? median(bucket.press) : globalPressMedian,
      n: bucket.total,
    }))
    .filter((point) => Number.isFinite(point.medianDep) && Number.isFinite(point.medianPress) && point.n > 0)
    .sort((a, b) => b.n - a.n || a.isicSection.localeCompare(b.isicSection));

  const axisStats = points.length
    ? {
      depMin: Math.min(...points.map((point) => point.medianDep)),
      depMax: Math.max(...points.map((point) => point.medianDep)),
      pressMin: Math.min(...points.map((point) => point.medianPress)),
      pressMax: Math.max(...points.map((point) => point.medianPress)),
      xMedian: median(points.map((point) => point.medianDep)),
      yMedian: median(points.map((point) => point.medianPress)),
    }
    : null;

  return {
    points,
    filteredCount: rows.length,
    scoredCount: scoredDepValues.length,
    axisStats,
  };
}

function buildSvg(points, width, height, axisStats, sharedQuadrants = null) {
  const margin = { top: 20, right: 18, bottom: 68, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const depValues = points.map((point) => point.medianDep);
  const pressValues = points.map((point) => point.medianPress);

  const depMin = Math.min(...depValues);
  const depMax = Math.max(...depValues);
  const pressMin = Math.min(...pressValues);
  const pressMax = Math.max(...pressValues);

  const depRange = depMax - depMin;
  const pressRange = pressMax - pressMin;
  const xPad = Math.max(0.2, (depRange || 1) * 0.12);
  const yPad = Math.max(0.2, (pressRange || 1) * 0.12);

  const xDomain = depRange > 0
    ? [Math.max(0, depMin - (xPad * 0.45)), depMax + xPad]
    : [Math.max(0, depMin - 0.6), depMax + 0.6];
  const yDomain = pressRange > 0
    ? [Math.max(0, pressMin - (yPad * 0.45)), pressMax + yPad]
    : [Math.max(0, pressMin - 0.6), pressMax + 0.6];

  const xScale = (value) => margin.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotWidth;
  const yScale = (value) => margin.top + ((yDomain[1] - value) / (yDomain[1] - yDomain[0])) * plotHeight;
  const xTicks = buildLinearTicks(xDomain[0], xDomain[1], 5);
  const yTicks = buildLinearTicks(yDomain[0], yDomain[1], 5);

  const fallbackXMedian = Number.isFinite(axisStats?.xMedian) ? axisStats.xMedian : median(depValues);
  const fallbackYMedian = Number.isFinite(axisStats?.yMedian) ? axisStats.yMedian : median(pressValues);
  const xMedian = Number.isFinite(sharedQuadrants?.xMedian) ? sharedQuadrants.xMedian : fallbackXMedian;
  const yMedian = Number.isFinite(sharedQuadrants?.yMedian) ? sharedQuadrants.yMedian : fallbackYMedian;

  const nMin = Math.min(...points.map((point) => point.n));
  const nMax = Math.max(...points.map((point) => point.n));
  const radiusFor = (count) => {
    if (nMin === nMax) {
      return 8;
    }
    const t = (count - nMin) / (nMax - nMin);
    return 6 + (t * 7);
  };

  const axisAndQuadrants = `
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
    <text x="${(xScale(xMedian) + 90).toFixed(2)}" y="${(yScale(yMedian) - 10).toFixed(2)}" class="scatter-quadrant-label">High dep / high press</text>
  `;

  const pointsMarkup = points.map((point, index) => {
    const x = xScale(point.medianDep);
    const y = yScale(point.medianPress);
    const radius = radiusFor(point.n);
    const color = getCoarseColor(point.coarseCategory);

    return `
      <g>
        <circle
          cx="${x.toFixed(2)}"
          cy="${y.toFixed(2)}"
          r="${radius.toFixed(2)}"
          fill="${color}"
          class="scatter-point isic-scatter-point"
          data-isic="${escapeHtml(point.isicSection)}"
          data-coarse="${escapeHtml(point.coarseCategory)}"
          data-n="${point.n}"
          data-dep="${formatNumber(point.medianDep)}"
          data-press="${formatNumber(point.medianPress)}"
        ></circle>
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
    <svg viewBox="0 0 ${width} ${height}" class="ecosystem-scatter-svg" role="img" aria-label="ISIC section median dependency versus pressure scatter">
      ${sizeLegend}
      ${axisAndQuadrants}
      ${pointsMarkup}
      ${axisLabels}
    </svg>
  `;
}

export function initEcosystemServicesIsicScatterChart() {
  const chartRoot = document.getElementById("ecosystem-services-isic-scatter-chart");
  const statusElement = document.getElementById("ecosystem-services-isic-scatter-status");

  if (!chartRoot || !statusElement) {
    return;
  }

  let rows = [];
  let renderQueued = false;
  let hoverBound = false;
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

  const bindHoverHandlers = () => {
    if (hoverBound) {
      return;
    }

    hoverBound = true;

    chartRoot.addEventListener("pointermove", (event) => {
      const target = event.target instanceof Element ? event.target.closest(".isic-scatter-point") : null;
      if (!target) {
        hideTooltip();
        return;
      }

      const tooltip = ensureTooltip();
      const isic = target.getAttribute("data-isic") || "";
      const coarse = target.getAttribute("data-coarse") || "";
      const n = target.getAttribute("data-n") || "";
      const dep = target.getAttribute("data-dep") || "";
      const press = target.getAttribute("data-press") || "";
      const isAgriculturePoint = isic.toLowerCase().startsWith("agriculture");

      tooltip.innerHTML = `<div><strong>${isic}</strong></div><div>${coarse}</div><div>n: ${n} | dep: ${dep} | press: ${press}</div>`;
      tooltip.style.display = "block";
      const offset = 14;
      const viewportPadding = 8;
      const tooltipWidth = tooltip.offsetWidth || 260;
      const tooltipHeight = tooltip.offsetHeight || 72;
      const preferredLeft = isAgriculturePoint
        ? (event.clientX - tooltipWidth - offset)
        : (event.clientX + offset);
      const boundedLeft = Math.max(
        viewportPadding,
        Math.min(preferredLeft, window.innerWidth - tooltipWidth - viewportPadding),
      );
      const preferredTop = event.clientY + offset;
      const boundedTop = Math.max(
        viewportPadding,
        Math.min(preferredTop, window.innerHeight - tooltipHeight - viewportPadding),
      );

      tooltip.style.left = `${boundedLeft}px`;
      tooltip.style.top = `${boundedTop}px`;
    });

    chartRoot.addEventListener("pointerleave", () => {
      hideTooltip();
    });
  };

  const queueRender = () => {
    if (renderQueued) {
      return;
    }

    renderQueued = true;
    window.requestAnimationFrame(() => {
      renderQueued = false;
      const aggregated = aggregate(rows);
      const chartPoints = aggregated.points;

      if (!chartPoints.length) {
        if (!isDataLoaded) {
          chartRoot.innerHTML = '<div class="placeholder"><strong>Loading</strong>Preparing ISIC scatter…</div>';
          setStatus("Loading ISIC scatter...");
          return;
        }
        chartRoot.innerHTML = '<div class="placeholder"><strong>No Results</strong>Adjust filters to view the ISIC section scatter.</div>';
        setStatus("No ISIC sections available for the current filter combination.");
        return;
      }

      const width = Math.max(560, chartRoot.clientWidth || 0);
      const height = 374;
      chartRoot.innerHTML = buildSvg(chartPoints, width, height, aggregated.axisStats, getSharedQuadrants());
      bindHoverHandlers();

      const r = computePearson(chartPoints);
      const rText = Number.isFinite(r) ? `Pearson r = ${formatNumber(r, 3)}` : "Pearson r unavailable";
      setStatus(`${aggregated.filteredCount.toLocaleString()} businesses represented across ${chartPoints.length} ISIC sections. ${rText}.`);
    });
  };

  window.addEventListener("resize", () => {
    queueRender();
  });
  window.addEventListener(SHARED_QUADRANT_EVENT, () => {
    queueRender();
  });

  fetchDashboardDataText("dashboard_scatter_compact.csv", "dashboard scatter compact")
    .then((compactCsv) => {
      const compactRows = parseTable(compactCsv);
      rows = buildRows(compactRows);
      isDataLoaded = true;
      queueRender();
    })
    .catch((error) => {
      setStatus(`Unable to load ISIC scatter data: ${error?.message || error}`);
      chartRoot.innerHTML = '<div class="placeholder"><strong>Load Error</strong>The ISIC section scatter could not be initialized.</div>';
    });
}
