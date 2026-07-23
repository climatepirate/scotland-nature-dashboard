function buildCandidateUrls(fileName) {
  const isDashboardSubPath = /\/dashboard_app(?:\/|$)/.test(window.location.pathname);
  const runtimeCandidates = isDashboardSubPath
    ? [`../Data/${fileName}`]
    : [`./Data/${fileName}`, `../Data/${fileName}`];

  const candidates = [
    ...runtimeCandidates.map((path) => new URL(path, window.location.href)),
    // Keep import-meta fallbacks for compatibility with existing environments.
    new URL(`../../../Data/${fileName}`, import.meta.url),
    new URL(`../../Data/${fileName}`, import.meta.url),
  ];

  const seen = new Set();
  return candidates.filter((candidate) => {
    if (isDashboardSubPath && /\/dashboard_app\/Data\//.test(candidate.pathname)) {
      return false;
    }

    const key = candidate.toString();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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