import {
  DEFAULT_ECONOMIC_EXPOSURE_WEIGHTS,
  calculateEconomicExposureIndex,
} from "../charts/economicExposureIndex.js";
import { loadSectorVulnerabilityRows } from "../charts/sectorVulnerabilityAdapter.js";
import { loadIsicEconomicStatisticsRows } from "./isicEconomicStatisticsData.js";

let sharedDatasetPromise = null;

function detectDuplicateKeys(rows, keyField) {
  const counts = new Map();

  rows.forEach((row) => {
    const key = String(row?.[keyField] || "").trim();
    if (!key) {
      return;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .filter((entry) => entry[1] > 1)
    .map((entry) => ({ key: entry[0], count: entry[1] }));
}

function buildNatureFinanceSharedRows(vulnerabilityRows, economicRows) {
  const availableEconomicRows = economicRows.filter(
    (row) => row && row.coverageStatus !== "unavailable"
  );

  const duplicateVulnerabilityKeys = detectDuplicateKeys(vulnerabilityRows, "sectorKey");
  const duplicateEconomicKeys = detectDuplicateKeys(availableEconomicRows, "sectorKey");

  const vulnerabilityBySectorKey = new Map(
    vulnerabilityRows.map((row) => [row.sectorKey, row])
  );

  const failedJoins = [];
  const joinedRows = [];

  availableEconomicRows.forEach((economicRow) => {
    const sectorKey = String(economicRow?.sectorKey || "").trim();
    if (!sectorKey) {
      failedJoins.push({
        sectorKey: "",
        isicSection: String(economicRow?.isicSection || "").trim(),
        reason: "economic row missing sectorKey",
      });
      return;
    }

    const vulnerabilityRow = vulnerabilityBySectorKey.get(sectorKey);
    if (!vulnerabilityRow) {
      failedJoins.push({
        sectorKey,
        isicSection: String(economicRow?.isicSection || "").trim(),
        reason: "missing vulnerability row for matched economic sector",
      });
      return;
    }

    joinedRows.push({
      sectorKey,
      sectorLabel: String(economicRow?.isicSection || vulnerabilityRow?.sectorLabel || "").trim(),
      coarseCategory: String(vulnerabilityRow?.coarseCategory || "").trim(),
      vulnerability: vulnerabilityRow?.vulnerability,
      annualOutputBn: economicRow?.annualOutputBn,
      employmentFte: economicRow?.employmentFte,
      businessCount: vulnerabilityRow?.businessCount,
      coverageStatus: String(economicRow?.coverageStatus || "").trim(),
      coverageNote: String(economicRow?.coverageNote || "").trim(),
      contributingGovernmentIndustries: Array.isArray(economicRow?.contributingGovernmentIndustries)
        ? [...economicRow.contributingGovernmentIndustries]
        : [],
    });
  });

  const indexRows = calculateEconomicExposureIndex(joinedRows, joinedRows, {
    sectorKey: "sectorKey",
    vulnerabilityKey: "vulnerability",
    annualOutputKey: "annualOutputBn",
    weights: DEFAULT_ECONOMIC_EXPOSURE_WEIGHTS,
  });

  const indexBySectorKey = new Map(indexRows.map((row) => [row.sector, row]));

  const finalRows = joinedRows
    .map((row) => {
      const indexRow = indexBySectorKey.get(row.sectorKey);
      if (!indexRow) {
        failedJoins.push({
          sectorKey: row.sectorKey,
          isicSection: row.sectorLabel,
          reason: "sector excluded by economic exposure index calculation",
        });
        return null;
      }

      return {
        sectorKey: row.sectorKey,
        sectorLabel: row.sectorLabel,
        coarseCategory: row.coarseCategory,
        vulnerability: row.vulnerability,
        annualOutputBn: row.annualOutputBn,
        employmentFte: row.employmentFte,
        businessCount: row.businessCount,
        coverageStatus: row.coverageStatus,
        coverageNote: row.coverageNote,
        contributingGovernmentIndustries: row.contributingGovernmentIndustries,
        vulnerabilityNormalised: indexRow.vulnerabilityNormalised,
        outputNormalised: indexRow.outputNormalised,
        economicExposureIndex: indexRow.economicExposureIndex,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.economicExposureIndex - a.economicExposureIndex);

  return {
    rows: finalRows,
    validation: {
      expectedMatchedEconomicRows: availableEconomicRows.length,
      producedRows: finalRows.length,
      duplicateVulnerabilityKeys,
      duplicateEconomicKeys,
      failedJoins,
      usedMetric: "combined",
      indexWeights: DEFAULT_ECONOMIC_EXPOSURE_WEIGHTS,
    },
  };
}

export async function loadNatureFinanceSharedDataset() {
  if (!sharedDatasetPromise) {
    sharedDatasetPromise = Promise.all([
      loadSectorVulnerabilityRows({ metricKey: "combined" }),
      loadIsicEconomicStatisticsRows(),
    ]).then(([vulnerabilityRows, economicRows]) => (
      buildNatureFinanceSharedRows(vulnerabilityRows, economicRows)
    ));
  }

  return sharedDatasetPromise;
}

export async function loadNatureFinanceSharedRows() {
  const payload = await loadNatureFinanceSharedDataset();
  return payload.rows;
}

export async function loadNatureFinanceSharedValidation() {
  const payload = await loadNatureFinanceSharedDataset();
  return payload.validation;
}
