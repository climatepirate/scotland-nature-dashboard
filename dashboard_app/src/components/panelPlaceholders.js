function createPanelFrame(title, subtitle) {
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">${title}</h2>
      <p class="panel-subtitle">${subtitle}</p>
    </div>
  `;
  return panel;
}

export function createMapPanel(title, description) {
  const panel = createPanelFrame(title, description);
  const content = document.createElement("div");
  content.className = "placeholder map-placeholder";
  content.innerHTML = `
    <div>
      <strong>Map Placeholder</strong>
      <div>Map rendering not connected in this stage.</div>
    </div>
  `;
  panel.append(content);
  return panel;
}

export function createChartPanel(title, description) {
  const panel = createPanelFrame(title, description);
  const content = document.createElement("div");
  content.className = "placeholder chart-placeholder";
  content.innerHTML = `
    <div>
      <strong>Chart Placeholder</strong>
      <div>Chart logic not implemented in this stage.</div>
    </div>
  `;
  panel.append(content);
  return panel;
}
