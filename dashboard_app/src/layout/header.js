export function createHeader() {
  const section = document.createElement("header");
  section.className = "panel header";

  section.innerHTML = `
    <h1>Scotland Nature-Risk Dashboard</h1>
    <p>Prototype shell: layout only. Map, chart, and filter logic will be added incrementally.</p>
  `;

  return section;
}
