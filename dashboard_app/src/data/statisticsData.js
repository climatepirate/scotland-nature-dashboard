import { globalFilterData, loadGlobalFilterData } from "../config/globalFilterData.js";

const DATA_URL = new URL("../../../Data/dashboard_statistics_panel.json", import.meta.url);
const ALL_SCOTLAND = "All Scotland";
const ALL_CATEGORIES = "All Categories";

let statisticsIndexPromise = null;

function getBucketKey(localAuthorityCode, coarseCategory) {
  return `${localAuthorityCode || ALL_SCOTLAND}||${coarseCategory || ALL_CATEGORIES}`;
}

function getLocalAuthorityLabel(localAuthorityCode) {
  if (!localAuthorityCode || localAuthorityCode === ALL_SCOTLAND) {
    return ALL_SCOTLAND;
  }

  const match = globalFilterData.localAuthorities.find((authority) => authority.code === localAuthorityCode);
  return match ? match.name : localAuthorityCode;
}

function getEmptySnapshot(state) {
  const categorySegments = globalFilterData.coarseCategories.map((category) => ({
    category,
    count: 0,
    share: 0,
  }));

  return {
    locationLabel: getLocalAuthorityLabel(state.localAuthorityCode),
    businessesIncluded: 0,
    moderateHighDependencyPercent: 0,
    moderateHighPressurePercent: 0,
    mostDependedService: "No data",
    mostDependedServiceCount: 0,
    categorySegments,
  };
}

export async function loadStatisticsIndex() {
  if (!statisticsIndexPromise) {
    statisticsIndexPromise = fetch(DATA_URL).then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load dashboard statistics index: ${response.status}`);
      }

      return response.json();
    });
  }

  return statisticsIndexPromise;
}

export async function getStatisticsSnapshot(state) {
  const [index] = await Promise.all([
    loadStatisticsIndex(),
    loadGlobalFilterData(),
  ]);

  const bucket = index.buckets[getBucketKey(state.localAuthorityCode, state.coarseCategory)]
    || index.buckets[getBucketKey(ALL_SCOTLAND, ALL_CATEGORIES)];

  if (!bucket) {
    return getEmptySnapshot(state);
  }

  const businessesIncluded = bucket.company_count || 0;
  const moderateHighDependencyCount = bucket.moderate_high_dependency_count || 0;
  const moderateHighPressureCount = bucket.moderate_high_pressure_count || 0;
  const serviceEntries = Object.entries(bucket.service_counts || {});
  const topServiceEntry = serviceEntries.sort((left, right) => right[1] - left[1])[0] || [];
  const topService = topServiceEntry[0] || "No data";
  const topServiceCount = topServiceEntry[1] || 0;

  const categorySegments = globalFilterData.coarseCategories.map((category) => {
    const count = bucket.category_counts?.[category] || 0;
    return {
      category,
      count,
      share: businessesIncluded > 0 ? (count / businessesIncluded) * 100 : 0,
    };
  });

  return {
    locationLabel: getLocalAuthorityLabel(state.localAuthorityCode),
    businessesIncluded,
    moderateHighDependencyPercent: businessesIncluded > 0 ? (moderateHighDependencyCount / businessesIncluded) * 100 : 0,
    moderateHighPressurePercent: businessesIncluded > 0 ? (moderateHighPressureCount / businessesIncluded) * 100 : 0,
    mostDependedService: topService,
    mostDependedServiceCount: topServiceCount,
    categorySegments,
  };
}
