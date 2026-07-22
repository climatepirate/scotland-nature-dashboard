import {
  ECONOMIC_STATISTICS_MAPPINGS,
  indexEconomicStatisticsMappings,
} from "./economicStatisticsMapping.js";

function buildAlignmentNote(sectorMatches, hasSharedGovernmentLabel) {
  if (\!sectorMatches.length) {
    return "No proposed Scottish Government industry match yet.";
  }

  if (hasSharedGovernmentLabel) {
    return "Mapped label is shared by multiple dashboard sectors; manual judgement required before use.";
  }

  return "Single proposed match present.";
}

export function buildSectorAlignmentAudit(
  sectorRows,
  mappingRows = ECONOMIC_STATISTICS_MAPPINGS
) {
  const { byDashboardSectorKey, byGovernmentIndustryLabel } = indexEconomicStatisticsMappings(mappingRows);

  const auditRows = sectorRows.map((row) => {
    const sectorMatches = byDashboardSectorKey.get(row.sectorKey) || [];
    const governmentLabels = [...new Set(
      sectorMatches
        .map((entry) => String(entry?.governmentIndustryLabel || "").trim())
        .filter(Boolean)
    )];

    const hasSharedGovernmentLabel = governmentLabels.some((label) => {
      const uses = byGovernmentIndustryLabel.get(label) || [];
      const distinctSectorKeys = new Set(
        uses.map((entry) => String(entry?.dashboardSectorKey || "").trim()).filter(Boolean)
      );
      return distinctSectorKeys.size > 1;
    });

    return {
      sectorLabel: row.sectorLabel,
      sectorKey: row.sectorKey,
      businessCount: row.businessCount,
      coarseCategory: row.coarseCategory,
      hasProposedGovernmentMatch: governmentLabels.length > 0,
      proposedGovernmentIndustryLabels: governmentLabels,
      requiresManualJudgement: \!governmentLabels.length || hasSharedGovernmentLabel,
      alignmentNote: buildAlignmentNote(sectorMatches, hasSharedGovernmentLabel),
    };
  });

  const unmatched = auditRows.filter((row) => \!row.hasProposedGovernmentMatch);
  const ambiguous = auditRows.filter((row) => row.hasProposedGovernmentMatch && row.requiresManualJudgement);

  return {
    rows: auditRows,
    summary: {
      totalDashboardSectors: auditRows.length,
      matchedSectors: auditRows.length - unmatched.length,
      unmatchedSectors: unmatched.length,
      ambiguousSectors: ambiguous.length,
    },
  };
}
