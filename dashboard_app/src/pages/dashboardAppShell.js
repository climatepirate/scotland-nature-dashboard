import { createTopNavigation, defaultPageId, isKnownPageId } from "../layout/topNavigation.js";
import { createHeader } from "../layout/header.js";
import { createEcosystemServicesPage } from "./ecosystemServicesPage.js";
import { createBusinessVulnerabilityPage } from "./businessVulnerabilityPage.js";
import { createNatureFinancePage } from "./natureFinancePage.js";
import { createGlossaryMethodologyPage } from "./glossaryMethodologyPage.js";

export function createDashboardAppShell(overviewPageContent) {
  const shell = document.createElement("div");
  shell.className = "app-shell";

  const sharedHeaderWrap = document.createElement("div");
  sharedHeaderWrap.className = "app-shared-header-wrap";
  sharedHeaderWrap.append(createHeader());

  const pageContainer = document.createElement("div");
  pageContainer.className = "app-page-container";

  const pages = new Map();

  const createPageWrapper = (pageId, pageContent) => {
    const wrapper = document.createElement("section");
    wrapper.className = "app-page";
    wrapper.dataset.pageId = pageId;
    wrapper.hidden = true;
    wrapper.append(pageContent);
    pages.set(pageId, wrapper);
    return wrapper;
  };

  pageContainer.append(
    createPageWrapper("introduction", createGlossaryMethodologyPage()),
    createPageWrapper("overview", overviewPageContent),
    createPageWrapper("sector-analysis", createEcosystemServicesPage()),
    createPageWrapper("business-vulnerability", createBusinessVulnerabilityPage()),
    createPageWrapper("economic-exposure", createNatureFinancePage()),
  );

  const legacyPageIdAlias = {
    "glossary-methodology": "introduction",
    "ecosystem-services": "sector-analysis",
    pressures: "business-vulnerability",
    vulnerability: "economic-exposure",
  };

  const setPageFromId = (requestedPageId, updateHash = false) => {
    const pageId = isKnownPageId(requestedPageId) ? requestedPageId : defaultPageId();

    pages.forEach((node, id) => {
      node.hidden = id !== pageId;
    });

    topNavigation.setActivePage(pageId);

    if (updateHash) {
      window.location.hash = pageId;
    }

    if (pageId === "overview") {
      window.dispatchEvent(new Event("resize"));
    }
  };

  const topNavigation = createTopNavigation((pageId) => {
    setPageFromId(pageId, true);
  });

  const setPageFromHash = () => {
    const hashPageId = window.location.hash.replace(/^#/, "");
    const resolvedHashPageId = legacyPageIdAlias[hashPageId] || hashPageId;
    setPageFromId(resolvedHashPageId || defaultPageId());
  };

  shell.append(sharedHeaderWrap, topNavigation.element, pageContainer);

  return {
    element: shell,
    setPageFromHash,
  };
}
