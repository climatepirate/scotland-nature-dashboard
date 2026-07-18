function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function firstDefinedValue(properties, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      const value = properties[key];
      if (value !== null && value !== undefined && value !== "") {
        return value;
      }
    }
  }
  return undefined;
}

function buildGetFeatureInfoUrl(map, wmsLayer, latlng, options = {}) {
  const point = map.latLngToContainerPoint(latlng, map.getZoom());
  const size = map.getSize();
  const bounds = map.getBounds();
  const sw = map.options.crs.project(bounds.getSouthWest());
  const ne = map.options.crs.project(bounds.getNorthEast());
  const wmsParams = wmsLayer.wmsParams || {};

  const version = String(wmsParams.version || wmsParams.VERSION || "1.3.0");
  const crs = wmsParams.crs || wmsParams.CRS || map.options.crs.code;
  const layers = wmsParams.layers || wmsParams.LAYERS;
  const mapPath = wmsParams.MAP || wmsParams.map;
  const uppercase = Boolean(wmsLayer.options?.uppercase);

  const requestParams = {
    service: "WMS",
    request: "GetFeatureInfo",
    version,
    layers,
    query_layers: layers,
    styles: wmsParams.styles || wmsParams.STYLES || "",
    format: wmsParams.format || wmsParams.FORMAT || "image/png",
    transparent: wmsParams.transparent ?? wmsParams.TRANSPARENT ?? true,
    feature_count: options.featureCount || 1,
    info_format: options.infoFormat || "application/json",
    bbox: [sw.x, sw.y, ne.x, ne.y].join(","),
    height: size.y,
    width: size.x,
  };

  if (mapPath) {
    requestParams.MAP = mapPath;
  }

  if (version === "1.3.0") {
    requestParams.crs = crs;
    requestParams.i = Math.floor(point.x);
    requestParams.j = Math.floor(point.y);
  } else {
    requestParams.srs = crs;
    requestParams.x = Math.floor(point.x);
    requestParams.y = Math.floor(point.y);
  }

  return wmsLayer._url + L.Util.getParamString(requestParams, wmsLayer._url, uppercase);
}

function withInfoFormat(url, infoFormat) {
  const parsed = new URL(url, window.location.href);
  parsed.searchParams.set("info_format", infoFormat);
  parsed.searchParams.set("INFO_FORMAT", infoFormat);
  return parsed.toString();
}

function popupHtmlFromFeature(properties, fields) {
  const rows = fields
    .map((field) => {
      const value = firstDefinedValue(properties, field.keys);
      if (value === undefined) {
        return null;
      }
      return `<div><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(String(value))}</div>`;
    })
    .filter(Boolean);

  if (!rows.length) {
    return null;
  }

  return `<div>${rows.join("")}</div>`;
}

export function attachWmsFeatureInfoPopup(map, wmsLayer, fields, options = {}) {
  if (!map || !wmsLayer || !Array.isArray(fields) || !fields.length) {
    return;
  }

  map.on("click", async (event) => {
    try {
      const url = buildGetFeatureInfoUrl(map, wmsLayer, event.latlng, options);
      const jsonUrl = withInfoFormat(url, options.infoFormat || "application/json");
      const response = await fetch(jsonUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const features = Array.isArray(payload?.features) ? payload.features : [];
      if (!features.length) {
        return;
      }

      const properties = features[0]?.properties || {};
      const content = popupHtmlFromFeature(properties, fields);
      if (!content) {
        return;
      }

      L.popup()
        .setLatLng(event.latlng)
        .setContent(content)
        .openOn(map);
    } catch (error) {
      console.error("[WMS GetFeatureInfo] JSON request failed", error?.message || error);
    }
  });
}
