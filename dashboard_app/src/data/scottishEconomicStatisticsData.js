import { fetchDashboardDataJson } from "../config/dataAssetLoader.js";

let statisticsPromise = null;

export async function loadScottishEconomicStatisticsData() {
  if (\!statisticsPromise) {
    statisticsPromise = fetchDashboardDataJson(
      "scottish_economic_statistics.validated.json",
      "Scottish economic statistics"
    );
  }

  return statisticsPromise;
}

export async function loadScottishEconomicStatisticsRows() {
  const payload = await loadScottishEconomicStatisticsData();
  return Array.isArray(payload?.rows) ? payload.rows : [];
}

export async function loadScottishEconomicStatisticsValidationSummary() {
  const payload = await loadScottishEconomicStatisticsData();
  return payload?.validation || {
    rowsLoaded: 0,
    duplicateIndustryLabels: [],
    missingOutputValues: [],
    missingEmploymentValues: [],
    invalidNumericValues: [],
  };
}
