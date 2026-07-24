import { loadNatureFinanceSharedRows } from "../data/natureFinanceSharedDataset.js";

function toFinite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatOneDecimal(value) {
  return toFinite(value).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatOutputBn(value) {
  return `£${formatOneDecimal(value)} bn`;
}

function formatInteger(value) {
  return toFinite(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function toCoverageLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "full") {
    return "Full";
  }
  if (normalized === "partial") {
    return "Partial";
  }
  return "Uncertain";
}

function toCoverageClass(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "full") {
    return "full";
  }
  if (normalized === "partial") {
    return "partial";
  }
  return "uncertain";
}

function setSelectedRow(tableBody, sectorKey) {
  tableBody.querySelectorAll("tr.nature-finance-priority-row.is-selected").forEach((row) => {
    row.classList.remove("is-selected");
    row.setAttribute("aria-selected", "false");
  });

  const selectedRow = tableBody.querySelector(`tr.nature-finance-priority-row[data-sector-key="${sectorKey}"]`);
  if (selectedRow) {
    selectedRow.classList.add("is-selected");
    selectedRow.setAttribute("aria-selected", "true");
  }
}

function setSelectedBubble(chartRoot, sectorKey) {
  chartRoot.querySelectorAll(".nature-finance-bubble-point.is-selected").forEach((bubble) => {
    bubble.classList.remove("is-selected");
  });

  const target = chartRoot.querySelector(`.nature-finance-bubble-point[data-sector-key="${sectorKey}"]`);
  if (target) {
    target.classList.add("is-selected");
  }
}

function triggerBubbleSelection(chartRoot, sectorKey, attempt = 0) {
  const target = chartRoot.querySelector(`.nature-finance-bubble-point[data-sector-key="${sectorKey}"]`);
  if (target) {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return;
  }

  if (attempt >= 60) {
    setSelectedBubble(chartRoot, sectorKey);
    return;
  }

  window.requestAnimationFrame(() => {
    triggerBubbleSelection(chartRoot, sectorKey, attempt + 1);
  });
}

function buildRowsMarkup(rows) {
  return rows
    .map((row, index) => {
      const coverageClass = toCoverageClass(row.coverageStatus);
      const coverageLabel = toCoverageLabel(row.coverageStatus);

      return `
        <tr class="nature-finance-priority-row" data-sector-key="${row.sectorKey}" aria-selected="false" tabindex="0">
          <td>${index + 1}</td>
          <td>${row.sectorLabel}</td>
          <td>${formatOneDecimal(row.economicExposureIndex)}</td>
          <td>${formatOneDecimal(row.vulnerabilityNormalised)}</td>
          <td>${formatOutputBn(row.annualOutputBn)}</td>
          <td>${formatInteger(row.employmentFte)}</td>
          <td>${formatInteger(row.businessCount)}</td>
          <td><span class="nature-finance-coverage-badge nature-finance-coverage-badge--${coverageClass}">${coverageLabel}</span></td>
        </tr>
      `;
    })
    .join("");
}

export function initNatureFinancePriorityRankingTable() {
  const tableBody = document.getElementById("nature-finance-priority-table-body");
  const chartRoot = document.getElementById("nature-finance-bubble-chart");

  if (!tableBody || !chartRoot) {
    return;
  }

  loadNatureFinanceSharedRows()
    .then((rows) => {
      if (!Array.isArray(rows) || !rows.length) {
        tableBody.innerHTML = '<tr><td colspan="8" class="nature-finance-table-empty">No sectors available.</td></tr>';
        return;
      }

      const sortedRows = [...rows].sort((a, b) => toFinite(b.economicExposureIndex) - toFinite(a.economicExposureIndex));
      tableBody.innerHTML = buildRowsMarkup(sortedRows);

      const defaultSectorKey = String(sortedRows[0].sectorKey || "").trim();
      if (defaultSectorKey) {
        setSelectedRow(tableBody, defaultSectorKey);
        triggerBubbleSelection(chartRoot, defaultSectorKey);
      }

      tableBody.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const row = target.closest("tr.nature-finance-priority-row");
        if (!row) {
          return;
        }

        const sectorKey = String(row.getAttribute("data-sector-key") || "").trim();
        if (!sectorKey) {
          return;
        }

        setSelectedRow(tableBody, sectorKey);
        triggerBubbleSelection(chartRoot, sectorKey);
      });

      tableBody.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const row = target.closest("tr.nature-finance-priority-row");
        if (!row) {
          return;
        }

        event.preventDefault();

        const sectorKey = String(row.getAttribute("data-sector-key") || "").trim();
        if (!sectorKey) {
          return;
        }

        setSelectedRow(tableBody, sectorKey);
        triggerBubbleSelection(chartRoot, sectorKey);
      });

      chartRoot.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const bubble = target.closest(".nature-finance-bubble-point");
        if (!bubble) {
          return;
        }

        const sectorKey = String(bubble.getAttribute("data-sector-key") || "").trim();
        if (!sectorKey) {
          return;
        }

        setSelectedRow(tableBody, sectorKey);
      });
    })
    .catch((error) => {
      tableBody.innerHTML = `<tr><td colspan="8" class="nature-finance-table-empty">Unable to load ranking table: ${error?.message || error}</td></tr>`;
    });
}
