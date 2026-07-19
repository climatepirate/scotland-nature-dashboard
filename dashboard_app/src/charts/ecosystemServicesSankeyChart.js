import { fetchDashboardDataText } from "../config/dataAssetLoader.js";
import { loadGlobalFilterData, globalFilterData } from "../config/globalFilterData.js";
import { getState, subscribe, updateState } from "../state/state.js";
import { emitGlobalFilterChange } from "../filters/globalMapFilter.js";

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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

function parseDashboardMasterRows(csvText) {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((value) => value.trim());
  const indexByName = Object.fromEntries(headers.map((name, index) => [name, index]));

  const required = ["local_authority_code", "coarse_category", "first_isic_section", "scorable_flag"];
  const missing = required.filter((name) => !(name in indexByName));
  if (missing.length) {
    throw new Error(`Sankey source is missing required columns: ${missing.join(", ")}`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const localAuthorityCode = (values[indexByName.local_authority_code] || "").trim();
    const coarseCategory = (values[indexByName.coarse_category] || "").trim();
    const firstIsicSection = (values[indexByName.first_isic_section] || "").trim();
    const scorableFlag = (values[indexByName.scorable_flag] || "").trim().toLowerCase();

    if (scorableFlag !== "true") {
      continue;
    }

    if (!localAuthorityCode || !coarseCategory || !firstIsicSection) {
      continue;
    }

    if (coarseCategory === "Dormant Company") {
      continue;
    }

    rows.push({
      localAuthorityCode,
      coarseCategory,
      firstIsicSection,
    });
  }

  return rows;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString();
}

function withAlpha(hexColor, alpha) {
  const color = (hexColor || "#8a8f99").replace("#", "");
  if (color.length !== 6) {
    return `rgba(138, 143, 153, ${alpha})`;
  }

  const red = parseInt(color.slice(0, 2), 16);
  const green = parseInt(color.slice(2, 4), 16);
  const blue = parseInt(color.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getCoarseColor(name) {
  return COARSE_COLORS[name] || COARSE_COLORS.Unclassified;
}

function flowWeight(count) {
  // Compress larger categories so dominant nodes do not over-expand chart height.
  return Math.pow(Math.max(Number(count) || 0, 0), 0.86);
}

function aggregateSankey(rows, state) {
  const filteredRows = rows.filter((row) => {
    if (state.localAuthorityCode !== ALL_SCOTLAND && row.localAuthorityCode !== state.localAuthorityCode) {
      return false;
    }

    if (state.coarseCategory !== ALL_CATEGORIES && row.coarseCategory !== state.coarseCategory) {
      return false;
    }

    if (state.isicSection !== ALL_ISIC && row.firstIsicSection !== state.isicSection) {
      return false;
    }

    return true;
  });

  const flowMap = new Map();
  const leftTotals = new Map();
  const rightTotals = new Map();

  filteredRows.forEach((row) => {
    const key = `${row.coarseCategory}||${row.firstIsicSection}`;
    flowMap.set(key, (flowMap.get(key) || 0) + 1);
    leftTotals.set(row.coarseCategory, (leftTotals.get(row.coarseCategory) || 0) + 1);
    rightTotals.set(row.firstIsicSection, (rightTotals.get(row.firstIsicSection) || 0) + 1);
  });

  const leftNodes = [...leftTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count, weight: flowWeight(count) }));

  const rightDetails = new Map();
  flowMap.forEach((value, key) => {
    const [coarseCategory, isicSection] = key.split("||");
    if (!rightDetails.has(isicSection)) {
      rightDetails.set(isicSection, new Map());
    }
    rightDetails.get(isicSection).set(coarseCategory, value);
  });

  const rightNodes = [...rightTotals.entries()]
    .map(([name, count]) => {
      const coarseBreakdown = rightDetails.get(name) || new Map();
      let mainCoarse = "";
      let mainCoarseCount = -1;
      coarseBreakdown.forEach((coarseCount, coarseName) => {
        if (coarseCount > mainCoarseCount) {
          mainCoarse = coarseName;
          mainCoarseCount = coarseCount;
        }
      });

      const mainCoarseRank = leftNodes.findIndex((node) => node.name === mainCoarse);
      return {
        name,
        count,
        weight: flowWeight(count),
        mainCoarse,
        mainCoarseRank: mainCoarseRank >= 0 ? mainCoarseRank : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.mainCoarseRank - b.mainCoarseRank || b.count - a.count || a.name.localeCompare(b.name));

  const rightIndexByName = new Map(rightNodes.map((node, index) => [node.name, index]));

  const flows = [...flowMap.entries()]
    .map(([key, count]) => {
      const [coarseCategory, isicSection] = key.split("||");
      return { coarseCategory, isicSection, count, weight: flowWeight(count) };
    })
    .sort((a, b) => {
      const coarseDelta = leftNodes.findIndex((node) => node.name === a.coarseCategory)
        - leftNodes.findIndex((node) => node.name === b.coarseCategory);
      if (coarseDelta !== 0) {
        return coarseDelta;
      }
      const rightDelta = (rightIndexByName.get(a.isicSection) || 0) - (rightIndexByName.get(b.isicSection) || 0);
      if (rightDelta !== 0) {
        return rightDelta;
      }
      return b.count - a.count;
    });

  return {
    totalCount: filteredRows.length,
    leftNodes,
    rightNodes,
    flows,
  };
}

function layoutNodes(nodes, top, height, gap, scale) {
  let cursor = top;
  return nodes.map((node) => {
    const nodeHeight = Math.max(2, node.weight * scale);
    const layout = {
      ...node,
      y: cursor,
      h: nodeHeight,
      centerY: cursor + nodeHeight / 2,
    };
    cursor += nodeHeight + gap;
    return layout;
  });
}

function spreadLabelCenters(nodes, minGap, minY, maxY) {
  if (!nodes.length) {
    return new Map();
  }

  const span = Math.max(0, maxY - minY);
  const maxFeasibleGap = nodes.length > 1 ? span / (nodes.length - 1) : minGap;
  const effectiveGap = Math.min(minGap, maxFeasibleGap);

  const centers = nodes.map((node) => ({ name: node.name, y: Math.max(minY, Math.min(maxY, node.centerY)) }));

  for (let i = 1; i < centers.length; i += 1) {
    const previous = centers[i - 1];
    const current = centers[i];
    if (current.y - previous.y < effectiveGap) {
      current.y = previous.y + effectiveGap;
    }
  }

  const overflow = centers[centers.length - 1].y - maxY;
  if (overflow > 0) {
    for (let i = 0; i < centers.length; i += 1) {
      centers[i].y -= overflow;
    }
  }

  if (centers[0].y < minY) {
    const underflow = minY - centers[0].y;
    for (let i = 0; i < centers.length; i += 1) {
      centers[i].y += underflow;
    }
  }

  for (let i = centers.length - 2; i >= 0; i -= 1) {
    const next = centers[i + 1];
    const current = centers[i];
    if (next.y - current.y < effectiveGap) {
      current.y = next.y - effectiveGap;
    }
  }

  const adjusted = new Map();
  centers.forEach((entry) => {
    adjusted.set(entry.name, Math.max(minY, Math.min(maxY, entry.y)));
  });
  return adjusted;
}

function buildSankeySvg(model, width, height) {
  const padding = { top: 52, right: 490, bottom: 24, left: 220 };
  const nodeWidth = 16;
  const leftX = padding.left;
  const rightX = width - padding.right - nodeWidth;
  const chartHeight = Math.max(120, height - padding.top - padding.bottom);

  const leftCount = Math.max(model.leftNodes.length, 1);
  const rightCount = Math.max(model.rightNodes.length, 1);
  const leftGap = Math.min(38, Math.max(16, chartHeight / (leftCount * 2.3)));
  const rightGap = Math.min(34, Math.max(12, chartHeight / (rightCount * 3.2)));

  const leftTotal = model.leftNodes.reduce((sum, node) => sum + node.weight, 0);
  const rightTotal = model.rightNodes.reduce((sum, node) => sum + node.weight, 0);
  const effectiveTotal = Math.max(leftTotal, rightTotal, 1);

  const leftGapSpace = leftGap * Math.max(model.leftNodes.length - 1, 0);
  const rightGapSpace = rightGap * Math.max(model.rightNodes.length - 1, 0);
  const usableLeft = Math.max(80, chartHeight - leftGapSpace);
  const usableRight = Math.max(80, chartHeight - rightGapSpace);
  const scale = Math.min(usableLeft / effectiveTotal, usableRight / effectiveTotal);

  const leftNodesBase = layoutNodes(model.leftNodes, padding.top, chartHeight, leftGap, scale);
  const rightNodesBase = layoutNodes(model.rightNodes, padding.top, chartHeight, rightGap, scale);

  const leftByName = new Map(leftNodesBase.map((node) => [node.name, { ...node, offset: 0 }]));
  const rightByName = new Map(rightNodesBase.map((node) => [node.name, { ...node, offset: 0 }]));

  const links = model.flows.map((flow) => {
    const leftNode = leftByName.get(flow.coarseCategory);
    const rightNode = rightByName.get(flow.isicSection);

    const thickness = Math.max(0.35, flow.weight * scale);

    const y0 = leftNode.y + leftNode.offset + thickness / 2;
    const y1 = rightNode.y + rightNode.offset + thickness / 2;

    leftNode.offset += thickness;
    rightNode.offset += thickness;

    return {
      ...flow,
      y0,
      y1,
      thickness,
      color: withAlpha(getCoarseColor(flow.coarseCategory), 0.34),
    };
  });

  const leftThicknessByName = new Map(model.leftNodes.map((node) => [node.name, 0]));
  const rightThicknessByName = new Map(model.rightNodes.map((node) => [node.name, 0]));
  links.forEach((link) => {
    leftThicknessByName.set(link.coarseCategory, (leftThicknessByName.get(link.coarseCategory) || 0) + link.thickness);
    rightThicknessByName.set(link.isicSection, (rightThicknessByName.get(link.isicSection) || 0) + link.thickness);
  });

  const leftNodes = leftNodesBase.map((node) => ({
    ...node,
    h: leftThicknessByName.get(node.name) || node.h,
    centerY: node.y + ((leftThicknessByName.get(node.name) || node.h) / 2),
  }));
  const rightNodes = rightNodesBase.map((node) => ({
    ...node,
    h: rightThicknessByName.get(node.name) || node.h,
    centerY: node.y + ((rightThicknessByName.get(node.name) || node.h) / 2),
  }));

  const leftLabelY = spreadLabelCenters(leftNodes, 24, padding.top + 10, padding.top + chartHeight - 10);
  const rightLabelY = spreadLabelCenters(rightNodes, 24, padding.top + 10, padding.top + chartHeight - 10);

  const coarseSetByIsic = new Map();
  model.flows.forEach((flow) => {
    if (!coarseSetByIsic.has(flow.isicSection)) {
      coarseSetByIsic.set(flow.isicSection, new Set());
    }
    coarseSetByIsic.get(flow.isicSection).add(flow.coarseCategory);
  });

  const pathCurvature = Math.max(120, (rightX - leftX) * 0.45);

  const linkMarkup = links
    .map((link) => {
      const d = [
        `M ${leftX + nodeWidth} ${link.y0}`,
        `C ${leftX + nodeWidth + pathCurvature} ${link.y0},`,
        `${rightX - pathCurvature} ${link.y1},`,
        `${rightX} ${link.y1}`,
      ].join(" ");

      return `<path d="${d}" fill="none" stroke="${link.color}" stroke-width="${link.thickness.toFixed(2)}" stroke-linecap="butt"><title>${escapeHtml(link.coarseCategory)} → ${escapeHtml(link.isicSection)}: ${formatCount(link.count)} businesses</title></path>`;
    })
    .join("");

  const leftNodeMarkup = leftNodes
    .map((node) => {
      const color = getCoarseColor(node.name);
      return `
        <rect x="${leftX}" y="${node.y.toFixed(2)}" width="${nodeWidth}" height="${node.h.toFixed(2)}" rx="2" fill="${color}"></rect>
        <text x="${leftX - 12}" y="${(leftLabelY.get(node.name) || node.centerY).toFixed(2)}" class="sankey-node-label sankey-node-label--left">${escapeHtml(node.name)}</text>
        <text x="${leftX + nodeWidth + 10}" y="${(leftLabelY.get(node.name) || node.centerY).toFixed(2)}" class="sankey-node-count">${formatCount(node.count)}</text>
      `;
    })
    .join("");

  const rightNodeMarkup = rightNodes
    .map((node) => {
      const coarseSet = coarseSetByIsic.get(node.name) || new Set();
      const color = coarseSet.size === 1
        ? getCoarseColor([...coarseSet][0])
        : "#9aa0a8";
      const rightCenterY = node.centerY;

      return `
        <rect x="${rightX}" y="${node.y.toFixed(2)}" width="${nodeWidth}" height="${node.h.toFixed(2)}" rx="2" fill="${color}"></rect>
        <text x="${rightX - 10}" y="${rightCenterY.toFixed(2)}" class="sankey-node-count sankey-node-count--right">${formatCount(node.count)}</text>
        <text x="${rightX + nodeWidth + 12}" y="${rightCenterY.toFixed(2)}" class="sankey-node-label">${escapeHtml(node.name)}</text>
      `;
    })
    .join("");

  const headerMarkup = `
    <text x="${leftX}" y="26" class="sankey-side-title">Coarse Category</text>
    <text x="${rightX + nodeWidth}" y="26" class="sankey-side-title">ISIC Section</text>
  `;

  return `
    <svg viewBox="0 0 ${width} ${height}" class="sankey-svg" role="img" aria-label="Sankey diagram of business counts by coarse category and ISIC section">
      ${headerMarkup}
      <g class="sankey-links">${linkMarkup}</g>
      <g class="sankey-nodes">${leftNodeMarkup}${rightNodeMarkup}</g>
    </svg>
  `;
}

function ensureOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

export function initEcosystemServicesSankeyChart() {
  const chartRoot = document.getElementById("ecosystem-services-sankey-chart");
  const statusElement = document.getElementById("ecosystem-services-sankey-status");
  const coarseSelect = document.getElementById("ecosystem-services-coarse-category");
  const isicSelect = document.getElementById("ecosystem-services-isic-section");
  const authoritySelect = document.getElementById("ecosystem-services-local-authority");
  const resetButton = document.getElementById("ecosystem-services-reset-filters");

  if (!chartRoot || !statusElement || !coarseSelect || !isicSelect || !authoritySelect || !resetButton) {
    return;
  }

  let sourceRows = [];
  let renderQueued = false;

  const setStatus = (message) => {
    statusElement.textContent = message;
  };

  const queueRender = () => {
    if (renderQueued) {
      return;
    }

    renderQueued = true;
    window.requestAnimationFrame(() => {
      renderQueued = false;
      const state = getState();
      const model = aggregateSankey(sourceRows, state);

      if (!model.totalCount || !model.leftNodes.length || !model.rightNodes.length) {
        chartRoot.innerHTML = '<div class="placeholder"><strong>No Results</strong>Adjust filters to view the Sankey flow.</div>';
        setStatus("No businesses match the current filter combination.");
        return;
      }

      const width = Math.max(920, chartRoot.clientWidth || 0);
      const baseHeight = Math.max(460, Math.max(model.leftNodes.length, model.rightNodes.length) * 31 + 96);
      const rightLabelGap = 30;
      const rightLabelHeight = model.rightNodes.length > 1
        ? ((model.rightNodes.length - 1) * rightLabelGap) + 130
        : 460;
      const dynamicHeight = Math.max(baseHeight, rightLabelHeight);
      chartRoot.innerHTML = buildSankeySvg(model, width, dynamicHeight);
      setStatus(`${formatCount(model.totalCount)} businesses represented in current flow.`);
    });
  };

  const syncFiltersFromState = () => {
    const state = getState();

    coarseSelect.value = state.coarseCategory;
    authoritySelect.value = state.localAuthorityCode;
    isicSelect.value = state.isicSection;

    queueRender();
  };

  const populateFilterOptions = () => {
    coarseSelect.innerHTML = "";
    authoritySelect.innerHTML = "";
    isicSelect.innerHTML = "";

    ensureOption(coarseSelect, ALL_CATEGORIES, ALL_CATEGORIES);
    globalFilterData.coarseCategories.forEach((category) => {
      ensureOption(coarseSelect, category, category);
    });

    ensureOption(authoritySelect, ALL_SCOTLAND, ALL_SCOTLAND);
    globalFilterData.localAuthorities.forEach((authority) => {
      ensureOption(authoritySelect, authority.code, authority.name);
    });

    const isicSections = [...new Set(sourceRows.map((row) => row.firstIsicSection))].sort((a, b) => a.localeCompare(b));
    ensureOption(isicSelect, ALL_ISIC, ALL_ISIC);
    isicSections.forEach((section) => {
      ensureOption(isicSelect, section, section);
    });

    syncFiltersFromState();
  };

  coarseSelect.addEventListener("change", (event) => {
    const nextState = updateState({ coarseCategory: event.target.value || ALL_CATEGORIES });
    emitGlobalFilterChange(nextState);
  });

  authoritySelect.addEventListener("change", (event) => {
    const nextState = updateState({ localAuthorityCode: event.target.value || ALL_SCOTLAND });
    emitGlobalFilterChange(nextState);
  });

  isicSelect.addEventListener("change", (event) => {
    updateState({ isicSection: event.target.value || ALL_ISIC });
  });

  resetButton.addEventListener("click", () => {
    const nextState = updateState({
      localAuthorityCode: ALL_SCOTLAND,
      coarseCategory: ALL_CATEGORIES,
      isicSection: ALL_ISIC,
    });
    emitGlobalFilterChange(nextState);
  });

  subscribe(() => {
    syncFiltersFromState();
  });

  window.addEventListener("resize", () => {
    queueRender();
  });

  Promise.all([
    loadGlobalFilterData(),
    fetchDashboardDataText("dashboard_master.csv", "dashboard master"),
  ])
    .then(([, csvText]) => {
      sourceRows = parseDashboardMasterRows(csvText);
      populateFilterOptions();
    })
    .catch((error) => {
      setStatus(`Unable to load Sankey data: ${error?.message || error}`);
      chartRoot.innerHTML = '<div class="placeholder"><strong>Load Error</strong>The Sankey module could not be initialized.</div>';
    });
}
