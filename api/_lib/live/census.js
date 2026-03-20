// ── US Census Bureau ACS API ─────────────────────────────────────────────────
// Free API: https://api.census.gov/data.html
// Replaces: Claude-guessed population, HHI, household counts
// Key signup: https://api.census.gov/data/key_signup.html (free, optional but recommended)

const CENSUS_BASE = "https://api.census.gov/data";
const ACS_YEAR = "2023"; // Latest ACS 5-year estimates
const ACS_DATASET = "acs/acs5";

// ACS variable codes
const VARIABLES = {
  total_population: "B01003_001E",
  median_hhi: "B19013_001E",
  total_households: "B25001_001E",
  owner_occupied: "B25003_002E",
  renter_occupied: "B25003_003E",
  median_age: "B01002_001E",
  median_home_value: "B25077_001E",
};

const fipsCache = new Map();

/**
 * Get FIPS codes (state + county) from lat/lng using FCC API (free, no key)
 */
async function getFips(lat, lng) {
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (fipsCache.has(cacheKey)) return fipsCache.get(cacheKey);
  if (fipsCache.size > 2000) fipsCache.clear();

  const resp = await fetch(
    `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lng}&format=json`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.County) {
    fipsCache.set(cacheKey, null);
    return null;
  }
  const result = {
    state: data.County.FIPS.slice(0, 2),
    county: data.County.FIPS.slice(2, 5),
    tract: data.Block?.FIPS?.slice(5, 11) || null,
    countyName: data.County.name,
    stateName: data.State?.name || null,
  };
  fipsCache.set(cacheKey, result);
  return result;
}

/**
 * Query Census ACS for demographics at county or tract level
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {object|null} Demographics data
 */
export async function getCensusDemographics(lat, lng) {
  const apiKey = process.env.CENSUS_API_KEY;
  const fips = await getFips(lat, lng);
  if (!fips) return null;

  const varList = Object.values(VARIABLES).join(",");
  const keyParam = apiKey ? `&key=${apiKey}` : "";

  // Try tract-level first (more granular), fall back to county
  let url;
  if (fips.tract) {
    url = `${CENSUS_BASE}/${ACS_YEAR}/${ACS_DATASET}?get=${varList}&for=tract:${fips.tract}&in=state:${fips.state}+county:${fips.county}${keyParam}`;
  } else {
    url = `${CENSUS_BASE}/${ACS_YEAR}/${ACS_DATASET}?get=${varList}&for=county:${fips.county}&in=state:${fips.state}${keyParam}`;
  }

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) {
      // Fall back to county level if tract fails
      if (fips.tract) {
        const countyUrl = `${CENSUS_BASE}/${ACS_YEAR}/${ACS_DATASET}?get=${varList}&for=county:${fips.county}&in=state:${fips.state}${keyParam}`;
        const countyResp = await fetch(countyUrl, { signal: AbortSignal.timeout(8000) });
        if (!countyResp.ok) return null;
        const countyData = await countyResp.json();
        return parseCensusResponse(countyData, fips, "county");
      }
      return null;
    }
    const data = await resp.json();
    return parseCensusResponse(data, fips, fips.tract ? "tract" : "county");
  } catch (e) {
    console.warn("Census API error:", e.message);
    return null;
  }
}

function parseCensusResponse(data, fips, level) {
  if (!data || data.length < 2) return null;

  const headers = data[0];
  const values = data[1];
  const varKeys = Object.keys(VARIABLES);
  const varCodes = Object.values(VARIABLES);

  const result = {
    source: "census_acs",
    level, // "tract" or "county"
    fips: fips,
  };

  for (let i = 0; i < varCodes.length; i++) {
    const idx = headers.indexOf(varCodes[i]);
    if (idx >= 0) {
      const val = parseInt(values[idx], 10);
      result[varKeys[i]] = isNaN(val) || val < 0 ? null : val;
    }
  }

  return result;
}

/**
 * Estimate trade-area population using county data + area scaling
 * Census tracts are small (~4k people). For a 3-5 mile trade area,
 * we need to scale up or query multiple tracts.
 *
 * Simple approach: query county population, estimate trade area fraction
 * based on county area vs trade area circle.
 */
export async function getTradeAreaEstimate(lat, lng, radiusMiles = 3) {
  const demographics = await getCensusDemographics(lat, lng);
  if (!demographics) return null;

  // For tract-level data, the population IS roughly a small neighborhood
  // For trade area, multiply by approximate ratio (trade area / tract area)
  // Average US census tract: ~1.3 sq mi urban, much larger rural
  // Trade area circle: π × r² sq mi
  const tradeAreaSqMi = Math.PI * radiusMiles * radiusMiles;

  if (demographics.level === "tract" && demographics.total_population) {
    // Rough scaling: a 3-mile radius trade area covers ~28 sq mi
    // Average urban tract is ~1.3 sq mi with ~4,000 people
    // So trade area ≈ 20-25 tracts ≈ 80,000-100,000 people in dense areas
    // This is a rough estimate — for precision, query all tracts within radius
    const urbanDensity = demographics.total_population / 1.3; // people per sq mi
    const tradeAreaPop = Math.round(urbanDensity * tradeAreaSqMi);
    return {
      ...demographics,
      est_pop_trade_area: tradeAreaPop,
      trade_area_miles: radiusMiles,
      estimation_method: "tract_density_scaling",
    };
  }

  return {
    ...demographics,
    est_pop_trade_area: demographics.total_population, // county-level fallback
    trade_area_miles: radiusMiles,
    estimation_method: "county_total",
  };
}
