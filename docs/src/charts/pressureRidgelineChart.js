import { fetchDashboardDataJson } from "../config/dataAssetLoader.js";
import { getState, subscribe } from "../state/state.js";

const ALL_SCOTLAND = "All Scotland";
const ALL_CATEGORIES = "All Categories";
const DEFAULT_PRESSURE = "All ecosystem pressures";
const CORE_CATEGORY_ORDER = [
  "Business & Property Services",
  "Consumer & Visitor Economy",
  "Primary & Resource Industries",
  "Public & Community Services",
];
const UNCLASSIFIED = "Unclassified";
const CATEGORY_COLORS = {
  "Business & Property Services": "#6b6fae",
  "Consumer & Visitor Economy": "#3d8a95",
  "Primary & Resource Industries": "#d18b2f",
  "Public & Community Services": "#6c9b57",
  Unclassified: "#9aa8a2",
};
const PRESSURE_OPTION_LABELS = [
  "All ecosystem pressures",
  "Freshwater area use",
  "Land use",
  "Seabed use",
  "Water use",
  "Biotic resource extraction",
  "Abiotic resource extraction",
  "Greenhouse-gas emissions",
  "Non-GHG air pollutants",
  "Nutrient soil and water pollutants",
  "Toxic soil and water pollutants",
  "Solid-waste generation",
  "Introduction of invasive species",
  "Disturbance: noise and light",
];

const densityCache = new Map();
let ridgelineDataPromise = null;
let ridgelineChartInitialized = false;

function normalizePressureName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgba(hex, alpha) {
  const normalized = String(hex || "#667").replace("#", "").trim();
  const safe = normalized.length === 3
    ? normalized.split("").map((chunk) => `${chunk}${chunk}`).join("")
    : normalized;
  const int = Number.parseInt(safe, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value);
}

function formatDensity(value) {
  return Number(value || 0).toFixed(4);
}

function formatScore(value) {
  return Number(value || 0).toFixed(2);
}

function evaluateDensityAt(points, score) {
  if (!Array.isArray(points) || points.length === 0) {
    return 0;
  }
  if (score <= points[0].x) {
    return points[0].y;
  }
  if (score >= points[points.length - 1].x) {
    return points[points.length - 1].y;
  }

  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1];
    const right = points[index];
    if (score >= left.x && score <= right.x) {
      const width = right.x - left.x || 1;
      const t = (score - left.x) / width;
      return left.y + (right.y - left.y) * t;
    }
  }

  return 0;
}

function gaussianKernel(distance) {
  return Math.exp(-0.5 * distance * distance) / Math.sqrt(2 * Math.PI);
}

function estimateBandwidth(scoreCounts, sampleSize) {
  if (!sampleSize || sampleSize <= 1) {
    return 0.25;
  }

  let weightedMean = 0;
  scoreCounts.forEach(([score, count]) => {
    weightedMean += score * count;
  });
  weightedMean /= sampleSize;

  let variance = 0;
  scoreCounts.forEach(([score, count]) => {
    const delta = score - weightedMean;
    variance += count * delta * delta;
  });
  variance /= Math.max(sampleSize - 1, 1);

  const sigma = Math.sqrt(Math.max(variance, 0));
  if (!Number.isFinite(sigma) || sigma === 0) {
    return 0.25;
  }

  const silverman = 1.06 * sigma * Math.pow(sampleSize, -1 / 5);
  return clamp(silverman, 0.15, 1.4);
}

function buildDensityCurve(cacheKey, scoreCounts, domainMin, domainMax) {
  if (densityCache.has(cacheKey)) {
    return densityCache.get(cacheKey);
  }

  const sampleSize = scoreCounts.reduce((sum, [, count]) => sum + count, 0);
  if (!sampleSize || !scoreCounts.length) {
    const empty = {
      points: [
        { x: domainMin, y: 0 },
        { x: domainMax, y: 0 },
      ],
      maxDensity: 0,
      companyCount: 0,
    };
    densityCache.set(cacheKey, empty);
    return empty;
  }

  const bandwidth = estimateBandwidth(scoreCounts, sampleSize);
  const samplePoints = 80;
  const step = (domainMax - domainMin) / Math.max(samplePoints - 1, 1);
  const points = [];
  let maxDensity = 0;

  for (let i = 0; i < samplePoints; i += 1) {
    const x = domainMin + step * i;
    let weighted = 0;
    scoreCounts.forEach(([score, count]) => {
      weighted += count * gaussianKernel((x - score) / bandwidth);
    });

    const density = weighted / (sampleSize * bandwidth);
    maxDensity = Math.max(maxDensity, density);
    points.push({ x, y: density });
  }

  const result = {
    points,
    maxDensity,
    companyCount: sampleSize,
  };
  densityCache.set(cacheKey, result);
  return result;
}

async function loadRidgelineData() {
  if (!ridgelineDataPromise) {
    ridgelineDataPromise = fetchDashboardDataJson("pressure_ridgeline_index.json", "pressure ridgeline index")
      .then((payload) => {
        const lookup = new Map();
        const pressures = new Map();
        (payload.records || []).forEach((record) => {
          const key = `${record.pressure_key}||${record.local_authority_code}||${record.coarse_category}`;
          lookup.set(key, {
            pressureKey: record.pressure_key,
            pressureLabel: record.pressure_label,
            localAuthorityCode: record.local_authority_code,
            coarseCategory: record.coarse_category,
            companyCount: Number(record.company_count || 0),
            scoreCounts: Array.isArray(record.score_counts)
              ? record.score_counts.map(([score, count]) => [Number(score), Number(count)])
              : [],
          });
          pressures.set(record.pressure_key, record.pressure_label);
        });

        PRESSURE_OPTION_LABELS.forEach((label) => {
          pressures.set(normalizePressureName(label), label);
        });

        const scoreDomainRaw = payload.score_domain || [0, 1];
        const scoreDomain = [
          Number(scoreDomainRaw[0] ?? 0),
          Number(scoreDomainRaw[1] ?? 1),
        ];

        return {
          lookup,
          pressureLabelsByKey: pressures,
          categoryOrder: payload.category_order || [...CORE_CATEGORY_ORDER, UNCLASSIFIED],
          scoreDomain,
        };
      });
  }

  return ridgelineDataPromise;
}

function createScale(domainMin, domainMax, rangeMin, rangeMax) {
  const span = domainMax - domainMin || 1;
  const scale = (value) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
  scale.invert = (pixel) => domainMin + ((pixel - rangeMin) / (rangeMax - rangeMin || 1)) * span;
  return scale;
}

function buildAreaPath(points, xScale, yScale, baselineY) {
  if (!points.length) {
    return "";
  }

  const first = points[0];
  const last = points[points.length - 1];
  let path = `M ${xScale(first.x).toFixed(2)} ${baselineY.toFixed(2)} `;
  points.forEach((point) => {
    path += `L ${xScale(point.x).toFixed(2)} ${yScale(point.y).toFixed(2)} `;
  });
  path += `L ${xScale(last.x).toFixed(2)} ${baselineY.toFixed(2)} Z`;
  return path;
}

function buildLinePath(points, xScale, yScale) {
  if (!points.length) {
    return "";
  }

  let path = `M ${xScale(points[0].x).toFixed(2)} ${yScale(points[0].y).toFixed(2)} `;
  for (let i = 1; i < points.length; i += 1) {
    path += `L ${xScale(points[i].x).toFixed(2)} ${yScale(points[i].y).toFixed(2)} `;
  }
  return path;
}

function resolvePressureKey(data, selectedPressure) {
  const selected = normalizePressureName(selectedPressure || DEFAULT_PRESSURE);
  if (data.pressureLabelsByKey.has(selected)) {
    return selected;
  }

  const fallbackEntry = Array.from(data.pressureLabelsByKey.keys())[0] || selected;
  return fallbackEntry;
}

function resolveCategoriesForState(data, state, pressureKey) {
  const localAuthority = state.localAuthorityCode || ALL_SCOTLAND;
  const selectedCategory = state.coarseCategory || ALL_CATEGORIES;

  if (selectedCategory !== ALL_CATEGORIES) {
    return [selectedCategory];
  }

  const categories = [...CORE_CATEGORY_ORDER];
  const unclassifiedRecord = data.lookup.get(`${pressureKey}||${localAuthority}||${UNCLASSIFIED}`);
  if (unclassifiedRecord && unclassifiedRecord.companyCount > 0) {
    categories.push(UNCLASSIFIED);
  }

  return categories;
}

function splitCategoryLabelForDisplay(category) {
  const categoryText = String(category || "").trim();
  const ampersandIndex = categoryText.indexOf("&");
  if (ampersandIndex < 0) {
    return [categoryText];
  }

  const firstLine = categoryText.slice(0, ampersandIndex + 1).trim();
  const secondLine = categoryText.slice(ampersandIndex + 1).trim();
  if (!secondLine) {
    return [firstLine];
  }
  return [firstLine, secondLine];
}

function clearSvg(svg) {
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
}

export function initPressureRidgelineChart() {
  if (ridgelineChartInitialized) {
    return;
  }

  const svg = document.getElementById("pressure-ridgeline-chart");
  const subtitle = document.getElementById("pressure-ridgeline-subtitle");
  const status = document.getElementById("pressure-ridgeline-status");
  const tooltip = document.getElementById("pressure-ridgeline-tooltip");

  if (!svg || !subtitle || !status || !tooltip) {
    return;
  }

  ridgelineChartInitialized = true;

  const showStatus = (text) => {
    status.hidden = false;
    status.textContent = text;
  };

  const hideStatus = () => {
    status.hidden = true;
  };

  const hideTooltip = () => {
    tooltip.hidden = true;
  };

  const render = async () => {
    showStatus("Loading pressure distribution...");
    hideTooltip();
    clearSvg(svg);

    try {
      const data = await loadRidgelineData();
      const state = getState();
      const selectedPressureLabel = state.selectedPressure || DEFAULT_PRESSURE;
      const pressureKey = resolvePressureKey(data, selectedPressureLabel);
      const fallbackPressureLabel = data.pressureLabelsByKey.get(pressureKey) || selectedPressureLabel || DEFAULT_PRESSURE;
      subtitle.textContent = `Selected ecosystem pressure: ${selectedPressureLabel || fallbackPressureLabel}`;

      const localAuthority = state.localAuthorityCode || ALL_SCOTLAND;
      const categories = resolveCategoriesForState(data, state, pressureKey);

      const records = categories.map((category) => {
        const record = data.lookup.get(`${pressureKey}||${localAuthority}||${category}`);
        return {
          coarseCategory: category,
          companyCount: record?.companyCount || 0,
          scoreCounts: record?.scoreCounts || [],
        };
      });

      const hasAnyData = records.some((record) => record.companyCount > 0);
      if (!hasAnyData) {
        showStatus("No company-level pressure scores available for the current filters.");
        return;
      }

      const width = Math.max(svg.clientWidth || svg.parentElement?.clientWidth || 620, 520);
      const margin = { top: 18, right: 20, bottom: 40, left: 148 };
      const rowGap = 12;
      const ridgeHeight = 66;
      const plotHeight = records.length * ridgeHeight + Math.max(records.length - 1, 0) * rowGap;
      const height = margin.top + plotHeight + margin.bottom;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", String(height));

      const domainMin = 0;
      const domainMax = Number(data.scoreDomain[1] ?? 1);
      const xScale = createScale(domainMin, domainMax, margin.left, width - margin.right);

      const curveData = records.map((record) => {
        const cacheKey = `${pressureKey}||${localAuthority}||${record.coarseCategory}`;
        return {
          ...record,
          ...buildDensityCurve(cacheKey, record.scoreCounts, domainMin, domainMax),
        };
      });

      const maxDensity = Math.max(...curveData.map((item) => item.maxDensity), 1e-9);

      const axisGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      svg.appendChild(axisGroup);

      const axisY = margin.top + plotHeight + 2;
      const axisLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      axisLine.setAttribute("x1", String(margin.left));
      axisLine.setAttribute("x2", String(width - margin.right));
      axisLine.setAttribute("y1", String(axisY));
      axisLine.setAttribute("y2", String(axisY));
      axisLine.setAttribute("stroke", "#8b9b98");
      axisLine.setAttribute("stroke-width", "1");
      axisGroup.appendChild(axisLine);

      const tickCount = 6;
      for (let i = 0; i < tickCount; i += 1) {
        const t = i / (tickCount - 1);
        const score = domainMin + t * (domainMax - domainMin);
        const x = xScale(score);

        const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tick.setAttribute("x1", String(x));
        tick.setAttribute("x2", String(x));
        tick.setAttribute("y1", String(axisY));
        tick.setAttribute("y2", String(axisY + 6));
        tick.setAttribute("stroke", "#8b9b98");
        tick.setAttribute("stroke-width", "1");
        axisGroup.appendChild(tick);

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", String(x));
        label.setAttribute("y", String(axisY + 20));
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("fill", "#495957");
        label.setAttribute("font-size", "11");
        label.textContent = formatScore(score);
        axisGroup.appendChild(label);
      }

      const axisTitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
      axisTitle.setAttribute("x", String((margin.left + width - margin.right) / 2));
      axisTitle.setAttribute("y", String(height - 2));
      axisTitle.setAttribute("text-anchor", "middle");
      axisTitle.setAttribute("fill", "#223332");
      axisTitle.setAttribute("font-size", "12");
      axisTitle.setAttribute("font-weight", "700");
      axisTitle.textContent = "Pressure score";
      axisGroup.appendChild(axisTitle);

      curveData.forEach((item, index) => {
        const color = CATEGORY_COLORS[item.coarseCategory] || "#68817b";
        const top = margin.top + index * (ridgeHeight + rowGap);
        const baseline = top + ridgeHeight;
        const yScale = (density) => baseline - (density / maxDensity) * (ridgeHeight * 0.92);

        const baselineLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        baselineLine.setAttribute("x1", String(margin.left));
        baselineLine.setAttribute("x2", String(width - margin.right));
        baselineLine.setAttribute("y1", String(baseline));
        baselineLine.setAttribute("y2", String(baseline));
        baselineLine.setAttribute("stroke", "#d9e2de");
        baselineLine.setAttribute("stroke-width", "1");
        svg.appendChild(baselineLine);

        const areaPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        areaPath.setAttribute("d", buildAreaPath(item.points, xScale, yScale, baseline));
        areaPath.setAttribute("fill", hexToRgba(color, 0.34));
        areaPath.setAttribute("stroke", color);
        areaPath.setAttribute("stroke-width", "1.2");
        areaPath.setAttribute("vector-effect", "non-scaling-stroke");
        svg.appendChild(areaPath);

        const linePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        linePath.setAttribute("d", buildLinePath(item.points, xScale, yScale));
        linePath.setAttribute("fill", "none");
        linePath.setAttribute("stroke", color);
        linePath.setAttribute("stroke-width", "1.5");
        linePath.setAttribute("vector-effect", "non-scaling-stroke");
        svg.appendChild(linePath);

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", String(margin.left - 16));
        label.setAttribute("y", String(top + ridgeHeight * 0.48));
        label.setAttribute("text-anchor", "end");
        label.setAttribute("fill", "#1f2d2b");
        label.setAttribute("font-size", "12");
        label.setAttribute("font-weight", "600");
        const labelLines = splitCategoryLabelForDisplay(item.coarseCategory);
        labelLines.forEach((line, lineIndex) => {
          const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
          tspan.setAttribute("x", String(margin.left - 16));
          tspan.setAttribute("dy", lineIndex === 0 ? "0" : "1.15em");
          tspan.textContent = line;
          label.appendChild(tspan);
        });
        svg.appendChild(label);

        const hoverRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hoverRect.setAttribute("x", String(margin.left));
        hoverRect.setAttribute("y", String(top));
        hoverRect.setAttribute("width", String(width - margin.left - margin.right));
        hoverRect.setAttribute("height", String(ridgeHeight));
        hoverRect.setAttribute("fill", "transparent");
        svg.appendChild(hoverRect);

        hoverRect.addEventListener("mousemove", (event) => {
          const svgRect = svg.getBoundingClientRect();
          const xPixel = event.clientX - svgRect.left;
          const score = clamp(xScale.invert(xPixel), domainMin, domainMax);
          const density = evaluateDensityAt(item.points, score);

          tooltip.hidden = false;
          tooltip.innerHTML = `
            <div><strong>${item.coarseCategory}</strong></div>
            <div>Pressure score: ${formatScore(score)}</div>
            <div>Density: ${formatDensity(density)}</div>
            <div>Companies: ${formatNumber(item.companyCount)}</div>
          `;

          const wrapRect = svg.parentElement.getBoundingClientRect();
          const left = event.clientX - wrapRect.left + 12;
          const topPx = event.clientY - wrapRect.top + 12;
          tooltip.style.left = `${left}px`;
          tooltip.style.top = `${topPx}px`;
        });

        hoverRect.addEventListener("mouseleave", hideTooltip);
      });

      hideStatus();
    } catch (error) {
      showStatus(`Unable to render pressure ridgeline: ${error?.message || error}`);
    }
  };

  const scheduleRender = () => {
    render();
  };

  if (typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(() => {
      scheduleRender();
    });
    if (svg.parentElement) {
      resizeObserver.observe(svg.parentElement);
    }
  } else {
    window.addEventListener("resize", scheduleRender);
  }

  subscribe((nextState, prevState) => {
    if (
      nextState.localAuthorityCode !== prevState.localAuthorityCode
      || nextState.coarseCategory !== prevState.coarseCategory
      || nextState.selectedPressure !== prevState.selectedPressure
    ) {
      scheduleRender();
    }
  });

  scheduleRender();
}
