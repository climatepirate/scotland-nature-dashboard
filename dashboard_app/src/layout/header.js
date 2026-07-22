export function createHeader() {
  const section = document.createElement("header");
  section.className = "panel header";

  section.innerHTML = `
    <h1>Scotland Nature-Risk Dashboard</h1>
  `;

  return section;
}
