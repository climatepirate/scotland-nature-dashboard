export const DEFAULT_ECONOMIC_EXPOSURE_WEIGHTS = {
  vulnerability: 0.5,
  output: 0.5,
};

function toFiniteNumber(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWeights(weights = DEFAULT_ECONOMIC_EXPOSURE_WEIGHTS) {
  const vulnerability = toFiniteNumber(weights.vulnerability);
  const output = toFiniteNumber(weights.output);

  if (vulnerability === null || output === null || vulnerability < 0 || output < 0) {
    throw new Error("Economic Exposure weights must be non-negative finite numbers.");
  }

  const total = vulnerability + output;
  if (total <= 0) {
    throw new Error("Economic Exposure weights must sum to a value greater than zero.");
  }

  return {
    vulnerability: vulnerability / total,
    output: output / total,
  };
}

function normalizeMinMaxToHundred(value, min, max) {
  const safeValue = toFiniteNumber(value);
  if (safeValue === null) {
    return null;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 0;
  }

  return ((safeValue - min) / (max - min)) * 100;
}

function buildAnnualOutputMap(annualOutputSource, sectorKey, annualOutputKey) {
  const outputMap = new Map();

  if (Array.isArray(annualOutputSource)) {
    annualOutputSource.forEach((row) => {
      const sector = String(row?.[sectorKey] ?? "").trim();
      if (!sector) {
        return;
      }

      const annualOutput = toFiniteNumber(row?.[annualOutputKey]);
      if (annualOutput === null) {
        return;
      }

      outputMap.set(sector, annualOutput);
    });
    return outputMap;
  }

  if (annualOutputSource && typeof annualOutputSource === "object") {
    Object.entries(annualOutputSource).forEach(([sector, rawAnnualOutput]) => {
      const normalizedSector = String(sector || "").trim();
      if (!normalizedSector) {
        return;
      }

      const annualOutput = toFiniteNumber(rawAnnualOutput);
      if (annualOutput === null) {
        return;
      }

      outputMap.set(normalizedSector, annualOutput);
    });
  }

  return outputMap;
}

export function calculateEconomicExposureIndex(
  vulnerabilityRows,
  annualOutputSource,
  options = {}
) {
  if (!Array.isArray(vulnerabilityRows)) {
    throw new Error("vulnerabilityRows must be an array.");
  }

  const {
    sectorKey = "sector",
    vulnerabilityKey = "vulnerability",
    annualOutputKey = "annualOutput",
    weights = DEFAULT_ECONOMIC_EXPOSURE_WEIGHTS,
  } = options;

  const resolvedWeights = normalizeWeights(weights);
  const annualOutputMap = buildAnnualOutputMap(annualOutputSource, sectorKey, annualOutputKey);

  const mergedRows = vulnerabilityRows
    .map((row) => {
      const sector = String(row?.[sectorKey] ?? "").trim();
      if (!sector) {
        return null;
      }

      const vulnerability = toFiniteNumber(row?.[vulnerabilityKey]);
      const annualOutput = annualOutputMap.get(sector);

      if (vulnerability === null || !Number.isFinite(annualOutput)) {
        return null;
      }

      return {
        sector,
        vulnerability,
        annualOutput,
      };
    })
    .filter(Boolean);

  const vulnerabilityValues = mergedRows.map((row) => row.vulnerability);
  const outputValues = mergedRows.map((row) => row.annualOutput);

  const vulnerabilityMin = Math.min(...vulnerabilityValues);
  const vulnerabilityMax = Math.max(...vulnerabilityValues);
  const outputMin = Math.min(...outputValues);
  const outputMax = Math.max(...outputValues);

  return mergedRows.map((row) => {
    const vulnerabilityNormalised = normalizeMinMaxToHundred(
      row.vulnerability,
      vulnerabilityMin,
      vulnerabilityMax
    );
    const outputNormalised = normalizeMinMaxToHundred(
      row.annualOutput,
      outputMin,
      outputMax
    );

    const economicExposureIndex =
      (resolvedWeights.vulnerability * vulnerabilityNormalised)
      + (resolvedWeights.output * outputNormalised);

    return {
      sector: row.sector,
      vulnerability: row.vulnerability,
      annualOutput: row.annualOutput,
      vulnerabilityNormalised,
      outputNormalised,
      economicExposureIndex,
    };
  });
}
