import { fetchDashboardDataText } from "../config/dataAssetLoader.js";
 

const DEFAULT_COARSE_CATEGORY = "Primary & Resource Industries";
const EXCLUDED_ISIC_SECTIONS = new Set([
  "Administrative and support service activities",
  "Financial and insurance activities",
  "Information and communication",
  "Professional, scientific and technical activities",
  "Real estate activities",
  "Wholesale and retail trade; repair of motor vehicles and motorcycles",
  "Activities of extraterritorial organizations and bodies",
  "Activities of households as employers; undifferentiated goods- and services-producing activities of households for own use",
  "Other service activities",
  "Public administration and defence; compulsory social security",
]);

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

function normalizeCompanyId(value) {
  if (!value) {
    return "";
  }
  return String(value).replace(/\.0+$/, "").trim();
}

function formatNumber(value, digits = 2) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hashString(text) {
  let hash = 0;
  const source = String(text || "");
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const DEFAULT_SECTOR_PALETTE = [
  "#2f7bbd",
  "#f05a5a",
  "#f29e2e",
  "#2ca58d",
  "#8e63ce",
  "#e15f9a",
  "#4b8b3b",
  "#d98f2b",
  "#3f78d4",
  "#c94f4f",
];

const PRIMARY_RESOURCE_PALETTE = [
  "#0f766e",
  "#d97706",
  "#0284c7",
  "#65a30d",
  "#ef4444",
  "#7c3aed",
  "#14b8a6",
  "#f59e0b",
  "#dc2626",
  "#2563eb",
  "#84cc16",
  "#f97316",
];

function buildSectorColorMap(rows) {
  const sectors = [...new Set(rows.map((row) => row.isicSection))].sort((a, b) => a.localeCompare(b));
  const usePrimaryResourcePalette = rows.some((row) => row.coarseCategory === "Primary & Resource Industries");
  const palette = usePrimaryResourcePalette ? PRIMARY_RESOURCE_PALETTE : DEFAULT_SECTOR_PALETTE;
  const sectorColorMap = new Map();

  sectors.forEach((sector, index) => {
    sectorColorMap.set(sector, palette[index % palette.length]);
  });

  return sectorColorMap;
}

function buildRows(dashboardRows, profileRows) {
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
      companyName: (row.CompanyName || row.company_name || "").trim(),
    });
  });

  const rows = [];
  dashboardRows.forEach((row) => {
    if (String(row.scorable_flag || "").toLowerCase() !== "true") {
      return;
    }

    const companyId = normalizeCompanyId(row.company_id);
    const profile = profileByCompanyId.get(companyId);
    if (!profile) {
      return;
    }

    const coarseCategory = (row.coarse_category || "").trim();
    const isicSection = (row.first_isic_section || "").trim();
    const localAuthorityCode = (row.local_authority_code || "").trim();

    if (!coarseCategory || coarseCategory === "Dormant Company" || !isicSection || !localAuthorityCode) {
      return;
    }

    if (EXCLUDED_ISIC_SECTIONS.has(isicSection)) {
      return;
    }

    rows.push({
      companyId,
      companyName: profile.companyName || companyId,
      coarseCategory,
      isicSection,
      localAuthorityCode,
      dep: profile.dep,
      press: profile.press,
    });
  });

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

function computePearson(values) {
  if (values.length < 2) {
    return null;
  }

  const xs = values.map((row) => row.dep);
  const ys = values.map((row) => row.press);
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

function computeLinearTrend(values) {
  if (values.length < 2) {
    return null;
  }

  const xs = values.map((row) => row.dep);
  const ys = values.map((row) => row.press);
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < xs.length; i += 1) {
    const xDiff = xs[i] - xMean;
    const yDiff = ys[i] - yMean;
    numerator += xDiff * yDiff;
    denominator += xDiff * xDiff;
  }

  if (!denominator) {
    return null;
  }

  const slope = numerator / denominator;
  const intercept = yMean - (slope * xMean);
  return { slope, intercept };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lineSegmentIntersectionsForPlot(entry, xDomain, yDomain) {
  const candidates = [];
  const pushCandidate = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      candidates.push({ x, y });
    }
  };

  const yFor = (x) => entry.trend.intercept + (entry.trend.slope * x);
  const xFor = (y) => (y - entry.trend.intercept) / entry.trend.slope;

  pushCandidate(xDomain[0], yFor(xDomain[0]));
  pushCandidate(xDomain[1], yFor(xDomain[1]));

  if (entry.trend.slope !== 0) {
    pushCandidate(xFor(yDomain[0]), yDomain[0]);
    pushCandidate(xFor(yDomain[1]), yDomain[1]);
  }

  return candidates.filter((point) => (
    point.x >= xDomain[0] && point.x <= xDomain[1] && point.y >= yDomain[0] && point.y <= yDomain[1]
  ));
}

function distanceToSegment(pointX, pointY, startX, startY, endX, endY) {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = (dx * dx) + (dy * dy);
  if (!lengthSquared) {
    return Math.hypot(pointX - startX, pointY - startY);
  }

  const t = clamp(((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared, 0, 1);
  const projectionX = startX + (t * dx);
  const projectionY = startY + (t * dy);
  return Math.hypot(pointX - projectionX, pointY - projectionY);
}

function deterministicJitter(seedText, spread) {
  const seed = hashString(seedText);
  const normalized = ((seed % 10000) / 10000) - 0.5;
  return normalized * spread;
}

function ensureOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function filterRows(rows, localCoarseCategory) {
  return rows.filter((row) => {
    if (!localCoarseCategory) {
      return false;
    }

    if (row.coarseCategory !== localCoarseCategory) {
      return false;
    }

    return true;
  });
}

function drawChart(canvas, rows) {
  const context = canvas.getContext("2d");
  if (!context) {
    return [];
  }

  const width = canvas.width;
  const height = canvas.height;

  context.clearRect(0, 0, width, height);

  const margin = { top: 22, right: 18, bottom: 56, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const depValues = rows.map((row) => row.dep);
  const pressValues = rows.map((row) => row.press);

  const depMin = Math.min(...depValues);
  const depMax = Math.max(...depValues);
  const pressMin = Math.min(...pressValues);
  const pressMax = Math.max(...pressValues);

  const xPad = Math.max(0.25, (depMax - depMin) * 0.08 || 0.8);
  const yPad = Math.max(0.25, (pressMax - pressMin) * 0.08 || 0.8);

  const xDomain = [depMin - xPad, depMax + xPad];
  const yDomain = [pressMin - yPad, pressMax + yPad];

  const xScale = (value) => margin.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotWidth;
  const yScale = (value) => margin.top + ((yDomain[1] - value) / (yDomain[1] - yDomain[0])) * plotHeight;

  const xMedian = median(depValues);
  const yMedian = median(pressValues);
  const sectorColorMap = buildSectorColorMap(rows);

  const rowsBySector = new Map();
  rows.forEach((row) => {
    if (!rowsBySector.has(row.isicSection)) {
      rowsBySector.set(row.isicSection, []);
    }
    rowsBySector.get(row.isicSection).push(row);
  });

  const trendEntries = [...rowsBySector.entries()]
    .map(([isicSection, sectorRows]) => {
      const trend = computeLinearTrend(sectorRows);
      const r = computePearson(sectorRows);
      return trend && Number.isFinite(r) ? { isicSection, sectorRows, trend, r } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.isicSection.localeCompare(b.isicSection));

  const trendSegments = [];
  trendEntries.forEach((entry) => {
    const intersections = lineSegmentIntersectionsForPlot(entry, xDomain, yDomain);
    if (intersections.length < 2) {
      return;
    }

    const points = intersections
      .map((point) => ({
        x: xScale(point.x),
        y: yScale(point.y),
      }))
      .sort((a, b) => a.x - b.x || a.y - b.y);

    const segment = {
      isicSection: entry.isicSection,
      r: entry.r,
      startX: points[0].x,
      startY: points[0].y,
      endX: points[points.length - 1].x,
      endY: points[points.length - 1].y,
    };

    trendSegments.push(segment);
  });

  context.strokeStyle = "#8aa09b";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(margin.left, margin.top + plotHeight);
  context.lineTo(margin.left + plotWidth, margin.top + plotHeight);
  context.stroke();

  context.beginPath();
  context.moveTo(margin.left, margin.top);
  context.lineTo(margin.left, margin.top + plotHeight);
  context.stroke();

  context.strokeStyle = "#7a8886";
  context.setLineDash([5, 4]);
  context.beginPath();
  context.moveTo(xScale(xMedian), margin.top);
  context.lineTo(xScale(xMedian), margin.top + plotHeight);
  context.stroke();

  context.beginPath();
  context.moveTo(margin.left, yScale(yMedian));
  context.lineTo(margin.left + plotWidth, yScale(yMedian));
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#425654";
  context.font = "600 12px 'Avenir Next', 'Segoe UI', sans-serif";
  context.textAlign = "center";
  context.fillText("Dependency score", margin.left + (plotWidth / 2), height - 16);

  context.save();
  context.translate(18, margin.top + (plotHeight / 2));
  context.rotate(-Math.PI / 2);
  context.textBaseline = "middle";
  context.fillText("Pressure score", 0, 0);
  context.restore();

  const plottedPoints = [];
  rows.forEach((row) => {
    const x = xScale(row.dep + deterministicJitter(`${row.companyId}-dep`, 0.7));
    const y = yScale(row.press + deterministicJitter(`${row.companyId}-press`, 0.7));
    const radius = 2.8;

    context.fillStyle = sectorColorMap.get(row.isicSection) || "#66757a";
    context.globalAlpha = 0.52;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();

    plottedPoints.push({
      x,
      y,
      radius,
      row,
    });
  });

  context.save();
  context.beginPath();
  context.rect(margin.left, margin.top, plotWidth, plotHeight);
  context.clip();

  trendSegments.forEach((segment) => {
    context.strokeStyle = sectorColorMap.get(segment.isicSection) || "#66757a";
    context.globalAlpha = 0.42;
    context.lineWidth = 3.5;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(segment.startX, segment.startY);
    context.lineTo(segment.endX, segment.endY);
    context.stroke();
  });

  context.restore();

  context.globalAlpha = 1;
  return { plottedPoints, trendSegments };
}

export function initEcosystemServicesCompanyScatterChart() {
  const chartRoot = document.getElementById("ecosystem-services-company-scatter-chart");
  const statusElement = document.getElementById("ecosystem-services-company-scatter-status");
  const coarseSelect = document.getElementById("ecosystem-services-company-coarse-filter");

  if (!chartRoot || !statusElement || !coarseSelect) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "ecosystem-services-company-scatter-canvas";
  chartRoot.append(canvas);

  const tooltip = document.createElement("div");
  tooltip.className = "ecosystem-services-company-scatter-tooltip";
  tooltip.style.display = "none";
  chartRoot.append(tooltip);

  let allRows = [];
  let plottedPoints = [];
  let trendSegments = [];
  let renderQueued = false;
  let localCoarseCategory = DEFAULT_COARSE_CATEGORY;
  let tooltipMode = null;

  const setStatus = (text) => {
    statusElement.textContent = text;
  };

  const populateCoarseFilter = () => {
    coarseSelect.innerHTML = "";
    const categories = [...new Set(allRows.map((row) => row.coarseCategory))].sort((a, b) => a.localeCompare(b));
    categories.forEach((category) => {
      ensureOption(coarseSelect, category, category);
    });
    if (!categories.includes(localCoarseCategory)) {
      localCoarseCategory = categories.includes(DEFAULT_COARSE_CATEGORY)
        ? DEFAULT_COARSE_CATEGORY
        : (categories[0] || "");
    }

    coarseSelect.value = localCoarseCategory;
  };

  const queueRender = () => {
    if (renderQueued) {
      return;
    }

    renderQueued = true;
    window.requestAnimationFrame(() => {
      renderQueued = false;
      const filteredRows = filterRows(allRows, localCoarseCategory);

      if (!filteredRows.length) {
        chartRoot.classList.add("is-empty");
        canvas.style.display = "none";
        tooltip.style.display = "none";
        tooltipMode = null;
        setStatus("No companies available for the selected coarse category.");
        return;
      }

      chartRoot.classList.remove("is-empty");
      canvas.style.display = "block";

      const width = Math.max(740, chartRoot.clientWidth || 0);
      const height = 968;
      canvas.width = width;
      canvas.height = height;
      const renderResult = drawChart(canvas, filteredRows);
      plottedPoints = renderResult.plottedPoints;
      trendSegments = renderResult.trendSegments;

      const r = computePearson(filteredRows);
      const rText = Number.isFinite(r) ? `Pearson r = ${formatNumber(r, 3)}` : "Pearson r unavailable";
      setStatus(`${filteredRows.length.toLocaleString()} companies plotted. ${rText}.`);
    });
  };

  coarseSelect.addEventListener("change", (event) => {
    localCoarseCategory = event.target.value || localCoarseCategory;
    queueRender();
  });

  window.addEventListener("resize", () => {
    queueRender();
  });

  chartRoot.addEventListener("pointermove", (event) => {
    if (!plottedPoints.length || canvas.style.display === "none") {
      tooltip.style.display = "none";
      tooltipMode = null;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let nearest = null;
    let nearestDistance = Infinity;

    for (let i = 0; i < plottedPoints.length; i += 1) {
      const point = plottedPoints[i];
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance <= 8 && distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }

    if (!nearest) {
      let nearestTrend = null;
      let nearestTrendDistance = Infinity;

      for (let i = 0; i < trendSegments.length; i += 1) {
        const segment = trendSegments[i];
        const distance = distanceToSegment(x, y, segment.startX, segment.startY, segment.endX, segment.endY);
        if (distance <= 7 && distance < nearestTrendDistance) {
          nearestTrend = segment;
          nearestTrendDistance = distance;
        }
      }

      if (!nearestTrend) {
        tooltip.style.display = "none";
        tooltipMode = null;
        return;
      }

      tooltip.innerHTML = `<div><strong>${escapeHtml(nearestTrend.isicSection)}</strong></div><div>Trend line</div><div>r = ${formatNumber(nearestTrend.r, 3)}</div>`;
      tooltip.style.display = "block";
      tooltip.style.left = `${Math.min(canvas.width - 280, x + 12)}px`;
      tooltip.style.top = `${Math.max(8, y + 12)}px`;
      tooltipMode = "trend";
      return;
    }

    const row = nearest.row;
    tooltip.innerHTML = `<div><strong>${escapeHtml(row.companyName || row.companyId)}</strong></div><div>${escapeHtml(row.isicSection)}</div><div>${escapeHtml(row.coarseCategory)}</div><div>Dependency: ${formatNumber(row.dep)} | Pressure: ${formatNumber(row.press)}</div>`;
    tooltip.style.display = "block";
    tooltip.style.left = `${Math.min(canvas.width - 280, nearest.x + 12)}px`;
    tooltip.style.top = `${Math.max(8, nearest.y - 10)}px`;
    tooltipMode = "point";
  });

  chartRoot.addEventListener("pointerleave", () => {
    tooltip.style.display = "none";
    tooltipMode = null;
  });

  Promise.all([
    fetchDashboardDataText("dashboard_master.csv", "dashboard master"),
    fetchDashboardDataText("company_integrated_profile.csv", "company integrated profile"),
  ])
    .then(([dashboardCsv, profileCsv]) => {
      const dashboardRows = parseTable(dashboardCsv);
      const profileRows = parseTable(profileCsv);
      allRows = buildRows(dashboardRows, profileRows);
      populateCoarseFilter();
      queueRender();
    })
    .catch((error) => {
      setStatus(`Unable to load company scatter data: ${error?.message || error}`);
      chartRoot.classList.add("is-empty");
      canvas.style.display = "none";
      tooltip.style.display = "none";
    });
}
