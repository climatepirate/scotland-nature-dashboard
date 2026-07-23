import { fetchDashboardDataText } from "../config/dataAssetLoader.js";
import { getState, subscribe } from "../state/state.js";

const ALL_SCOTLAND = "All Scotland";
const ALL_CATEGORIES = "All Categories";
const ALL_ISIC = "All ISIC Sections";
const PAGE_SIZE = 20;

const ROW_MODE_OPTIONS = [
  { value: "company", label: "Company" },
  { value: "isic", label: "ISIC Section" },
  { value: "coarse", label: "Coarse Category" },
];

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

function buildRecords(dashboardRows, profileRows) {
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
      companyId,
      companyName: (row.CompanyName || row.company_name || "").trim(),
      dep,
      press,
      services: splitSummaryList(row.top_5_ecosystem_services),
      pressures: splitSummaryList(row.top_5_pressures),
      profileCoarseCategory: (row["Coarse Category"] || row.coarse_category || "Unclassified").trim(),
    });
  });

  const records = [];
  dashboardRows.forEach((row) => {
    if (String(row.scorable_flag || "").toLowerCase() !== "true") {
      return;
    }

    const companyId = normalizeCompanyId(row.company_id);
    const profile = profileByCompanyId.get(companyId);
    if (!profile) {
      return;
    }

    const coarseCategory = (row.coarse_category || row["Coarse Category"] || profile.profileCoarseCategory || "Unclassified").trim();
    const isicSection = (row.first_isic_section || "").trim();
    const localAuthorityCode = (row.local_authority_code || "").trim();

    if (!coarseCategory || coarseCategory === "Dormant Company" || !isicSection || !localAuthorityCode) {
      return;
    }

    records.push({
      companyId,
      companyName: profile.companyName || companyId,
      coarseCategory,
      isicSection,
      localAuthorityCode,
      totalDependency: profile.dep,
      totalPressure: profile.press,
      services: profile.services,
      pressures: profile.pressures,
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
      ? ([...bucket.labels][0] && [...bucket.labels][0] !== bucket.key ? bucket.key : "")
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

function filterRecords(records, state) {
  return records.filter((record) => {
    if (state.localAuthorityCode !== ALL_SCOTLAND && record.localAuthorityCode !== state.localAuthorityCode) {
      return false;
    }

    if (state.coarseCategory !== ALL_CATEGORIES && record.coarseCategory !== state.coarseCategory) {
      return false;
    }

    if (state.isicSection !== ALL_ISIC && record.isicSection !== state.isicSection) {
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
    const label = String(row.label || "").toLowerCase();
    const secondary = String(row.secondaryLabel || "").toLowerCase();
    return label.includes(searchTerm) || secondary.includes(searchTerm);
  });
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
    { field: "services", label: "Highest Ecosystem Services" },
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
            <span class="ecosystem-services-summary-row-subtitle">${escapeHtml(row.secondaryLabel)}</span>
          </th>
          <td class="ecosystem-services-summary-number">${formatNumber(row.totalDependency, 2)}</td>
          <td class="ecosystem-services-summary-number">${formatNumber(row.totalPressure, 2)}</td>
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
      <div class="ecosystem-services-summary-pagination-text">Showing ${startIndex.toLocaleString()}-${endIndex.toLocaleString()} of ${totalRows.toLocaleString()} companies</div>
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

  controls.append(rowsModeControl.field, rankControl.field, searchControl.field);

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

  if (!tableMount || !statusElement || !paginationElement || !rowModeSelect || !rankSelect) {
    return;
  }

  let records = [];
  let currentPage = 1;
  let sortField = RANK_FIELD_BY_OPTION[rankSelect.value] || "combinedScore";
  let sortDirection = getDefaultSortDirection(sortField);
  let companySearchTerm = normalizeSearchTerm(companySearchInput?.value);
  let renderQueued = false;

  const syncCompanySearchVisibility = () => {
    if (!companySearchField) {
      return;
    }
    companySearchField.hidden = rowModeSelect.value !== "company";
  };

  syncCompanySearchVisibility();

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
      const rowMode = rowModeSelect.value;
      const filteredRecords = filterRecords(records, state);
      const keyField = rowMode === "company"
        ? "companyId"
        : rowMode === "isic"
          ? "isicSection"
          : "coarseCategory";

      const aggregatedRows = buildItemCounts(filteredRecords, keyField);
      const rowsToSort = rowMode === "company"
        ? filterCompanyRowsBySearch(aggregatedRows, companySearchTerm)
        : aggregatedRows;
      const sortedRows = sortRows(rowsToSort, sortField, sortDirection);
      const totalRows = sortedRows.length;
      const totalPages = rowMode === "company" ? Math.max(1, Math.ceil(totalRows / PAGE_SIZE)) : 1;

      if (rowMode === "company") {
        currentPage = Math.min(currentPage, totalPages);
      } else {
        currentPage = 1;
      }

      const pageRows = rowMode === "company"
        ? sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
        : sortedRows;

      setStatus(`${totalRows.toLocaleString()} ${getRowModeLabel(rowMode).toLowerCase()} rows available under the current filters.`);
      tableMount.innerHTML = renderTableMarkup(pageRows, rowMode, sortField, sortDirection);
      paginationElement.innerHTML = createPaginationMarkup(totalRows, currentPage, totalPages, rowMode);
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
    syncCompanySearchVisibility();
    queueRender();
  });

  if (companySearchInput) {
    companySearchInput.addEventListener("input", (event) => {
      companySearchTerm = normalizeSearchTerm(event.target.value);
      currentPage = 1;
      queueRender();
    });
  }

  rankSelect.addEventListener("change", () => {
    const nextField = RANK_FIELD_BY_OPTION[rankSelect.value] || "combinedScore";
    sortField = nextField;
    sortDirection = getDefaultSortDirection(nextField);
    currentPage = 1;
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
      records = buildRecords(dashboardRows, profileRows);
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
