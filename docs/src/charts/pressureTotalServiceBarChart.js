import { fetchDashboardDataJson } from "../config/dataAssetLoader.js";

const CHART_CONTAINER_ID = "pressure-total-service-chart";
const STATUS_ID = "pressure-total-service-status";
const TOGGLE_ID = "pressure-total-service-toggle";
const TOP_VISIBLE_COUNT = 5;

let chartInitialized = false;

function formatTotal(value) {
  return Number(value || 0).toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function normalizeRows(payload) {
  const sourceRows = Array.isArray(payload?.rows) ? payload.rows : [];
  return sourceRows
    .map((row) => {
      const pressure = String(row?.pressure || "").trim();
      const total = Number(row?.total);
      if (!pressure || !Number.isFinite(total)) {
        return null;
      }
      return { pressure, total };
    })
    .filter(Boolean)
    .sort((left, right) => right.total - left.total || left.pressure.localeCompare(right.pressure));
}

function renderBars(container, rows, expanded) {
  const visibleRows = expanded ? rows : rows.slice(0, TOP_VISIBLE_COUNT);
  const maxTotal = rows.length ? rows[0].total : 0;

  container.innerHTML = "";

  visibleRows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "pressure-total-service-row";

    const label = document.createElement("div");
    label.className = "pressure-total-service-label";
    label.textContent = row.pressure;

    const barWrap = document.createElement("div");
    barWrap.className = "pressure-total-service-bar-wrap";

    const bar = document.createElement("div");
    bar.className = "pressure-total-service-bar";
    const widthPct = maxTotal > 0 ? (row.total / maxTotal) * 100 : 0;
    bar.style.width = `${Math.max(2, widthPct).toFixed(2)}%`;

    const value = document.createElement("span");
    value.className = "pressure-total-service-value";
    value.textContent = formatTotal(row.total);

    barWrap.append(bar, value);
    item.append(label, barWrap);
    container.append(item);
  });
}

export async function initPressureTotalServiceBarChart() {
  if (chartInitialized) {
    return;
  }

  const chartContainer = document.getElementById(CHART_CONTAINER_ID);
  const status = document.getElementById(STATUS_ID);
  const toggle = document.getElementById(TOGGLE_ID);
  if (!chartContainer || !status || !toggle) {
    return;
  }

  chartInitialized = true;

  status.hidden = false;
  status.textContent = "Loading pressure totals…";

  try {
    const payload = await fetchDashboardDataJson(
      "pressure_total_service_static.json",
      "pressure total service static",
    );
    const totals = normalizeRows(payload);
    if (!totals.length) {
      status.textContent = "No pressure totals available.";
      chartContainer.innerHTML = "";
      toggle.hidden = true;
      return;
    }

    let expanded = false;

    const render = () => {
      renderBars(chartContainer, totals, expanded);
      if (totals.length <= TOP_VISIBLE_COUNT) {
        toggle.hidden = true;
      } else {
        toggle.hidden = false;
        toggle.textContent = expanded ? "Show top 5 only" : "Show all pressure types";
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      }
    };

    toggle.addEventListener("click", () => {
      expanded = !expanded;
      render();
    });

    status.hidden = true;
    render();
  } catch (error) {
    status.hidden = false;
    status.textContent = `Unable to load pressure totals: ${error?.message || error}`;
    chartContainer.innerHTML = "";
    toggle.hidden = true;
  }
}
