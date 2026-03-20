// ── ESRI ArcGIS GeoEnrichment API ────────────────────────────────────────────
// Pricing: Credits-based (~$100-300/month at POC scale)
// Replaces: Census demographics with ESRI's proprietary current-year estimates
// Note: Check if firm's ESRI license includes API/developer credits
// Docs: https://developers.arcgis.com/rest/geoenrichment/

const ESRI_BASE = "https://geoenrich.arcgis.com/arcgis/rest/services/Geoenrichment/GeoEnrichment/GeoEnrichment";

/**
 * Get ESRI demographics for a location
 * Uses GeoEnrichment to get current-year population, HHI, and other variables
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMiles - Study area radius
 * @returns {object|null} Enhanced demographics
 */
export async function getEsriDemographics(lat, lng, radiusMiles = 3) {
  const apiKey = process.env.ESRI_API_KEY;
  if (!apiKey) return { error: "ESRI_API_KEY not set", demographics: null };

  try {
    // Key demographic variables from ESRI's data collections
    // These use ESRI's proprietary current-year estimates (better than Census lag)
    const analysisVariables = [
      "AtRisk.TOTPOP",          // Total population (current year estimate)
      "AtRisk.TOTHH",           // Total households
      "AtRisk.MEDHINC",         // Median household income
      "AtRisk.AVGHINC",         // Average household income
      "AtRisk.MEDAGE",          // Median age
      "AtRisk.OWNER",           // Owner-occupied housing units
      "AtRisk.RENTER",          // Renter-occupied housing units
      "AtRisk.POPGRW",          // Population growth rate
      "AtRisk.HHGRW",           // Household growth rate
    ].join(",");

    const url = new URL(`${ESRI_BASE}/enrich`);
    url.searchParams.set("studyAreas", JSON.stringify([{
      geometry: { x: lng, y: lat },
      areaType: "RingBuffer",
      bufferUnits: "esriMiles",
      bufferRadii: [radiusMiles],
    }]));
    url.searchParams.set("analysisVariables", analysisVariables);
    url.searchParams.set("returnGeometry", "false");
    url.searchParams.set("f", "json");
    url.searchParams.set("token", apiKey);

    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      return { error: `ESRI API: ${resp.status}`, demographics: null };
    }

    const data = await resp.json();
    return parseEsriResponse(data, radiusMiles);
  } catch (e) {
    console.warn("ESRI API error:", e.message);
    return { error: e.message, demographics: null };
  }
}

function parseEsriResponse(data, radiusMiles) {
  try {
    const results = data.results?.[0]?.value?.FeatureSet?.[0]?.features?.[0]?.attributes;
    if (!results) return { error: "No ESRI results", demographics: null };

    return {
      source: "esri_geoenrichment",
      radius_miles: radiusMiles,
      demographics: {
        total_population: results.TOTPOP || null,
        total_households: results.TOTHH || null,
        median_hhi: results.MEDHINC || null,
        avg_hhi: results.AVGHINC || null,
        median_age: results.MEDAGE || null,
        owner_occupied: results.OWNER || null,
        renter_occupied: results.RENTER || null,
        pop_growth_rate: results.POPGRW || null,
        hh_growth_rate: results.HHGRW || null,
      },
    };
  } catch (e) {
    return { error: "Failed to parse ESRI response", demographics: null };
  }
}
