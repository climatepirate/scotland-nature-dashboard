import { loadNatureFinanceSharedRows } from "../data/natureFinanceSharedDataset.js?v=3";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatOneDecimal(value) {
  return toNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatOutputBn(value) {
  return `£${formatOneDecimal(value)}bn`;
}

function formatEmployment(value) {
  return `${toNumber(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} FTE`;
}

function formatBusinessCount(value) {
  return toNumber(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatContributingIndustries(row) {
  const industries = Array.isArray(row?.contributingGovernmentIndustries)
    ? row.contributingGovernmentIndustries
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 0)
    : [];

  return industries.length > 0 ? industries.join(", ") : "Not specified";
}

function buildNarrative(row) {
  const base = `This sector is prioritised because it combines relatively high nature vulnerability with substantial economic output. It supports approximately ${toNumber(row.employmentFte).toLocaleString(undefined, { maximumFractionDigits: 0 })} FTE jobs and represents ${formatOutputBn(row.annualOutputBn)} of annual Scottish economic output.`;

  const status = String(row.coverageStatus || "").trim().toLowerCase();
  if (status === "partial" || status === "uncertain") {
    return `${base} Economic statistics represent partial sector coverage and should be interpreted accordingly.`;
  }

  return base;
}

function buildDetailRows(row) {
  const details = [
    ["ISIC Section", formatContributingIndustries(row)],
    ["Business count", formatBusinessCount(row.businessCount)],
    ["Coarse category", String(row.coarseCategory || "Unclassified")],
    ["Economic Exposure Index", formatOneDecimal(row.economicExposureIndex)],
    ["Annual output", formatOutputBn(row.annualOutputBn)],
    ["Normalised vulnerability", formatOneDecimal(row.vulnerabilityNormalised)],
    ["Employment", formatEmployment(row.employmentFte)],
    ["Coverage status", String(row.coverageStatus || "unknown")],
  ];

  return details
    .map(([label, value]) => `
      <div class="nature-finance-priority-detail-row">
        <div class="nature-finance-priority-detail-label">${label}</div>
        <div class="nature-finance-priority-detail-value">${value}</div>
      </div>
    `)
    .join("");
}

export function initNatureFinancePriorityPanel() {
  const detailsRoot = document.getElementById("nature-finance-drivers-bars");
  const chartRoot = document.getElementById("nature-finance-bubble-chart");

  if (detailsRoot === null || chartRoot === null) {
    return;
  }

  loadNatureFinanceSharedRows()
    .then((rows) => {
      if (Array.isArray(rows) === false || rows.length < 1) {
        return;
      }

      const rowsBySectorKey = new Map(rows.map((row) => [String(row.sectorKey || ""), row]));

      const renderSelectedRow = (row) => {
        if (row === undefined || row === null) {
          return;
        }

        detailsRoot.classList.add("is-populated");
        detailsRoot.innerHTML = `<div class="nature-finance-priority-details">${buildDetailRows(row)}</div>`;
      };

      renderSelectedRow(rows[0]);

      chartRoot.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof Element === false) {
          return;
        }

        const bubble = target.closest(".nature-finance-bubble-point");
        if (bubble === null) {
          return;
        }

        const sectorKey = String(bubble.getAttribute("data-sector-key") || "").trim();
        const row = rowsBySectorKey.get(sectorKey);
        if (row === undefined) {
          return;
        }

        renderSelectedRow(row);
      });
    })
    .catch(() => {
      detailsRoot.classList.remove("is-populated");
      detailsRoot.innerHTML = '<div class="nature-finance-empty-state">Unable to load sector narrative.</div>';
    });
}
