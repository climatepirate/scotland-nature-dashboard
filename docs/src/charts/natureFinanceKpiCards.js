import { loadNatureFinanceSharedRows } from "../data/natureFinanceSharedDataset.js";

function toFinite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatOneDecimal(value) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatOutputBn(value) {
  return `£${formatOneDecimal(value)} bn`;
}

function formatEmployment(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

export function initNatureFinanceKpiCards() {
  const priorityValueEl = document.getElementById("nature-finance-kpi-priority-sector");
  const priorityDetailEl = document.getElementById("nature-finance-kpi-priority-sector-detail");
  const outputValueEl = document.getElementById("nature-finance-kpi-output");
  const outputDetailEl = document.getElementById("nature-finance-kpi-output-detail");
  const employmentValueEl = document.getElementById("nature-finance-kpi-employment");
  const employmentDetailEl = document.getElementById("nature-finance-kpi-employment-detail");

  if (
    !priorityValueEl
    || !priorityDetailEl
    || !outputValueEl
    || !outputDetailEl
    || !employmentValueEl
    || !employmentDetailEl
  ) {
    return;
  }

  loadNatureFinanceSharedRows()
    .then((rows) => {
      if (!Array.isArray(rows) || !rows.length) {
        priorityValueEl.textContent = "No data";
        priorityDetailEl.textContent = "Highest combined economic output and nature vulnerability";
        outputValueEl.textContent = "£0.0 bn";
        outputDetailEl.textContent = "Scottish annual output represented";
        employmentValueEl.textContent = "0";
        employmentDetailEl.textContent = "Full-time equivalent employment represented";
        return;
      }

      const highestPriority = rows.reduce((best, row) => {
        if (!best) {
          return row;
        }
        return toFinite(row.economicExposureIndex) > toFinite(best.economicExposureIndex)
          ? row
          : best;
      }, null);

      const totalAnnualOutputBn = rows.reduce(
        (sum, row) => sum + toFinite(row.annualOutputBn),
        0
      );

      const totalEmploymentFte = rows.reduce(
        (sum, row) => sum + toFinite(row.employmentFte),
        0
      );

      const topSectorName = String(highestPriority?.sectorLabel || "No data").trim();
      const topSectorIndex = formatOneDecimal(toFinite(highestPriority?.economicExposureIndex));

      priorityValueEl.textContent = topSectorName;
      priorityDetailEl.textContent = `Economic Exposure Index: ${topSectorIndex} | Highest combined economic output and nature vulnerability`;

      outputValueEl.textContent = formatOutputBn(totalAnnualOutputBn);
      outputDetailEl.textContent = "Scottish annual output represented";

      employmentValueEl.textContent = formatEmployment(totalEmploymentFte);
      employmentDetailEl.textContent = "Full-time equivalent employment represented";
    })
    .catch((error) => {
      const message = error?.message || String(error);
      priorityValueEl.textContent = "Unavailable";
      priorityDetailEl.textContent = message;
      outputValueEl.textContent = "Unavailable";
      outputDetailEl.textContent = message;
      employmentValueEl.textContent = "Unavailable";
      employmentDetailEl.textContent = message;
    });
}
