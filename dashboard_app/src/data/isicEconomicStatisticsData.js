import { fetchDashboardDataJson } from "../config/dataAssetLoader.js";

let joinedDatasetPromise = null;

export async function loadIsicEconomicStatisticsJoinedDataset() {
  if (!joinedDatasetPromise) {
    joinedDatasetPromise = fetchDashboardDataJson(
      "isic_economic_statistics.joined.json",
      "joined ISIC economic statistics"
    );
  }

  return joinedDatasetPromise;
}

export async function loadIsicEconomicStatisticsRows() {
  const payload = await loadIsicEconomicStatisticsJoinedDataset();
  return Array.isArray(payload?.rows) ? payload.rows : [];
}

export async function loadIsicEconomicStatisticsValidation() {
  const payload = await loadIsicEconomicStatisticsJoinedDataset();
  return payload?.validation || {
    matchedIsicSections: 0,
    unavailableIsicSections: 0,
    duplicateSourceIndustryLabels: [],
    duplicateMappingPairs: [],
    failedJoins: [],
  };
}
