// ── StorTrack API ────────────────────────────────────────────────────────────
// Real integration: OAuth2 Password Flow + POST /pricesbyradius
// Pricing: Explorer Essential $79/mo, Enhanced $199/mo; Optimize $49-59/mo/store
// Note: StorTrack provides STREET rates (advertised), not achieved/in-place rates
//       Street rates are typically 15-27% below T12 achieved rates

const STORTRACK_BASE = "https://api.stortrack.com";
const TIMEOUT = 15000;

// ── OAuth2 Token Cache ──────────────────────────────────────────────────────

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get an OAuth2 access token via Password Flow
 * Caches token until expiry (minus 60s buffer)
 */
async function getAccessToken() {
  const username = process.env.STORTRACK_USERNAME;
  const password = process.env.STORTRACK_PASSWORD;

  if (!username || !password) {
    throw new Error("STORTRACK_USERNAME and STORTRACK_PASSWORD must be set");
  }

  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: "password",
    username,
    password,
  });

  const resp = await fetch(`${STORTRACK_BASE}/authtoken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(TIMEOUT),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`StorTrack auth failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  cachedToken = data.access_token;
  // Cache token with 60s safety buffer before actual expiry
  const expiresIn = data.expires_in || 3600;
  tokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;

  console.log(`[stortrack] Auth OK, token expires in ${expiresIn}s`);
  return cachedToken;
}

// ── Prices By Radius ────────────────────────────────────────────────────────

/**
 * Get self-storage rates near a location from StorTrack
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMiles - Search radius in miles
 * @returns {object} Rate data with facility-level detail
 */
export async function getMarketRates(lat, lng, radiusMiles = 5, retryCount = 0) {
  if (!process.env.STORTRACK_USERNAME || !process.env.STORTRACK_PASSWORD) {
    return { error: "STORTRACK credentials not set", rates: null };
  }

  try {
    const token = await getAccessToken();

    const body = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: String(radiusMiles),
    });

    const resp = await fetch(`${STORTRACK_BASE}/pricesbyradius`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!resp.ok) {
      // If 401, clear cached token and retry once
      if (resp.status === 401 && cachedToken && retryCount < 1) {
        cachedToken = null;
        tokenExpiresAt = 0;
        console.warn("[stortrack] Token expired, retrying auth...");
        return getMarketRates(lat, lng, radiusMiles, retryCount + 1);
      }
      return { error: `StorTrack API: ${resp.status}`, rates: null };
    }

    const data = await resp.json();
    return parseStorTrackResponse(data, radiusMiles);
  } catch (e) {
    console.warn("[stortrack] API error:", e.message);
    return { error: e.message, rates: null };
  }
}

// ── Response Parser ─────────────────────────────────────────────────────────

/**
 * Parse StorTrack /pricesbyradius response into our rate format
 *
 * StorTrack response schema (per store):
 *   storeid, storename, address, city, state, zip, lat, lng,
 *   totalSqft, rentableSqft,
 *   units[]: { spacetype, size, width, length, climatecontrolled,
 *              regularprice, onlineprice, promotionprice }
 */
function parseStorTrackResponse(data, radiusMiles) {
  // StorTrack returns an array of stores (or wraps in a data/stores key)
  const stores = Array.isArray(data) ? data
    : data.stores || data.data || data.results || [];

  if (!stores.length) {
    return { source: "stortrack", rates: null, facilities: [], facility_count: 0 };
  }

  // Collect rate data per unit size category
  const ccRates = [];     // Climate controlled
  const nonCcRates = [];  // Non-climate / drive-up
  const allRates = [];    // Everything
  const facilityDetails = [];

  for (const store of stores) {
    const units = store.units || store.prices || [];
    const storeInfo = {
      name: store.storename || store.name,
      address: store.address,
      city: store.city,
      state: store.state,
      totalSqft: parseFloat(store.totalSqft || store.totalsqft) || null,
      rentableSqft: parseFloat(store.rentableSqft || store.rentablesqft) || null,
      unitCount: units.length,
      rates: { cc: [], noncc: [] },
    };

    for (const u of units) {
      const width = parseFloat(u.width) || 0;
      const length = parseFloat(u.length) || 0;
      const sqft = width * length;
      if (sqft <= 0) continue;

      // Use best available price: regularprice > onlineprice > promotionprice
      const price = parseFloat(u.regularprice) || parseFloat(u.onlineprice) || parseFloat(u.promotionprice) || 0;
      if (price <= 0) continue;

      const ratePerSf = price / sqft;
      const isCC = u.climatecontrolled === true
        || u.climatecontrolled === "true"
        || u.climatecontrolled === "1"
        || u.climatecontrolled === 1
        || (typeof u.spacetype === "string" && /climate|interior|indoor/i.test(u.spacetype));

      const unitData = { width, length, sqft, price, ratePerSf, isCC, spacetype: u.spacetype };

      allRates.push(unitData);

      // Focus on ~10x10 units (80-120 SF) for standard comparison
      if (sqft >= 80 && sqft <= 120) {
        if (isCC) {
          ccRates.push(ratePerSf);
          storeInfo.rates.cc.push(price);
        } else {
          nonCcRates.push(ratePerSf);
          storeInfo.rates.noncc.push(price);
        }
      }
    }

    facilityDetails.push(storeInfo);
  }

  const calcStats = (rates) => {
    if (!rates.length) return null;
    const sorted = [...rates].sort((a, b) => a - b);
    return {
      low: Math.round(sorted[0] * 100) / 100,
      high: Math.round(sorted[sorted.length - 1] * 100) / 100,
      median: Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100,
      avg: Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 100) / 100,
      count: sorted.length,
    };
  };

  const ccStats = calcStats(ccRates);
  const nonCcStats = calcStats(nonCcRates);

  // Convert street rates to estimated T12 achieved (street × 1.15-1.27)
  // Using 1.20 as middle estimate
  const T12_FACTOR = 1.20;

  // Use CC rates if available, otherwise fall back to non-CC
  const primaryStats = ccStats || nonCcStats;

  return {
    source: "stortrack",
    search_radius_miles: radiusMiles,
    facility_count: stores.length,
    total_units_sampled: allRates.length,
    street_rates: {
      cc_10x10: ccStats,
      noncc_10x10: nonCcStats,
    },
    estimated_t12: primaryStats ? {
      low: Math.round(primaryStats.low * T12_FACTOR * 100) / 100,
      high: Math.round(primaryStats.high * T12_FACTOR * 100) / 100,
      typical: Math.round(primaryStats.median * T12_FACTOR * 100) / 100,
    } : null,
    // For backwards compat with existing rate capping logic in validate.js
    market_rate_override: primaryStats ? {
      low: Math.round(primaryStats.low * T12_FACTOR * 100) / 100,
      high: Math.round(primaryStats.high * T12_FACTOR * 100) / 100,
      typical: Math.round(primaryStats.median * T12_FACTOR * 100) / 100,
    } : null,
    facilities: facilityDetails,
  };
}

// ── Prompt Helper ───────────────────────────────────────────────────────────

/**
 * Get rate data and format as a market rate reference for the AI prompt
 * Falls back to hardcoded REIT data if StorTrack is unavailable
 */
export async function getRateRefForPrompt(lat, lng, fallbackMetro) {
  const stortrackData = await getMarketRates(lat, lng);

  if (stortrackData.market_rate_override) {
    const r = stortrackData.market_rate_override;
    const sr = stortrackData.street_rates;

    let rateText = `LIVE MARKET DATA (StorTrack, ${stortrackData.facility_count} facilities within ${stortrackData.search_radius_miles}mi):`;
    if (sr.cc_10x10) {
      rateText += ` CC 10x10 street: $${sr.cc_10x10.low}-$${sr.cc_10x10.high}/SF/mo (median $${sr.cc_10x10.median}, ${sr.cc_10x10.count} units sampled).`;
    }
    if (sr.noncc_10x10) {
      rateText += ` Non-CC 10x10 street: $${sr.noncc_10x10.low}-$${sr.noncc_10x10.high}/SF/mo (median $${sr.noncc_10x10.median}, ${sr.noncc_10x10.count} units).`;
    }
    rateText += ` T12 achieved est: $${r.low}-$${r.high}/SF/mo (street × 1.20). Street rates are current advertised; T12 achieved typically 15-27% higher.`;

    return {
      rateText,
      marketRate: r,
      source: "stortrack",
      facilityCount: stortrackData.facility_count,
      totalUnits: stortrackData.total_units_sampled,
    };
  }

  // Fall back to hardcoded REIT data
  return {
    rateText: null, // Use default REIT text from validate.js
    marketRate: null,
    source: "reit_hardcoded",
  };
}
