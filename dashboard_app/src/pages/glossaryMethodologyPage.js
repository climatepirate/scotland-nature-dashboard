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

  const introductionSection = createSectionCard(
    "Introduction to the Dashboard",
    `
      <div class="glossary-introduction-text">
        <p>The Scotland Nature-Risk Dashboard is an interactive screening tool for exploring how businesses across Scotland depend on ecosystem services, contribute to pressures on nature, and may be exposed to nature-related functional and economic risks. It combines Scotland-wide business data with ENCORE-based dependency, pressure and vulnerability assessments to identify broad patterns across sectors and locations. The dashboard is intended to support policy development, strategic business engagement and early-stage nature-finance analysis; it does not replace detailed company-level, site-level or supply-chain assessment.</p>
      </div>
    `,
  );
  introductionSection.classList.add("glossary-section-card--introduction");
  introductionSection.insertAdjacentHTML(
    "beforeend",
    '<figure class="glossary-introduction-image-wrap"><img src="Images/assynt.jpg" alt="Assynt landscape" class="glossary-introduction-image" loading="eager" /></figure>',
  );
  const introductionHead = introductionSection.querySelector(".panel-head");
  const introductionBody = introductionSection.querySelector(".glossary-section-body");
  if (introductionHead && introductionBody) {
    const introductionLeftColumn = document.createElement("div");
    introductionLeftColumn.className = "glossary-introduction-left";
    introductionLeftColumn.append(introductionHead, introductionBody);
    introductionSection.prepend(introductionLeftColumn);
  }

  const dashboardPagesSection = createSectionCard(
    "Dashboard Pages",
    `
      <div class="glossary-page-guide-list" role="list" aria-label="Dashboard pages guide">
        <div class="glossary-page-guide-row" role="listitem">
          <div class="glossary-page-guide-bubble">Overview</div>
          <p>Provides the national spatial picture of business interactions with nature. Interactive maps show business concentration, average dependency and pressure, individual ecosystem services and pressure types, with filters for sectors and geographic areas. Use this page to identify broad spatial patterns, concentrations and potential hotspots.</p>
        </div>
        <div class="glossary-page-guide-row" role="listitem">
          <div class="glossary-page-guide-bubble">Sector Analysis</div>
          <p>Compares dependency and pressure across sectors and shows how Scotland's business population is distributed between economic activities. Interactive graphs and filters help identify sectors with relatively high nature dependencies, pressures or combined exposure, and support comparison across different parts of the economy.</p>
        </div>
        <div class="glossary-page-guide-row" role="listitem">
          <div class="glossary-page-guide-bubble">Business Vulnerability</div>
          <p>Examines the potential consequences for businesses when the ecosystem services on which they depend are disrupted. It presents functional vulnerability and financial-cost vulnerability separately and together, helping identify sectors whose operations may be particularly sensitive to nature degradation.</p>
        </div>
        <div class="glossary-page-guide-row" role="listitem">
          <div class="glossary-page-guide-bubble">Economic Pressure</div>
          <p>Explores the economic scale associated with nature-related business exposure by linking sector-level economic information with the dashboard's dependency and vulnerability results. Use this page to identify where nature-related disruption could have wider economic significance and where further investigation, engagement or investment may be warranted.</p>
        </div>
      </div>
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
            <tr><td><a href="https://download.companieshouse.gov.uk/en_output.html" target="_blank" rel="noopener noreferrer">Companies House</a></td><td>Business register</td></tr>
            <tr><td><a href="https://www.encorenature.org/en" target="_blank" rel="noopener noreferrer">ENCORE</a></td><td>Ecosystem dependency, pressure and vulnerability</td></tr>
            <tr><td><a href="https://www.gov.scot/publications/scottish-economic-insights-march-2026/pages/3/" target="_blank" rel="noopener noreferrer">Scottish economic insights: March 2026</a></td><td>Economic output and employment</td></tr>
            <tr><td><a href="https://geoportal.statistics.gov.uk/datasets/3080229224424c9cb53c0b48f5a64d27/about" target="_blank" rel="noopener noreferrer">ONS Postcode Directory</a></td><td>Spatial aggregation</td></tr>
            <tr><td>QGIS</td><td>Manual spatial processing and mapping</td></tr>
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
    "Definitions",
    `
      <div class="glossary-page-guide-list glossary-key-definitions-list" role="list" aria-label="Key terms definitions">
        <section class="glossary-page-guide-row" role="listitem" aria-label="Ecosystem Services definition">
          <div class="glossary-page-guide-bubble glossary-page-guide-bubble--wide">Ecosystem Services</div>
          <div class="glossary-page-guide-content">
            <div class="glossary-ecosystem-services-layout">
              <div class="glossary-ecosystem-services-text">
                <h5 class="glossary-keyterm-subtitle">Definition</h5>
                <p>Ecosystem Services are the direct and indirect contributions ecosystems (known as natural capital) provide for human wellbeing and quality of life. <a href="https://www.nature.scot/scotlands-biodiversity/scottish-biodiversity-strategy/ecosystem-approach/ecosystem-services-natures-benefits" target="_blank" rel="noopener noreferrer">[1]</a></p>
                <ul class="glossary-list">
                  <li><strong>Provisioning</strong> - these are tangible goods that people can harvest from the environment such as food, wood and fibre, water and fuel.</li>
                  <li><strong>Regulating</strong> - these are regulating services that occur in the ecosystem that lead to benefits such as climate regulation, flood management, and water filtration.</li>
                  <li><strong>Cultural</strong> - these include ways in which nature impacts people's health and wellbeing through recreational and education benefits as well as improving mental health and building spiritual connections.</li>
                  <li><strong>Supporting</strong> - ecosystems could not function without supporting services, such as the nutrient cycle, soil formation and habitat provision for biodiversity, forming the basis for the other three types of services.</li>
                </ul>
              </div>
              <aside class="glossary-ecosystem-services-chart" aria-label="Ecosystem service proportions chart">
                <h6 class="glossary-donut-title">Ecosystem Services of Scotland</h6>
                <div id="ecosystem-services-donut" class="glossary-donut-chart">Loading...</div>
              </aside>
            </div>
          </div>
        </section>

        <section class="glossary-page-guide-row" role="listitem" aria-label="Nature Dependency definition">
          <div class="glossary-page-guide-bubble glossary-page-guide-bubble--wide">Nature Dependency</div>
          <div class="glossary-page-guide-content">
            <h5 class="glossary-keyterm-subtitle">Definition</h5>
            <p>Nature dependency describes the extent to which a business relies on ecosystem services to operate, maintain functionality or generate value.</p>
            <h5 class="glossary-keyterm-subtitle">Dashboard calculation</h5>
            <p>Dependency ratings are derived from the ENCORE framework and assigned according to each business's ISIC activity. Scores are calculated for individual ecosystem services and summarised to support comparison across businesses, sectors and locations.</p>
          </div>
        </section>

        <section class="glossary-page-guide-row" role="listitem" aria-label="Environmental Pressure definition">
          <div class="glossary-page-guide-bubble glossary-page-guide-bubble--wide">Environmental Pressure</div>
          <div class="glossary-page-guide-content">
            <div class="glossary-ecosystem-services-layout">
              <div class="glossary-ecosystem-services-text">
                <h5 class="glossary-keyterm-subtitle">Definition</h5>
                <p>Environmental pressure describes the ways in which business activities may contribute to the degradation or alteration of nature.</p>
                <h5 class="glossary-keyterm-subtitle">Dashboard calculation</h5>
                <p>Pressure ratings are derived from ENCORE and assigned according to each business's ISIC activity. They cover pressures such as land and water use, resource extraction, pollution, waste, emissions, invasive species and disturbance. Pressure scores are analysed separately from dependency scores.</p>
              </div>
              <aside class="glossary-ecosystem-services-chart" aria-label="Environmental pressure proportions chart">
                <h6 class="glossary-donut-title">Environmental Pressures of Scottish Businesses</h6>
                <div id="environmental-pressures-donut" class="glossary-donut-chart">Loading...</div>
              </aside>
            </div>
          </div>
        </section>

        <section class="glossary-page-guide-row" role="listitem" aria-label="Business Vulnerability definition">
          <div class="glossary-page-guide-bubble glossary-page-guide-bubble--wide">Business Vulnerability</div>
          <div class="glossary-page-guide-content">
            <h5 class="glossary-keyterm-subtitle">Definition</h5>
            <p>Business vulnerability represents the potential consequences for a business if an ecosystem service on which it depends declines or becomes unavailable. It describes the severity of possible disruption rather than the likelihood that disruption will occur.</p>
            <p>Two dimensions are assessed:</p>
            <ul class="glossary-list">
              <li><strong>Functional vulnerability:</strong> the potential loss of operational functionality.</li>
              <li><strong>Financial vulnerability:</strong> the potential financial cost of replacing, restoring or compensating for the affected ecosystem service.</li>
            </ul>
          </div>
        </section>

        <section class="glossary-page-guide-row" role="listitem" aria-label="Vulnerability Calculations definition">
          <div class="glossary-page-guide-bubble glossary-page-guide-bubble--wide">Vulnerability Calculations</div>
          <div class="glossary-page-guide-content">
            <p>Vulnerability is calculated separately for each ecosystem service by combining dependency and consequence through the dashboard formula:</p>
            <section class="glossary-equation-box" aria-label="Company Vulnerability equation">
              <div class="glossary-equation-lines">
                <p>Company Vulnerability = Dependency Score x Functional/Financial Consequence</p>
              </div>
            </section>
            <p>This weighting ensures that severe consequences receive greater importance where the business is also strongly dependent on the ecosystem service. Functional and financial vulnerability are retained as separate measures and may also be combined into an overall vulnerability indicator for comparative screening.</p>
            <p>The results represent relative sector-based vulnerability and should not be interpreted as predictions of company-specific losses.</p>
          </div>
        </section>

        <section class="glossary-page-guide-row" role="listitem" aria-label="Economic Exposure definition">
          <div class="glossary-page-guide-bubble glossary-page-guide-bubble--wide">Economic Exposure</div>
          <div class="glossary-page-guide-content">
            <h5 class="glossary-keyterm-subtitle">Definition</h5>
            <p>Economic exposure describes the scale of economic activity associated with sectors that may be vulnerable to ecosystem-service decline.</p>
            <h5 class="glossary-keyterm-subtitle">Dashboard calculation</h5>
            <section class="glossary-equation-box" aria-label="Economic Exposure Index equation">
              <div class="glossary-equation-lines">
                <p>Economis Exposure = (0.5 x Normalised Nature Vulnerability) + (0.5 x Normalised Annual Output)</p>
              </div>
            </section>
            <p>The calculation does not estimate an expected financial loss. Instead, it identifies where economically significant sectors also show relatively high nature-related vulnerability, helping prioritise areas for further investigation, policy engagement or more detailed assessment.</p>
          </div>
        </section>
      </div>

      <div class="glossary-page-guide-list glossary-key-definitions-list glossary-key-definitions-list--additional" role="list" aria-label="Additional key terms">
        <section class="glossary-page-guide-row" role="listitem" aria-label="Coarse Category definition">
          <div class="glossary-page-guide-bubble glossary-page-guide-bubble--wide">Coarse Category</div>
          <div class="glossary-page-guide-content">
            <p>High-level grouping of ISIC sections used for cross-sector comparison.</p>
          </div>
        </section>

        <section class="glossary-page-guide-row" role="listitem" aria-label="ENCORE definition">
          <div class="glossary-page-guide-bubble glossary-page-guide-bubble--wide">ENCORE</div>
          <div class="glossary-page-guide-content">
            <p>Reference framework that maps sector links to nature dependencies, pressures and vulnerability.</p>
          </div>
        </section>

        <section class="glossary-page-guide-row" role="listitem" aria-label="ISIC definition">
          <div class="glossary-page-guide-bubble glossary-page-guide-bubble--wide">ISIC</div>
          <div class="glossary-page-guide-content">
            <p>International Standard Industrial Classification section used to classify business activities.</p>
          </div>
        </section>

        <section class="glossary-page-guide-row" role="listitem" aria-label="Nature Finance definition">
          <div class="glossary-page-guide-bubble glossary-page-guide-bubble--wide">Nature Finance</div>
          <div class="glossary-page-guide-content">
            <p>Context for comparing economic activity with nature-related vulnerability to support prioritisation.</p>
          </div>
        </section>

        <section class="glossary-page-guide-row" role="listitem" aria-label="TNFD definition">
          <div class="glossary-page-guide-bubble glossary-page-guide-bubble--wide"><a href="https://tnfd.global/" target="_blank" rel="noopener noreferrer">TNFD</a></div>
          <div class="glossary-page-guide-content">
            <p>Taskforce on Nature-related Financial Disclosures framework for understanding and reporting nature-related risks and opportunities.</p>
          </div>
        </section>
      </div>
    `,
  );

  page.append(
    introductionSection,
    dashboardPagesSection,
    keyTermsSection,
    dataSourcesSection,
    limitationsSection,
  );

  return page;
}
