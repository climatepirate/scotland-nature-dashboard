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
        Business Interactions with Nature to Support Evidence-Based Policy and Investment
      </p>
    </div>

    <div class="header-logos">
      
     <img
        src="./Images/efi-logo-black.png"
        alt="University of Edinburgh"
        class="header-logo"
      >
    <img
        src="./Images/scot_gov_logo.jpg"
        alt="Scottish Government"
        class="header-logo-large"
      >
    </div>
  </div>
`;
  return section;
}
