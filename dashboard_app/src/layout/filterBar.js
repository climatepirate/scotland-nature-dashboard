import { globalFilterData, loadGlobalFilterData } from "../config/globalFilterData.js";
import { getState, updateState } from "../state/state.js";
import { emitGlobalFilterChange } from "../filters/globalMapFilter.js";

export function createGlobalFilterBar() {
  const section = document.createElement("section");
  section.className = "panel filter-bar";

  section.innerHTML = `
    <div class="global-filter-grid">
      <div class="global-filter-item">
        <label class="global-filter-label" for="global-local-authority-filter">Local Authority</label>
        <select id="global-local-authority-filter" class="global-filter-input" aria-label="Local Authority"></select>
      </div>
      <div class="global-filter-item">
        <label class="global-filter-label" for="global-coarse-category-filter">Coarse Category</label>
        <select id="global-coarse-category-filter" class="global-filter-input" aria-label="Coarse Category"></select>
      </div>
    </div>
  `;

  const localAuthoritySelect = section.querySelector("#global-local-authority-filter");
  const coarseCategorySelect = section.querySelector("#global-coarse-category-filter");
  const state = getState();

  function populateOptions() {
    localAuthoritySelect.innerHTML = "";
    coarseCategorySelect.innerHTML = "";

    localAuthoritySelect.append(new Option("All Scotland", "All Scotland"));
    globalFilterData.localAuthorities.forEach((authority) => {
      localAuthoritySelect.append(new Option(authority.name, authority.code));
    });

    coarseCategorySelect.append(new Option("All Categories", "All Categories"));
    globalFilterData.coarseCategories.forEach((category) => {
      coarseCategorySelect.append(new Option(category, category));
    });

    localAuthoritySelect.value = state.localAuthorityCode;
    coarseCategorySelect.value = state.coarseCategory;
  }

  populateOptions();

  loadGlobalFilterData().then(() => {
    populateOptions();
  }).catch((error) => {
    console.error("Global filter index unavailable:", error);
  });

  localAuthoritySelect.addEventListener("change", (event) => {
    const nextState = updateState({ localAuthorityCode: event.target.value });
    emitGlobalFilterChange(nextState);
  });

  coarseCategorySelect.addEventListener("change", (event) => {
    const nextState = updateState({ coarseCategory: event.target.value });
    emitGlobalFilterChange(nextState);
  });

  return section;
}
