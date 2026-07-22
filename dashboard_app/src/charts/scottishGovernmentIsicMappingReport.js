function unique(values) {
  return [...new Set(values)];
}

export function buildScottishGovernmentIsicMappingReport({
  mappingRows,
  governmentIndustryRows,
  dashboardIsicSections,
}) {
  const mappings = Array.isArray(mappingRows) ? mappingRows : [];
  const industries = Array.isArray(governmentIndustryRows) ? governmentIndustryRows : [];
  const isicSections = Array.isArray(dashboardIsicSections) ? dashboardIsicSections : [];

  const industryLabels = industries
    .map((row) => String(row?.governmentIndustryLabel || "").trim())
    .filter(Boolean);

  const mappingByIndustry = new Map();
  mappings.forEach((row) => {
    const industry = String(row?.governmentIndustryLabel || "").trim();
    if (\!industry) {
      return;
    }
    if (\!mappingByIndustry.has(industry)) {
      mappingByIndustry.set(industry, []);
    }
    mappingByIndustry.get(industry).push(row);
  });

  const directMatches = [];
  const oneToManyMatches = [];

  mappingByIndustry.forEach((rows, industry) => {
    const nonExcluded = rows.filter((row) => row.mappingType \!== "excluded");
    const mappedIsicSections = unique(
      nonExcluded
        .map((row) => String(row?.isicSection || "").trim())
        .filter(Boolean)
    );

    if (mappedIsicSections.length > 1 || rows.some((row) => row.mappingType === "one_to_many")) {
      oneToManyMatches.push({
        governmentIndustryLabel: industry,
        isicSections: mappedIsicSections,
        mappingTypes: unique(rows.map((row) => row.mappingType)),
      });
      return;
    }

    if (mappedIsicSections.length === 1 && rows.every((row) => row.mappingType === "direct" || row.mappingType === "many_to_one")) {
      directMatches.push({
        governmentIndustryLabel: industry,
        isicSection: mappedIsicSections[0],
        mappingTypes: unique(rows.map((row) => row.mappingType)),
      });
    }
  });

  const unmatchedIndustries = industryLabels.filter((industry) => \!mappingByIndustry.has(industry));

  const mappedIsicSet = new Set(
    mappings
      .filter((row) => row.mappingType \!== "excluded")
      .map((row) => String(row?.isicSection || "").trim())
      .filter(Boolean)
  );

  const isicSectionsWithNoEconomicStatistics = isicSections
    .filter((section) => \!mappedIsicSet.has(String(section || "").trim()))
    .sort((a, b) => a.localeCompare(b));

  return {
    directMatches: directMatches.sort((a, b) => a.governmentIndustryLabel.localeCompare(b.governmentIndustryLabel)),
    oneToManyMatches: oneToManyMatches.sort((a, b) => a.governmentIndustryLabel.localeCompare(b.governmentIndustryLabel)),
    unmatchedIndustries,
    isicSectionsWithNoEconomicStatistics,
  };
}
