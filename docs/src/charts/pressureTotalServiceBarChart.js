import { fetchDashboardDataJson } from "../config/dataAssetLoader.js";
import { getState, subscribe } from "../state/state.js";

const CHART_CONTAINER_ID = "pressure-total-service-chart";
const STATUS_ID = "pressure-total-service-status";
const TOGGLE_ID = "pressure-total-service-toggle";
const LA_SUBTITLE_ID = "pressure-total-service-la-subtitle";
const TOP_VISIBLE_COUNT = 5;

let chartInitialized = false;

const LOCAL_AUTHORITY_NAME_BY_CODE = {
  S12000033: "Aberdeen City", S12000034: "Aberdeenshire", S12000041: "Angus",
  S12000035: "Argyll and Bute", S12000036: "City of Edinburgh", S12000005: "Clackmannanshire",
  S12000006: "Dumfries and Galloway", S12000042: "Dundee City", S12000008: "East Ayrshire",
  S12000045: "East Dunbartonshire", S12000010: "East Lothian", S12000011: "East Renfrewshire",
  S12000013: "Eilean Siar", S12000014: "Falkirk", S12000047: "Fife", S12000049: "Glasgow City",
  S12000017: "Highland", S12000018: "Inverclyde", S12000019: "Midlothian", S12000020: "Moray",
  S12000021: "North Ayrshire", S12000050: "North Lanarkshire", S12000023: "Orkney Islands",
  S12000048: "Perth and Kinross", S12000038: "Renfrewshire", S12000026: "Scottish Borders",
  S12000027: "Shetland Islands", S12000028: "South Ayrshire", S12000029: "South Lanarkshire",
  S12000030: "Stirling", S12000039: "West Dunbartonshire", S12000040: "West Lothian",
};

function getLaName(code) {
  if (!code || code === "All Scotland") return "Scotland";
  return LOCAL_AUTHORITY_NAME_BY_CODE[code] || code;
}

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
  const laSubtitle = document.getElementById(LA_SUBTITLE_ID);
  if (!chartContainer || !status || !toggle) {
    return;
  }

  chartInitialized = true;

  status.hidden = false;
  status.textContent = "Loading pressure totals…";

  let allData = null;
  let expanded = false;

  try {
    allData = await fetchDashboardDataJson(
      "pressure_total_by_la.json",
      "pressure total by local authority",
    );
  } catch (error) {
    status.hidden = false;
    status.textContent = `Unable to load pressure totals: ${error?.message || error}`;
    chartContainer.innerHTML = "";
    toggle.hidden = true;
    return;
  }

  const render = () => {
    const laCode = getState().localAuthorityCode || "All Scotland";
    const rows = normalizeRows({ rows: allData[laCode] || allData["All Scotland"] || [] });
    if (laSubtitle) {
      laSubtitle.textContent = laCode === "All Scotland"
        ? "Scotland-wide results"
        : `Filtered to: ${getLaName(laCode)}`;
    }
    if (!rows.length) {
      status.hidden = false;
      status.textContent = "No pressure totals available for the selected area.";
      chartContainer.innerHTML = "";
      toggle.hidden = true;
      return;
    }
    renderBars(chartContainer, rows, expanded);
    status.hidden = true;
    if (rows.length <= TOP_VISIBLE_COUNT) {
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

  subscribe((nextState, prevState) => {
    if (nextState.localAuthorityCode !== prevState.localAuthorityCode) {
      render();
    }
  });

  render();
}
