export const ECONOMIC_STATISTICS_MAPPING_SCHEMA = {
  governmentIndustryLabel: "string",
  dashboardSectorKey: "string",
  dashboardSectorLabel: "string",
  annualOutputBn: "number|null",
  employmentFte: "number|null",
  irreplaceableNaturalCapitalShare: "number|null",
  sourceYear: "number|string|null",
  sourceNote: "string|null",
};

// Schema-only placeholder. Populate this deliberately once official industry mappings are agreed.
export const ECONOMIC_STATISTICS_MAPPINGS = [];

export function indexEconomicStatisticsMappings(mappingRows = ECONOMIC_STATISTICS_MAPPINGS) {
  const byDashboardSectorKey = new Map();
  const byGovernmentIndustryLabel = new Map();

  mappingRows.forEach((row) => {
    const dashboardSectorKey = String(row?.dashboardSectorKey || "").trim();
    const governmentIndustryLabel = String(row?.governmentIndustryLabel || "").trim();

    if (dashboardSectorKey) {
      if (\!byDashboardSectorKey.has(dashboardSectorKey)) {
        byDashboardSectorKey.set(dashboardSectorKey, []);
      }
      byDashboardSectorKey.get(dashboardSectorKey).push(row);
    }

    if (governmentIndustryLabel) {
      if (\!byGovernmentIndustryLabel.has(governmentIndustryLabel)) {
        byGovernmentIndustryLabel.set(governmentIndustryLabel, []);
      }
      byGovernmentIndustryLabel.get(governmentIndustryLabel).push(row);
    }
  });

  return {
    byDashboardSectorKey,
    byGovernmentIndustryLabel,
  };
}
