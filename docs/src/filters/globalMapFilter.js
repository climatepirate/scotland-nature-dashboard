import { loadGlobalFilterData } from "../config/globalFilterData.js";
import { getState } from "../state/state.js";

const ALL_SCOTLAND = "All Scotland";
const ALL_CATEGORIES = "All Categories";
const GLOBAL_FILTER_HANDLER_REGISTRY_KEY = "__dashboardGlobalFilterHandlers";

function getGlobalFilterHandlerRegistry() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!(window[GLOBAL_FILTER_HANDLER_REGISTRY_KEY] instanceof Set)) {
    window[GLOBAL_FILTER_HANDLER_REGISTRY_KEY] = new Set();
  }

  return window[GLOBAL_FILTER_HANDLER_REGISTRY_KEY];
}

function buildCompactFilterClause(state) {
  const localAuthorityCode = state.localAuthorityCode || ALL_SCOTLAND;
  const coarseCategory = state.coarseCategory || ALL_CATEGORIES;

  if (localAuthorityCode === ALL_SCOTLAND && coarseCategory === ALL_CATEGORIES) {
    return "\"filter_scope\" = 'all'";
  }

  if (localAuthorityCode !== ALL_SCOTLAND && coarseCategory === ALL_CATEGORIES) {
    return `\"filter_scope\" = 'la' AND \"local_authority\" = '${String(localAuthorityCode).replace(/'/g, "''")}'`;
  }

  if (localAuthorityCode === ALL_SCOTLAND && coarseCategory !== ALL_CATEGORIES) {
    return `\"filter_scope\" = 'category' AND \"coarse_category\" = '${String(coarseCategory).replace(/'/g, "''")}'`;
  }

  return `\"filter_scope\" = 'la_category' AND \"local_authority\" = '${String(localAuthorityCode).replace(/'/g, "''")}' AND \"coarse_category\" = '${String(coarseCategory).replace(/'/g, "''")}'`;
}

function buildHexFilterExpression(state) {
  const expression = buildCompactFilterClause(state);
  if (!expression) {
    return "";
  }

  return expression;
}

export function buildHexFilterExpressionForState(state) {
  return buildHexFilterExpression(state);
}

export function emitGlobalFilterChange(state = getState()) {
  const filterExpression = buildHexFilterExpression(state);
  const registry = getGlobalFilterHandlerRegistry();
  if (registry) {
    registry.forEach((applyExpression) => {
      applyExpression(filterExpression, state);
    });
  }
  return filterExpression;
}

