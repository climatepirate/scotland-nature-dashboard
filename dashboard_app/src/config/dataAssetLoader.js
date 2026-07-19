function buildCandidateUrls(fileName) {
  return [
    new URL(`./Data/${fileName}`, window.location.href),
    new URL(`../../Data/${fileName}`, import.meta.url),
    new URL(`../../../Data/${fileName}`, import.meta.url),
  ];
}

export async function fetchDashboardDataJson(fileName, errorLabel) {
  const candidates = buildCandidateUrls(fileName);
  let lastError = "request failed";

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (response.ok) {
        return response.json();
      }

      lastError = `${response.status} (${candidate.pathname || candidate.toString()})`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }

  throw new Error(`Unable to load ${errorLabel}: ${lastError}`);
}

export async function fetchDashboardDataText(fileName, errorLabel) {
  const candidates = buildCandidateUrls(fileName);
  let lastError = "request failed";

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (response.ok) {
        return response.text();
      }

      lastError = `${response.status} (${candidate.pathname || candidate.toString()})`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }

  throw new Error(`Unable to load ${errorLabel}: ${lastError}`);
}