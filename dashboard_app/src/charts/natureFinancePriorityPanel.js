import { loadNatureFinanceSharedRows } from "../data/natureFinanceSharedDataset.js";

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
    ["Coarse category", String(row.coarseCategory || "Unclassified")],
    ["Economic Exposure Index", formatOneDecimal(row.economicExposureIndex)],
    ["Annual output", formatOutputBn(row.annualOutputBn)],
    ["Employment", formatEmployment(row.employmentFte)],
    ["Normalised vulnerability", formatOneDecimal(row.vulnerabilityNormalised)],
    ["Business count", formatBusinessCount(row.businessCount)],
    ["Coverage status", String(row.coverageStatus || "unknown")],
    ["Contributing government industries", formatContributingIndustries(row)],
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
  const emptyState = document.getElementById("nature-finance-selection-empty");
  const sectorNameEl = document.getElementById("nature-finance-selected-sector-name");
  const priorityScoreEl = document.getElementById("nature-finance-priority-score");
  const explainerEl = document.getElementById("nature-finance-priority-explainer");
  const detailsRoot = document.getElementById("nature-finance-drivers-bars");
  const chartRoot = document.getElementById("nature-finance-bubble-chart");

  if (
    emptyState === null
    || sectorNameEl === null
    || priorityScoreEl === null
    || explainerEl === null
    || detailsRoot === null
    || chartRoot === null
  ) {
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

        emptyState.style.display = "none";
        sectorNameEl.textContent = String(row.sectorLabel || "");
        priorityScoreEl.textContent = String(row.coarseCategory || "Unclassified");
        explainerEl.textContent = buildNarrative(row);
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
