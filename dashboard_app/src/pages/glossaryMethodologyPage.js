function createSectionCard(title, bodyMarkup) {
  const section = document.createElement("section");
  section.className = "panel glossary-section-card";
  section.innerHTML = `
    <div class="panel-head">
      <h3 class="panel-title">${title}</h3>
    </div>
    <div class="glossary-section-body">
      ${bodyMarkup}
    </div>
  `;
  return section;
}

function createDefinitionMethodBlock(definitionText, methodologyText) {
  return `
    <div class="glossary-definition-method-grid">
      <section class="glossary-definition-method-item">
        <h4 class="glossary-mini-heading">Definition</h4>
        <p>${definitionText}</p>
      </section>
      <section class="glossary-definition-method-item">
        <h4 class="glossary-mini-heading">Dashboard methodology</h4>
        <p>${methodologyText}</p>
      </section>
    </div>
  `;
}

export function createGlossaryMethodologyPage() {
  const page = document.createElement("main");
  page.className = "glossary-page";

  const titleCard = document.createElement("section");
  titleCard.className = "panel ecosystem-services-title-card";
  titleCard.innerHTML = `
    <div class="panel-head">
      <h2 class="panel-title">Glossary &amp; Methodology</h2>
      <p class="panel-subtitle">Definitions, methodology and interpretation guidance for the Scotland Nature-Risk Dashboard.</p>
    </div>
  `;

  const purposeSection = createSectionCard(
    "Purpose of the Dashboard",
    `
      <p>This dashboard provides a Scotland-wide screening assessment of business interactions with nature. It combines business location data with sector-level ecosystem service dependency, environmental pressure and vulnerability information to support exploration, prioritisation and evidence-based decision making. The dashboard is intended for comparative assessment and should not be interpreted as predicting company-specific environmental or financial outcomes.</p>
    `,
  );

  const dependencySection = createSectionCard(
    "Nature Dependency",
    createDefinitionMethodBlock(
      "Nature dependency describes the extent to which a business relies on ecosystem services to operate or generate value.",
      "Dependency scores are derived from the ENCORE framework and assigned according to each business sector's dependence on individual ecosystem services.",
    ),
  );

  const pressureSection = createSectionCard(
    "Environmental Pressure",
    createDefinitionMethodBlock(
      "Environmental pressure describes the extent to which business activities place pressure on natural ecosystems.",
      "Pressure scores are derived from ENCORE pressure ratings and represent sector-level interactions with the natural environment.",
    ),
  );

  const ecosystemServicesSection = createSectionCard(
    "Ecosystem Services",
    `
      <h4 class="glossary-mini-heading">Definition</h4>
      <p>Ecosystem services are the benefits that people and businesses obtain from nature.</p>
      <h4 class="glossary-mini-heading">Groups</h4>
      <ul class="glossary-list">
        <li>Provisioning</li>
        <li>Regulating &amp; Maintenance</li>
        <li>Cultural</li>
        <li>Supporting</li>
      </ul>
      <h4 class="glossary-mini-heading">Examples</h4>
      <ul class="glossary-example-list">
        <li>water supply</li>
        <li>pollination</li>
        <li>flood regulation</li>
        <li>recreation</li>
        <li>soil formation</li>
      </ul>
    `,
  );

  const vulnerabilitySection = createSectionCard(
    "Vulnerability",
    `
      <h4 class="glossary-mini-heading">Definition</h4>
      <p>Business vulnerability represents the potential consequences if ecosystem services decline.</p>
      <p>Vulnerability combines:</p>
      <ul class="glossary-list">
        <li>Functional disruption</li>
        <li>Financial consequence</li>
      </ul>
      <p>Vulnerability represents consequence rather than likelihood.</p>
    `,
  );

  const vulnerabilityCalculationSection = createSectionCard(
    "Vulnerability Calculation",
    `
      <section class="glossary-equation-box" aria-label="Company Vulnerability equation">
        <div class="glossary-equation-lines">
          <p>Company Vulnerability = Dependency Score x Functional/Financial Consequence</p>
        </div>
      </section>
      <p>Dependency scores are combined with ENCORE vulnerability ratings to estimate potential functional disruption and financial consequences.</p>
    `,
  );

  const economicExposureSection = createSectionCard(
    "Economic Exposure Index",
    `
      <section class="glossary-equation-box" aria-label="Economic Exposure Index equation">
        <div class="glossary-equation-lines">
          <p>Economis Exposure = (0.5 x Normalised Nature Vulnerability) + (0.5 x Normalised Annual Output)</p>
        </div>
      </section>
      <ul class="glossary-list">
        <li>vulnerability and annual output are independently normalised</li>
        <li>employment provides contextual information only</li>
        <li>the index supports relative prioritisation rather than estimating monetary risk</li>
      </ul>
    `,
  );

  const businessClassificationSection = createSectionCard(
    "Business Classification",
    `
      <p>Businesses are classified using ISIC Sections and grouped into four coarse business categories.</p>
      <div class="glossary-category-grid" role="list" aria-label="Coarse business categories">
        <div class="glossary-category-chip" role="listitem">Business &amp; Property Services</div>
        <div class="glossary-category-chip" role="listitem">Consumer &amp; Visitor Economy</div>
        <div class="glossary-category-chip" role="listitem">Primary &amp; Resource Industries</div>
        <div class="glossary-category-chip" role="listitem">Public &amp; Community Services</div>
      </div>
    `,
  );

  const spatialSection = createSectionCard(
    "Spatial Analysis",
    `
      <p>Business locations are aggregated into hexagonal grid cells to protect individual businesses while revealing spatial patterns.</p>
      <p>Maps display aggregated results rather than exact company locations.</p>
    `,
  );

  const dataSourcesSection = createSectionCard(
    "Data Sources",
    `
      <div class="glossary-table-wrap">
        <table class="glossary-table" aria-label="Data sources and purpose">
          <thead>
            <tr>
              <th scope="col">Dataset</th>
              <th scope="col">Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Companies House</td><td>Business register</td></tr>
            <tr><td>ENCORE</td><td>Ecosystem dependency, pressure and vulnerability</td></tr>
            <tr><td>Scottish Government</td><td>Economic output and employment</td></tr>
            <tr><td>ONS / Postcodes</td><td>Spatial aggregation</td></tr>
            <tr><td>QGIS</td><td>Spatial processing and mapping</td></tr>
          </tbody>
        </table>
      </div>
    `,
  );

  const limitationsSection = createSectionCard(
    "Important Limitations",
    `
      <ul class="glossary-list">
        <li>ENCORE scores are sector-level rather than company-specific.</li>
        <li>Results represent relative comparisons.</li>
        <li>The dashboard does not estimate the probability of ecosystem decline.</li>
        <li>Economic statistics are available only for sectors with suitable published data.</li>
        <li>Results are intended to support screening and prioritisation.</li>
      </ul>
    `,
  );

  const keyTermsSection = createSectionCard(
    "Key Terms",
    `
      <div class="glossary-table-wrap">
        <table class="glossary-table" aria-label="Glossary key terms">
          <thead>
            <tr>
              <th scope="col">Term</th>
              <th scope="col">Definition</th>
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">Business Vulnerability</th><td>Potential business consequence if ecosystem services decline, expressed through functional and financial dimensions.</td></tr>
            <tr><th scope="row">Coarse Category</th><td>High-level grouping of ISIC sections used for cross-sector comparison.</td></tr>
            <tr><th scope="row">Dependency</th><td>Degree to which sectors rely on ecosystem services to operate.</td></tr>
            <tr><th scope="row">Economic Exposure</th><td>Comparative indicator combining nature vulnerability and economic output.</td></tr>
            <tr><th scope="row">Ecosystem Service</th><td>Benefit people and businesses obtain from ecosystems.</td></tr>
            <tr><th scope="row">ENCORE</th><td>Reference framework that maps sector links to nature dependencies, pressures and vulnerability.</td></tr>
            <tr><th scope="row">Environmental Pressure</th><td>Extent to which business activities place pressure on ecosystems.</td></tr>
            <tr><th scope="row">Hexagon</th><td>Spatial aggregation unit used to display location patterns while protecting individual businesses.</td></tr>
            <tr><th scope="row">ISIC</th><td>International Standard Industrial Classification section used to classify business activities.</td></tr>
            <tr><th scope="row">Nature Finance</th><td>Context for comparing economic activity with nature-related vulnerability to support prioritisation.</td></tr>
            <tr><th scope="row">TNFD</th><td>Taskforce on Nature-related Financial Disclosures framework for understanding and reporting nature-related risks and opportunities.</td></tr>
          </tbody>
        </table>
      </div>
    `,
  );

  page.append(
    titleCard,
    purposeSection,
    dependencySection,
    pressureSection,
    ecosystemServicesSection,
    vulnerabilitySection,
    vulnerabilityCalculationSection,
    economicExposureSection,
    businessClassificationSection,
    spatialSection,
    dataSourcesSection,
    limitationsSection,
    keyTermsSection,
  );

  return page;
}
