export function createHeader() {
  const section = document.createElement("header");
  section.className = "panel header";

  section.innerHTML = `
    <h1>Scotland Nature-Risk Dashboard</h1>
  `;
section.innerHTML = `
  <div class="header-content">
    <div class="header-text">
      <h1>Scotland Nature-Risk Dashboard</h1>
      <p class="dashboard-subtitle">
        Business Interactions with Nature to Support Evidence-Based Policy
      </p>
    </div>

    <div class="header-logos header-logos--single">
      
     <img
        src="./Images/efi-logo-black.png"
        alt="University of Edinburgh"
        class="header-logo"
      >
    </div>
  </div>
`;
  return section;
}
