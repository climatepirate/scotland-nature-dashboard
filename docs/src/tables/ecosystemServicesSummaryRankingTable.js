import { getState, subscribe } from "../state/state.js";
import { fetchDashboardDataText } from "../config/dataAssetLoader.js";

const ALL_SCOTLAND = "All Scotland";
const ALL_CATEGORIES = "All Categories";
const ALL_ISIC = "All ISIC Sections";

function getSectorFilters(state) {
  return {
    localAuthorityCode: state.sectorLocalAuthorityCode || ALL_SCOTLAND,
    coarseCategory: state.sectorCoarseCategory || ALL_CATEGORIES,
    isicSection: state.sectorIsicSection || ALL_ISIC,
  };
}

function getSectorFilterKey(state) {
  const filters = getSectorFilters(state);
  return [filters.localAuthorityCode, filters.coarseCategory, filters.isicSection].join("|");
}
const PAGE_SIZE = 20;

const ROW_MODE_OPTIONS = [
  { value: "company", label: "Company" },
  { value: "isic", label: "ISIC Section" },
  { value: "coarse", label: "Coarse Category" },
  { value: "local-authority", label: "Local Authority" },
];

const LOCAL_AUTHORITY_NAME_BY_CODE = {
  S12000033: "Aberdeen City", S12000034: "Aberdeenshire", S12000041: "Angus",
  S12000035: "Argyll and Bute", S12000036: "City of Edinburgh", S12000005: "Clackmannanshire",
  S12000006: "Dumfries and Galloway", S12000042: "Dundee City", S12000008: "East Ayrshire",
  S12000045: "East Dunbartonshire", S12000010: "East Lothian", S12000011: "East Renfrewshire",
  S12000013: "Eilean Siar", S12000014: "Falkirk", S12000047: "Fife", S12000049: "Glasgow City",
  S12000017: "Highland", S12000018: "Inverclyde", S12000019: "Midlothian", S12000020: "Moray",
  S12000021: "North Ayrshire", S12000050: "North Lanarkshire", S12000023: "Orkney Islands",
  S12000048: "Perth and Kinross", S12000038: "Renfrewshire", S12000026: "Scottish Borders",
  S12000027: "Shetland Islands", S12000028: "South Ayrshire", S12000029: "South Lanarkshire",
  S12000030: "Stirling", S12000039: "West Dunbartonshire", S12000040: "West Lothian",
};

const RANK_OPTIONS = [
  { value: "dependency", label: "Total Dependency Score" },
  { value: "pressure", label: "Total Pressure Score" },
  { value: "combined", label: "Combined Score (Dependency + Pressure)" },
];

const RANK_FIELD_BY_OPTION = {
  dependency: "totalDependency",
  pressure: "totalPressure",
  combined: "combinedScore",
};

const OPTION_BY_RANK_FIELD = {
  totalDependency: "dependency",
  totalPressure: "pressure",
  combinedScore: "combined",
};

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
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

function splitSummaryList(value) {
  return String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
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

function createSelectOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function createControlField(labelText, id, options, defaultValue) {
  const field = document.createElement("div");
  field.className = "global-filter-item ecosystem-services-summary-control";

  const label = document.createElement("label");
  label.className = "global-filter-label";
  label.setAttribute("for", id);
  label.textContent = labelText;

  const select = document.createElement("select");
  select.id = id;
  select.className = "global-filter-input ecosystem-services-summary-control-input";

  options.forEach((option) => {
    createSelectOption(select, option.value, option.label);
  });

  select.value = defaultValue;
  field.append(label, select);
  return { field, select };
}

function createSearchField(labelText, id, placeholder) {
  const field = document.createElement("label");
  field.className = "global-filter-item ecosystem-services-summary-control ecosystem-services-summary-company-search-field";
  field.setAttribute("for", id);

  const label = document.createElement("span");
  label.className = "global-filter-label";
  label.textContent = labelText;

  const input = document.createElement("input");
  input.id = id;
  input.className = "global-filter-input ecosystem-services-summary-control-input";
  input.type = "search";
  input.placeholder = placeholder;
  input.autocomplete = "off";

  field.append(label, input);
  return { field, input };
}

function getRowModeLabel(mode) {
  return ROW_MODE_OPTIONS.find((option) => option.value === mode)?.label || "Company";
}

function getDefaultSortDirection(field) {
  return field === "label" ? "asc" : "desc";
}

function compareStrings(a, b, direction) {
  const comparison = String(a || "").localeCompare(String(b || ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
  return direction === "asc" ? comparison : -comparison;
}

function compareNumbers(a, b, direction) {
  const comparison = Number(a) - Number(b);
  return direction === "asc" ? comparison : -comparison;
}

function buildRecords(scatterRows, top5Map) {
  const records = [];
  scatterRows.forEach((row) => {
    const companyId = normalizeCompanyId(row.company_id);
    const companyName = (row.company_name || row.CompanyName || "").trim();
    const coarseCategory = (row.coarse_category || row["Coarse Category"] || "Unclassified").trim();
    const isicSection = (row.first_isic_section || "").trim();
    const localAuthorityCode = (row.local_authority_code || "").trim();
    const dep = Number.parseFloat(row.dep_score);
    const press = Number.parseFloat(row.press_score);

    if (!companyId || !coarseCategory || coarseCategory === "Dormant Company" || !isicSection || !localAuthorityCode) {
      return;
    }

    if (!Number.isFinite(dep) || !Number.isFinite(press)) {
      return;
    }

    const top5 = top5Map.get(companyId) || { services: [], pressures: [] };

    records.push({
      companyId,
      companyName: companyName || companyId,
      coarseCategory,
      isicSection,
      localAuthorityCode,
      totalDependency: dep,
      totalPressure: press,
      services: top5.services,
      pressures: top5.pressures,
    });
  });

  return records;
}

function buildItemCounts(records, keyField) {
  const grouped = new Map();

  records.forEach((record) => {
    const key = record[keyField];
    if (!key) {
      return;
    }

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        primaryLabel: key,
        secondaryLabel: "",
        companyIds: new Set(),
        labels: new Set(),
        totalDependency: 0,
        totalPressure: 0,
        services: new Map(),
        pressures: new Map(),
        itemCount: 0,
      });
    }

    const bucket = grouped.get(key);
    bucket.itemCount += 1;
    bucket.totalDependency += record.totalDependency;
    bucket.totalPressure += record.totalPressure;
    bucket.companyIds.add(record.companyId);
    if (record.companyName) {
      bucket.labels.add(record.companyName);
    }

    const services = [...new Set(record.services || [])];
    const pressures = [...new Set(record.pressures || [])];

    services.forEach((service) => {
      bucket.services.set(service, (bucket.services.get(service) || 0) + 1);
    });

    pressures.forEach((pressure) => {
      bucket.pressures.set(pressure, (bucket.pressures.get(pressure) || 0) + 1);
    });
  });

  return [...grouped.values()].map((bucket) => ({
    key: bucket.key,
    label: keyField === "companyId"
      ? [...bucket.labels][0] || bucket.key
      : bucket.key,
    secondaryLabel: keyField === "companyId"
      ? ""
      : `${bucket.itemCount.toLocaleString()} companies`,
    totalDependency: bucket.totalDependency,
    totalPressure: bucket.totalPressure,
    combinedScore: bucket.totalDependency + bucket.totalPressure,
    serviceItems: [...bucket.services.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    pressureItems: [...bucket.pressures.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    itemCount: bucket.itemCount,
  }));
}

function buildCompanyRows(records) {
  return records.map((record) => ({
    key: record.companyId,
    label: record.companyName || record.companyId,
    secondaryLabel: "",
    totalDependency: record.totalDependency,
    totalPressure: record.totalPressure,
    combinedScore: record.totalDependency + record.totalPressure,
    serviceItems: (record.services || []).map((label) => ({ label, count: 1 })),
    pressureItems: (record.pressures || []).map((label) => ({ label, count: 1 })),
    itemCount: 1,
  }));
}

function buildLocalAuthorityRows(records) {
  const rows = buildItemCounts(records, "localAuthorityCode");
  return rows.map((row) => ({
    ...row,
    label: LOCAL_AUTHORITY_NAME_BY_CODE[row.key] || row.key,
  }));
}

function filterRecords(records, state) {
  const filters = getSectorFilters(state);
  return records.filter((record) => {
    if (filters.localAuthorityCode !== ALL_SCOTLAND && record.localAuthorityCode !== filters.localAuthorityCode) {
      return false;
    }

    if (filters.coarseCategory !== ALL_CATEGORIES && record.coarseCategory !== filters.coarseCategory) {
      return false;
    }

    if (filters.isicSection !== ALL_ISIC && record.isicSection !== filters.isicSection) {
      return false;
    }

    return true;
  });
}

function summarizeItems(items) {
  if (!items.length) {
    return [];
  }

  return items;
}

function getSummaryItems(row, rowMode, kind) {
  const items = kind === "services" ? row.serviceItems : row.pressureItems;

  if (rowMode === "company") {
    return items;
  }

  return items.slice(0, 5);
}

function sortRows(rows, sortField, sortDirection) {
  return [...rows].sort((left, right) => {
    if (sortField === "label") {
      return compareStrings(left.label, right.label, sortDirection);
    }

    if (sortField === "totalDependency") {
      const numericComparison = compareNumbers(left.totalDependency, right.totalDependency, sortDirection);
      if (numericComparison !== 0) {
        return numericComparison;
      }
      return compareStrings(left.label, right.label, "asc");
    }

    if (sortField === "totalPressure") {
      const numericComparison = compareNumbers(left.totalPressure, right.totalPressure, sortDirection);
      if (numericComparison !== 0) {
        return numericComparison;
      }
      return compareStrings(left.label, right.label, "asc");
    }

    if (sortField === "combinedScore") {
      const numericComparison = compareNumbers(left.combinedScore, right.combinedScore, sortDirection);
      if (numericComparison !== 0) {
        return numericComparison;
      }
      return compareStrings(left.label, right.label, "asc");
    }

    return compareStrings(left.label, right.label, "asc");
  });
}

function normalizeSearchTerm(value) {
  return String(value || "").trim().toLowerCase();
}

function filterCompanyRowsBySearch(rows, searchTerm) {
  if (!searchTerm) {
    return rows;
  }

  return rows.filter((row) => {
    const label = row.searchLabel || String(row.label || "").toLowerCase();
    const secondary = row.searchSecondary || String(row.secondaryLabel || "").toLowerCase();
    return label.includes(searchTerm) || secondary.includes(searchTerm);
  });
}

function prepareSearchIndex(rows) {
  rows.forEach((row) => {
    row.searchLabel = String(row.label || "").toLowerCase();
    row.searchSecondary = String(row.secondaryLabel || "").toLowerCase();
  });
  return rows;
}

function renderChipList(items) {
  if (!items.length) {
    return '<span class="ecosystem-services-summary-empty">—</span>';
  }

  return `<div class="ecosystem-services-summary-chip-list">${items
    .map((item) => {
      const title = item.count > 1
        ? `${item.label} (${item.count.toLocaleString()})`
        : item.label;
      const countMarkup = item.count > 1
        ? `<span class="ecosystem-services-summary-chip-count">${item.count.toLocaleString()}</span>`
        : "";

      return `
        <span class="ecosystem-services-summary-chip" title="${escapeHtml(title)}">
          <span class="ecosystem-services-summary-chip-label">${escapeHtml(item.label)}</span>
          ${countMarkup}
        </span>
      `;
    })
    .join("")}</div>`;
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function formatSummaryItemsForCsv(items) {
  return items
    .map((item) => (item.count > 1 ? `${item.label} (${item.count.toLocaleString()})` : item.label))
    .join("; ");
}

function buildTableCsv(rows, rowMode) {
  const firstColumnLabel = getRowModeLabel(rowMode);
  const headers = [
    firstColumnLabel,
    "Total Dependency Score",
    "Total Pressure Score",
    "Most-depended on Ecosystem Services",
    "Highest Environmental Pressures",
  ];

  const lines = [headers.map(escapeCsvCell).join(",")];
  rows.forEach((row) => {
    const services = formatSummaryItemsForCsv(getSummaryItems(row, rowMode, "services"));
    const pressures = formatSummaryItemsForCsv(getSummaryItems(row, rowMode, "pressures"));
    const values = [
      row.label,
      formatNumber(row.totalDependency, 0),
      formatNumber(row.totalPressure, 0),
      services,
      pressures,
    ];
    lines.push(values.map(escapeCsvCell).join(","));
  });

  return `${lines.join("\n")}\n`;
}

function buildHeaderLabel(label, field, sortField, sortDirection) {
  if (field !== sortField) {
    return label;
  }

  const arrow = sortDirection === "asc" ? "▲" : "▼";
  return `${label} ${arrow}`;
}

function renderTableMarkup(rows, rowMode, sortField, sortDirection) {
  const firstColumnLabel = getRowModeLabel(rowMode);
  const headerLabels = [
    { field: "label", label: firstColumnLabel },
    { field: "totalDependency", label: "Total Dependency Score" },
    { field: "totalPressure", label: "Total Pressure Score" },
    { field: "services", label: "Most-depended on Ecosystem Services" },
    { field: "pressures", label: "Highest Environmental Pressures" },
  ];

  const headerMarkup = headerLabels.map((column) => {
    const ariaSort = column.field === sortField ? (sortDirection === "asc" ? "ascending" : "descending") : "none";
    return `
      <th scope="col" aria-sort="${ariaSort}">
        <button type="button" class="ecosystem-services-summary-sort-button" data-sort-field="${column.field}">
          ${escapeHtml(buildHeaderLabel(column.label, column.field, sortField, sortDirection))}
        </button>
      </th>
    `;
  }).join("");

  const bodyMarkup = rows.length
    ? rows.map((row) => `
        <tr>
          <th scope="row" class="ecosystem-services-summary-row-label">
            <span class="ecosystem-services-summary-row-title">${escapeHtml(row.label)}</span>
            ${row.secondaryLabel ? `<span class="ecosystem-services-summary-row-subtitle">${escapeHtml(row.secondaryLabel)}</span>` : ""}
          </th>
          <td class="ecosystem-services-summary-number">${formatNumber(row.totalDependency, 0)}</td>
          <td class="ecosystem-services-summary-number">${formatNumber(row.totalPressure, 0)}</td>
          <td class="ecosystem-services-summary-chip-cell">${renderChipList(getSummaryItems(row, rowMode, "services"))}</td>
          <td class="ecosystem-services-summary-chip-cell">${renderChipList(getSummaryItems(row, rowMode, "pressures"))}</td>
        </tr>
      `).join("")
    : `
      <tr>
        <td class="ecosystem-services-summary-empty-row" colspan="5">
          No results match the current dashboard filters.
        </td>
      </tr>
    `;

  return `
    <table class="ecosystem-services-summary-table">
      <thead>
        <tr>${headerMarkup}</tr>
      </thead>
      <tbody>${bodyMarkup}</tbody>
    </table>
  `;
}

function createPaginationMarkup(totalRows, currentPage, totalPages, rowMode) {
  if (!totalRows) {
    return `<div class="ecosystem-services-summary-pagination-text">No rows available.</div>`;
  }

  if (rowMode !== "company") {
    return `<div class="ecosystem-services-summary-pagination-text">${totalRows.toLocaleString()} rows</div>`;
  }

  const startIndex = ((currentPage - 1) * PAGE_SIZE) + 1;
  const endIndex = Math.min(totalRows, currentPage * PAGE_SIZE);
  const previousDisabled = currentPage <= 1 ? "disabled" : "";
  const nextDisabled = currentPage >= totalPages ? "disabled" : "";

  return `
    <div class="ecosystem-services-summary-pagination-bar">
      <button type="button" class="ecosystem-services-summary-pagination-button" data-page-step="-1" ${previousDisabled}>Previous</button>
      <div class="ecosystem-services-summary-pagination-text">Showing ${startIndex.toLocaleString()}-${endIndex.toLocaleString()} of ${totalRows.toLocaleString()} companies | Page ${currentPage.toLocaleString()} of ${totalPages.toLocaleString()}</div>
      <button type="button" class="ecosystem-services-summary-pagination-button" data-page-step="1" ${nextDisabled}>Next</button>
    </div>
  `;
}

export function createEcosystemServicesSummaryRankingTableSection() {
  const card = document.createElement("section");
  card.className = "panel ecosystem-services-section ecosystem-services-summary-section";

  const head = document.createElement("div");
  head.className = "panel-head";

  const heading = document.createElement("h3");
  heading.className = "panel-title";
  heading.textContent = "Summary Ranking Table";

  const subheading = document.createElement("p");
  subheading.className = "panel-subtitle";
  subheading.textContent = "Ranked summary of dependency and pressure by company, ISIC section, or coarse category under the active filters.";

  const body = document.createElement("div");
  body.className = "ecosystem-services-slot ecosystem-services-slot--summary ecosystem-services-summary-shell";

  const controls = document.createElement("div");
  controls.className = "ecosystem-services-summary-controls";

  const rowsModeControl = createControlField(
    "Rows represent",
    "ecosystem-services-summary-row-mode",
    ROW_MODE_OPTIONS,
    "company",
  );

  const rankControl = createControlField(
    "Rank by",
    "ecosystem-services-summary-rank-by",
    RANK_OPTIONS,
    "combined",
  );

  const searchControl = createSearchField(
    "Search company",
    "ecosystem-services-summary-company-search",
    "Search companies",
  );

  const laSearchControl = createSearchField(
    "Search local authority",
    "ecosystem-services-summary-la-search",
    "Search local authorities",
  );

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.id = "ecosystem-services-summary-download";
  downloadButton.className = "ecosystem-services-summary-pagination-button";
  downloadButton.textContent = "Download CSV";

  controls.append(rowsModeControl.field, rankControl.field, searchControl.field, laSearchControl.field, downloadButton);

  const status = document.createElement("p");
  status.id = "ecosystem-services-summary-status";
  status.className = "ecosystem-services-summary-status";
  status.textContent = "Loading summary table...";

  const tableWrap = document.createElement("div");
  tableWrap.className = "ecosystem-services-summary-table-wrap";
  tableWrap.id = "ecosystem-services-summary-table-wrap";

  const tableMount = document.createElement("div");
  tableMount.id = "ecosystem-services-summary-table";
  tableMount.className = "ecosystem-services-summary-table-mount";

  tableWrap.append(tableMount);

  const pagination = document.createElement("div");
  pagination.id = "ecosystem-services-summary-pagination";
  pagination.className = "ecosystem-services-summary-pagination";

  body.append(controls, status, tableWrap, pagination);
  head.append(heading, subheading);
  card.append(head, body);

  return card;
}

export function initEcosystemServicesSummaryRankingTable() {
  const tableMount = document.getElementById("ecosystem-services-summary-table");
  const statusElement = document.getElementById("ecosystem-services-summary-status");
  const paginationElement = document.getElementById("ecosystem-services-summary-pagination");
  const rowModeSelect = document.getElementById("ecosystem-services-summary-row-mode");
  const rankSelect = document.getElementById("ecosystem-services-summary-rank-by");
  const companySearchInput = document.getElementById("ecosystem-services-summary-company-search");
  const companySearchField = companySearchInput?.closest("label");
  const laSearchInput = document.getElementById("ecosystem-services-summary-la-search");
  const laSearchField = laSearchInput?.closest("label");
  const downloadButton = document.getElementById("ecosystem-services-summary-download");

  if (!tableMount || !statusElement || !paginationElement || !rowModeSelect || !rankSelect) {
    return;
  }

  let records = [];
  let currentPage = 1;
  let sortField = RANK_FIELD_BY_OPTION[rankSelect.value] || "combinedScore";
  let sortDirection = getDefaultSortDirection(sortField);
  let companySearchTerm = normalizeSearchTerm(companySearchInput?.value);
  let laSearchTerm = normalizeSearchTerm(laSearchInput?.value);
  let renderQueued = false;
  let downloadableRows = [];
  let downloadableRowMode = rowModeSelect.value;
  let lastComputedKey = "";
  let renderedRows = [];
  let renderedRowMode = rowModeSelect.value;
  let renderedTotalRows = 0;
  let renderedTotalPages = 1;

  const syncCompanySearchVisibility = () => {
    if (companySearchField) {
      companySearchField.hidden = rowModeSelect.value !== "company";
    }
    if (laSearchField) {
      laSearchField.hidden = rowModeSelect.value !== "local-authority";
    }
  };

  syncCompanySearchVisibility();

  const setStatus = (text) => {
    statusElement.textContent = text;
  };

  const computeRows = () => {
    const state = getState();
    const rowMode = rowModeSelect.value;
    const filterKey = getSectorFilterKey(state);
    const effectiveSearchTerm = rowMode === "company" ? companySearchTerm : "";
    const effectiveLaSearchTerm = rowMode === "local-authority" ? laSearchTerm : "";
    const computeKey = [
      filterKey,
      rowMode,
      effectiveSearchTerm,
      effectiveLaSearchTerm,
      sortField,
      sortDirection,
      records.length,
    ].join("||");

    if (computeKey === lastComputedKey) {
      return;
    }

    const filteredRecords = filterRecords(records, state);
    const keyField = rowMode === "company"
      ? "companyId"
      : rowMode === "isic"
        ? "isicSection"
        : rowMode === "local-authority"
          ? "localAuthorityCode"
          : "coarseCategory";

    const aggregatedRows = rowMode === "company"
      ? buildCompanyRows(filteredRecords)
      : rowMode === "local-authority"
        ? buildLocalAuthorityRows(filteredRecords)
        : buildItemCounts(filteredRecords, keyField);
    const indexedRows = prepareSearchIndex(aggregatedRows);
    const rowsToSort = rowMode === "company"
      ? filterCompanyRowsBySearch(indexedRows, companySearchTerm)
      : rowMode === "local-authority"
        ? filterCompanyRowsBySearch(indexedRows, laSearchTerm)
        : indexedRows;
    const sortedRows = sortRows(rowsToSort, sortField, sortDirection);

    downloadableRows = sortedRows;
    downloadableRowMode = rowMode;
    renderedRows = sortedRows;
    renderedRowMode = rowMode;
    renderedTotalRows = sortedRows.length;
    renderedTotalPages = rowMode === "company" ? Math.max(1, Math.ceil(renderedTotalRows / PAGE_SIZE)) : 1;
    lastComputedKey = computeKey;
  };

  const renderRows = () => {
    if (renderedRowMode === "company") {
      currentPage = Math.min(currentPage, renderedTotalPages);
    } else {
      currentPage = 1;
    }

    const pageRows = renderedRowMode === "company"
      ? renderedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
      : renderedRows;

    setStatus(`${renderedTotalRows.toLocaleString()} ${getRowModeLabel(renderedRowMode).toLowerCase()} rows available under the current filters.`);
    tableMount.innerHTML = renderTableMarkup(pageRows, renderedRowMode, sortField, sortDirection);
    paginationElement.innerHTML = createPaginationMarkup(renderedTotalRows, currentPage, renderedTotalPages, renderedRowMode);
  };

  const queueRender = () => {
    if (renderQueued) {
      return;
    }

    renderQueued = true;
    window.requestAnimationFrame(() => {
      renderQueued = false;
      computeRows();
      renderRows();
    });
  };

  const syncSortState = (field) => {
    if (field === "label") {
      sortField = "label";
      sortDirection = sortField === field && sortDirection === "asc" ? "desc" : "asc";
      return;
    }

    sortField = field;
    sortDirection = getDefaultSortDirection(field);
    const rankOption = OPTION_BY_RANK_FIELD[field];
    if (rankOption) {
      rankSelect.value = rankOption;
    }
  };

  rowModeSelect.addEventListener("change", () => {
    currentPage = 1;
    lastComputedKey = "";
    syncCompanySearchVisibility();
    queueRender();
  });

  if (companySearchInput) {
    companySearchInput.addEventListener("input", (event) => {
      companySearchTerm = normalizeSearchTerm(event.target.value);
      currentPage = 1;
      lastComputedKey = "";
      queueRender();
    });
  }

  if (laSearchInput) {
    laSearchInput.addEventListener("input", (event) => {
      laSearchTerm = normalizeSearchTerm(event.target.value);
      currentPage = 1;
      lastComputedKey = "";
      queueRender();
    });
  }

  if (downloadButton) {
    downloadButton.addEventListener("click", () => {
      if (!downloadableRows.length) {
        return;
      }

      const csv = buildTableCsv(downloadableRows, downloadableRowMode);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ecosystem-services-summary-${downloadableRowMode}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }

  rankSelect.addEventListener("change", () => {
    const nextField = RANK_FIELD_BY_OPTION[rankSelect.value] || "combinedScore";
    sortField = nextField;
    sortDirection = getDefaultSortDirection(nextField);
    currentPage = 1;
    lastComputedKey = "";
    queueRender();
  });

  tableMount.addEventListener("click", (event) => {
    const sortButton = event.target instanceof Element ? event.target.closest("[data-sort-field]") : null;
    if (sortButton) {
      const nextField = sortButton.getAttribute("data-sort-field") || "combinedScore";
      if (nextField === sortField) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
      } else {
        sortField = nextField;
        sortDirection = getDefaultSortDirection(nextField);
      }

      const rankOption = OPTION_BY_RANK_FIELD[nextField];
      if (rankOption) {
        rankSelect.value = rankOption;
      }

      currentPage = 1;
      lastComputedKey = "";
      queueRender();
      return;
    }
  });

  paginationElement.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-page-step]") : null;
    if (!button) {
      return;
    }

    const pageStep = Number.parseInt(button.getAttribute("data-page-step") || "0", 10);
    if (!Number.isFinite(pageStep) || !pageStep) {
      return;
    }

    currentPage += pageStep;
    queueRender();
  });

  subscribe(() => {
    queueRender();
  });

  Promise.all([
    fetchDashboardDataText("dashboard_scatter_compact.csv", "dashboard scatter compact"),
    fetchDashboardDataText("dashboard_company_compact.csv", "dashboard company compact"),
  ])
    .then(([scatterCsv, compactCsv]) => {
      const top5Map = new Map();
      parseTable(compactCsv).forEach((row) => {
        const cid = normalizeCompanyId(row.company_id);
        if (cid) {
          top5Map.set(cid, {
            services: splitSummaryList(row.top_5_ecosystem_services),
            pressures: splitSummaryList(row.top_5_pressures),
          });
        }
      });
      records = buildRecords(parseTable(scatterCsv), top5Map);
      lastComputedKey = "";
      queueRender();
    })
    .catch((error) => {
      setStatus(`Unable to load summary table data: ${error?.message || error}`);
      tableMount.innerHTML = `
        <div class="ecosystem-services-summary-empty-state">
          <strong>Load Error</strong>
          <span>The summary ranking table could not be initialized.</span>
        </div>
      `;
      paginationElement.innerHTML = "";
    });
}
