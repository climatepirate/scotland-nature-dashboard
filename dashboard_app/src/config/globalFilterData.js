import { fetchDashboardDataJson } from "./dataAssetLoader.js";

const ALL_SCOTLAND = "All Scotland";
const ALL_CATEGORIES = "All Categories";

const LOCAL_AUTHORITY_NAME_BY_CODE = {
  S12000033: "Aberdeen City",
  S12000034: "Aberdeenshire",
  S12000041: "Angus",
  S12000035: "Argyll and Bute",
  S12000036: "City of Edinburgh",
  S12000005: "Clackmannanshire",
  S12000006: "Dumfries and Galloway",
  S12000042: "Dundee City",
  S12000008: "East Ayrshire",
  S12000045: "East Dunbartonshire",
  S12000010: "East Lothian",
  S12000011: "East Renfrewshire",
  S12000013: "Eilean Siar",
  S12000014: "Falkirk",
  S12000047: "Fife",
  S12000049: "Glasgow City",
  S12000017: "Highland",
  S12000018: "Inverclyde",
  S12000019: "Midlothian",
  S12000020: "Moray",
  S12000021: "North Ayrshire",
  S12000050: "North Lanarkshire",
  S12000023: "Orkney Islands",
  S12000048: "Perth and Kinross",
  S12000038: "Renfrewshire",
  S12000026: "Scottish Borders",
  S12000027: "Shetland Islands",
  S12000028: "South Ayrshire",
  S12000029: "South Lanarkshire",
  S12000030: "Stirling",
  S12000039: "West Dunbartonshire",
  S12000040: "West Lothian",
};

function normalizeCodeEntry(entry) {
  if (!entry) {
    return "";
  }

  if (typeof entry === "string") {
    return entry;
  }

  return entry.code || "";
}

function normalizeHexList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((hexId) => String(hexId || "").trim())
    .filter(Boolean);
}

export const globalFilterData = {
  localAuthorities: [],
  coarseCategories: [],
  hexIdsByLocalAuthorityCode: {},
  hexIdsByCoarseCategory: {},
  hexIdsByLocalAuthorityAndCoarseCategory: {},
};

let globalFilterDataPromise = null;

export function loadGlobalFilterData() {
  if (!globalFilterDataPromise) {
    globalFilterDataPromise = fetchDashboardDataJson("dashboard_filter_index.json", "dashboard filter index")
      .then((payload) => {
        const localAuthorityCodes = (payload.local_authorities || [])
          .map(normalizeCodeEntry)
          .filter(Boolean);

        const coarseCategories = (payload.coarse_categories || []).map((category) => String(category || "").trim()).filter(Boolean);

        const buckets = payload.buckets || {};

        const localAuthorities = localAuthorityCodes.map((code) => ({
          code,
          name: LOCAL_AUTHORITY_NAME_BY_CODE[code] || code,
        }));

        const hexIdsByLocalAuthorityCode = {};
        localAuthorityCodes.forEach((code) => {
          const bucket = buckets[`${code}||${ALL_CATEGORIES}`] || {};
          hexIdsByLocalAuthorityCode[code] = normalizeHexList(bucket.hex_ids);
        });

        const hexIdsByCoarseCategory = {};
        coarseCategories.forEach((category) => {
          const bucket = buckets[`${ALL_SCOTLAND}||${category}`] || {};
          hexIdsByCoarseCategory[category] = normalizeHexList(bucket.hex_ids);
        });

        const hexIdsByLocalAuthorityAndCoarseCategory = {};
        localAuthorityCodes.forEach((code) => {
          coarseCategories.forEach((category) => {
            const bucket = buckets[`${code}||${category}`] || {};
            hexIdsByLocalAuthorityAndCoarseCategory[`${code}||${category}`] = normalizeHexList(bucket.hex_ids);
          });
        });

        globalFilterData.localAuthorities = localAuthorities;
        globalFilterData.coarseCategories = coarseCategories;
        globalFilterData.hexIdsByLocalAuthorityCode = hexIdsByLocalAuthorityCode;
        globalFilterData.hexIdsByCoarseCategory = hexIdsByCoarseCategory;
        globalFilterData.hexIdsByLocalAuthorityAndCoarseCategory = hexIdsByLocalAuthorityAndCoarseCategory;

        return globalFilterData;
      });
  }

  return globalFilterDataPromise;
}
