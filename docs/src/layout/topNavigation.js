const NAV_ITEMS = [
  { id: "introduction", label: "Introduction" },
  { id: "overview", label: "Overview" },
  { id: "sector-analysis", label: "Sector Analysis" },
  { id: "business-vulnerability", label: "Business Vulnerability" },
  { id: "economic-exposure", label: "Economic Exposure" },
];

export function isKnownPageId(pageId) {
  return NAV_ITEMS.some((item) => item.id === pageId);
}

export function defaultPageId() {
  return NAV_ITEMS[0].id;
}

export function createTopNavigation(onNavigate) {
  const nav = document.createElement("nav");
  nav.className = "top-nav";
  nav.setAttribute("aria-label", "Dashboard pages");

  const inner = document.createElement("div");
  inner.className = "top-nav-inner";

  const list = document.createElement("ul");
  list.className = "top-nav-list";

  const buttonsByPageId = new Map();

  NAV_ITEMS.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.className = "top-nav-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "top-nav-link";
    button.textContent = item.label;
    button.dataset.pageId = item.id;
    button.addEventListener("click", () => {
      onNavigate(item.id);
    });

    buttonsByPageId.set(item.id, button);
    listItem.append(button);
    list.append(listItem);
  });

  inner.append(list);
  nav.append(inner);

  const setActivePage = (pageId) => {
    buttonsByPageId.forEach((button, id) => {
      const isActive = id === pageId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-current", isActive ? "page" : "false");
    });
  };

  return {
    element: nav,
    setActivePage,
  };
}
