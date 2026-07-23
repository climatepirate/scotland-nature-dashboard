import { globalFilterData, loadGlobalFilterData } from "../config/globalFilterData.js";
import { fetchDashboardDataJson } from "../config/dataAssetLoader.js";

const ALL_SCOTLAND = "All Scotland";
const ALL_CATEGORIES = "All Categories";

let statisticsIndexPromise = null;

function isNationalAggregate(localAuthorityCode) {
  return !localAuthorityCode || localAuthorityCode === ALL_SCOTLAND;
}

function isFinitePositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function getRankingMetricCount(bucket, metric) {
  if (metric === "dependency") {
    return bucket?.moderate_high_dependency_count;
  }

  if (metric === "pressure") {
    return bucket?.moderate_high_pressure_count;
  }

  throw new Error(`Unknown ranking metric: ${metric}`);
}

function compareRatioDescending(left, right) {
  const leftScaled = left.numerator * right.denominator;
  const rightScaled = right.numerator * left.denominator;

  if (leftScaled === rightScaled) {
    return 0;
  }

  return rightScaled - leftScaled;
}

function haveEqualRatio(left, right) {
  return left.numerator * right.denominator === right.numerator * left.denominator;
}

function buildLocalAuthorityMetricSummary({
  index,
  metric,
  selectedLocalAuthority,
  selectedCoarseCategory,
  validLocalAuthorityCodes,
}) {
  const coarseCategory = selectedCoarseCategory || ALL_CATEGORIES;
  const rankableEntries = validLocalAuthorityCodes
    .map((localAuthorityCode) => {
      const bucket = index?.buckets?.[getBucketKey(localAuthorityCode, coarseCategory)];
      const denominator = Number(bucket?.company_count);
      const numerator = Number(getRankingMetricCount(bucket, metric));

      if (!isFinitePositiveNumber(denominator) || !Number.isFinite(numerator)) {
        return null;
      }

      return {
        localAuthorityCode,
        numerator,
        denominator,
        percentage: (numerator / denominator) * 100,
      };
    })
    .filter(Boolean);

  if (!rankableEntries.length) {
    return null;
  }

  rankableEntries.sort(compareRatioDescending);

  let currentRank = 0;
  let previousEntry = null;

  rankableEntries.forEach((entry, indexPosition) => {
    if (!previousEntry || !haveEqualRatio(entry, previousEntry)) {
      currentRank = indexPosition + 1;
    }

    entry.rank = currentRank;
    previousEntry = entry;
  });

  const leaderSeed = rankableEntries[0];
  const leaders = leaderSeed
    ? rankableEntries
      .filter((entry) => haveEqualRatio(entry, leaderSeed))
      .map((entry) => ({
        localAuthorityCode: entry.localAuthorityCode,
        localAuthorityLabel: getLocalAuthorityLabel(entry.localAuthorityCode),
      }))
      .sort((left, right) => left.localAuthorityLabel.localeCompare(right.localAuthorityLabel, undefined, { sensitivity: "base" }))
    : [];

  const selectedEntry = isNationalAggregate(selectedLocalAuthority)
    ? null
    : rankableEntries.find((entry) => entry.localAuthorityCode === selectedLocalAuthority);

  return {
    rank: selectedEntry?.rank ?? null,
    totalAuthorities: rankableEntries.length,
    percentage: selectedEntry?.percentage ?? null,
    leaders,
    topPercentage: leaderSeed?.percentage ?? null,
  };
}

export function calculateLocalAuthorityRanking({
  index,
  metric,
  selectedLocalAuthority,
  selectedCoarseCategory,
  validLocalAuthorityCodes,
}) {
  return buildLocalAuthorityMetricSummary({
    index,
    metric,
    selectedLocalAuthority,
    selectedCoarseCategory,
    validLocalAuthorityCodes,
  });
}

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
    dependencyRanking: null,
    pressureRanking: null,
    mostDependedService: "No data",
    mostDependedServiceCount: 0,
    categorySegments,
  };
}

export async function loadStatisticsIndex() {
  if (!statisticsIndexPromise) {
    statisticsIndexPromise = fetchDashboardDataJson("dashboard_statistics_panel.json", "dashboard statistics index");
  }

  return statisticsIndexPromise;
}

export async function getStatisticsSnapshot(state) {
  const [index] = await Promise.all([
    loadStatisticsIndex(),
    loadGlobalFilterData(),
  ]);

  const validLocalAuthorityCodes = globalFilterData.localAuthorities
    .map((authority) => authority.code)
    .filter(Boolean);

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

  const dependencyRanking = calculateLocalAuthorityRanking({
    index,
    metric: "dependency",
    selectedLocalAuthority: state.localAuthorityCode,
    selectedCoarseCategory: state.coarseCategory,
    validLocalAuthorityCodes,
  });

  const pressureRanking = calculateLocalAuthorityRanking({
    index,
    metric: "pressure",
    selectedLocalAuthority: state.localAuthorityCode,
    selectedCoarseCategory: state.coarseCategory,
    validLocalAuthorityCodes,
  });

  return {
    locationLabel: getLocalAuthorityLabel(state.localAuthorityCode),
    businessesIncluded,
    moderateHighDependencyPercent: businessesIncluded > 0 ? (moderateHighDependencyCount / businessesIncluded) * 100 : 0,
    moderateHighPressurePercent: businessesIncluded > 0 ? (moderateHighPressureCount / businessesIncluded) * 100 : 0,
    dependencyRanking,
    pressureRanking,
    mostDependedService: topService,
    mostDependedServiceCount: topServiceCount,
    categorySegments,
  };
}
