import { fetchDashboardDataText } from "../config/dataAssetLoader.js";

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
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
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((value) => value.trim());
  const rows = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index]);
    const row = {};
    headers.forEach((header, headerIndex) => {
      row[header] = (values[headerIndex] || "").trim();
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

export function parseAndMergeCompanyRows(companyMasterCsvText, dashboardMasterCsvText) {
  const companyRows = parseTable(companyMasterCsvText);
  const dashboardRows = parseTable(dashboardMasterCsvText);

  const companyById = new Map();
  companyRows.forEach((row) => {
    const companyId = normalizeCompanyId(row.company_id);
    if (!companyId || companyById.has(companyId)) {
      return;
    }
    companyById.set(companyId, row);
  });

  const mergedRows = [];
  dashboardRows.forEach((row) => {
    const companyId = normalizeCompanyId(row.company_id);
    if (!companyId) {
      return;
    }

    const company = companyById.get(companyId) || {};
    mergedRows.push({
      company_id: companyId,
      company_name: (row.company_name || company.CompanyName || company.company_name || "").trim(),
      local_authority_code: (row.local_authority_code || "").trim(),
      coarse_category: (row.coarse_category || "").trim(),
      first_isic_section: (row.first_isic_section || "").trim(),
      dep_score: (company.dep_score || "").trim(),
      press_score: (company.press_score || "").trim(),
      top_5_ecosystem_services: (row.top_5_ecosystem_services || company.top_5_ecosystem_services || "").trim(),
      top_5_pressures: (row.top_5_pressures || company.top_5_pressures || "").trim(),
    });
  });

  return mergedRows;
}

let mergedRowsPromise = null;

export function loadMergedCompanyRows() {
  if (mergedRowsPromise) {
    return mergedRowsPromise;
  }

  mergedRowsPromise = Promise.all([
    fetchDashboardDataText("company_integrated_profile.csv", "company integrated profile"),
    fetchDashboardDataText("dashboard_master.csv", "dashboard master"),
  ])
    .then(([companyMasterCsv, dashboardMasterCsv]) => parseAndMergeCompanyRows(companyMasterCsv, dashboardMasterCsv))
    .catch((error) => {
      mergedRowsPromise = null;
      throw error;
    });

  return mergedRowsPromise;
}
