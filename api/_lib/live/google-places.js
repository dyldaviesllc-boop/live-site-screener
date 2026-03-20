// ── Google Places API (Nearby Search + Rate Estimation) ──────────────────────
// Pricing: $32/1000 Nearby Search requests (pay-as-you-go, no subscription)
// Console: https://console.cloud.google.com/apis/credentials
// Replaces: StorTrack for rate discovery; Claude-guessed competitor names
//
// Strategy: Google Places finds real competitors → competitor density + brand mix
// + REIT benchmarks + demographics = market rate estimate that beats pure guessing

const PLACES_BASE = "https://places.googleapis.com/v1/places:searchText";

// ── REIT Rate Benchmarks (T12 CC achieved $/SF/mo) ──────────────────────────
// Source: Yardi Matrix 2024-25, ESS/PSA/CUBE earnings. T12 in-place 15-27% above street.
const METRO_RATES = {
  "los angeles":    { low: 1.65, high: 3.00, typical: 2.30 },
  "san francisco":  { low: 1.80, high: 3.20, typical: 2.50 },
  "san jose":       { low: 1.60, high: 2.80, typical: 2.10 },
  "san diego":      { low: 1.40, high: 2.50, typical: 1.85 },
  "new york":       { low: 1.80, high: 3.50, typical: 2.60 },
  "chicago":        { low: 1.00, high: 1.80, typical: 1.35 },
  "seattle":        { low: 1.10, high: 1.90, typical: 1.45 },
  "dallas":         { low: 0.85, high: 1.50, typical: 1.10 },
  "fort worth":     { low: 0.75, high: 1.25, typical: 0.95 },
  "houston":        { low: 0.75, high: 1.30, typical: 0.95 },
  "austin":         { low: 0.85, high: 1.50, typical: 1.10 },
  "denver":         { low: 0.90, high: 1.55, typical: 1.15 },
  "phoenix":        { low: 0.80, high: 1.40, typical: 1.05 },
  "atlanta":        { low: 0.70, high: 1.25, typical: 0.90 },
  "nashville":      { low: 0.85, high: 1.40, typical: 1.05 },
  "charlotte":      { low: 0.75, high: 1.25, typical: 0.95 },
  "orlando":        { low: 0.80, high: 1.35, typical: 1.00 },
  "tampa":          { low: 0.75, high: 1.30, typical: 0.95 },
  "miami":          { low: 1.15, high: 2.10, typical: 1.55 },
  "portland":       { low: 0.85, high: 1.50, typical: 1.10 },
  "boston":          { low: 1.40, high: 2.40, typical: 1.80 },
  "washington":     { low: 1.25, high: 2.20, typical: 1.65 },
  "las vegas":      { low: 0.80, high: 1.40, typical: 1.05 },
  "salt lake":      { low: 0.80, high: 1.35, typical: 1.00 },
  "minneapolis":    { low: 0.75, high: 1.30, typical: 0.95 },
  "_default":       { low: 0.80, high: 1.50, typical: 1.10 },
};

// Premium brand operators — these charge 15-30% above market
const PREMIUM_BRANDS = [
  /extra space/i, /public storage/i, /cubesmart/i, /life storage/i,
  /iron guard/i, /storquest/i, /simply self storage/i,
];
// Mid-tier brands
const MIDTIER_BRANDS = [
  /uncle bob/i, /safeguard/i, /storage mart/i, /prime storage/i,
  /storage sense/i, /all storage/i, /move it/i,
];

/**
 * Find self-storage competitors near a location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMiles - Search radius in miles (default 3)
 * @returns {object} Competitor data with facility list
 */
export async function findCompetitors(lat, lng, radiusMiles = 3) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { error: "GOOGLE_PLACES_API_KEY not set", competitors: [] };

  const radiusMeters = Math.round(radiusMiles * 1609.34);

  try {
    // Use Text Search (searchText) — Nearby Search doesn't support "self_storage" type
    // Text Search with locationBias returns results ranked by relevance + proximity
    const resp = await fetch(PLACES_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,places.businessStatus,places.types",
      },
      body: JSON.stringify({
        textQuery: "self storage",
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusMeters,
          },
        },
        maxResultCount: 20,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.warn("[google-places] error:", resp.status, err);
      return { error: `Google Places API: ${resp.status}`, competitors: [] };
    }

    const data = await resp.json();
    const places = data.places || [];

    const allResults = places.map(p => {
      const name = p.displayName?.text || "Unknown";
      return {
        name,
        address: p.formattedAddress || null,
        lat: p.location?.latitude || null,
        lng: p.location?.longitude || null,
        rating: p.rating || null,
        review_count: p.userRatingCount || null,
        phone: p.nationalPhoneNumber || null,
        website: p.websiteUri || null,
        status: p.businessStatus || null,
        types: p.types || [],
        distance_miles: haversine(lat, lng, p.location?.latitude, p.location?.longitude),
        brand_tier: classifyBrand(name),
      };
    });

    // Filter: only keep results within the search radius (Text Search uses bias, not restriction)
    // Also filter out non-storage businesses (investment firms, etc.)
    const competitors = allResults.filter(c => {
      if (c.distance_miles == null || c.distance_miles > radiusMiles) return false;
      // Exclude businesses that aren't actual storage facilities
      const name = c.name.toLowerCase();
      if (/investor|investment|realt|consult|capital|advisor|management company/i.test(name) && c.review_count < 5) return false;
      return true;
    });

    // Sort by distance
    competitors.sort((a, b) => (a.distance_miles || 99) - (b.distance_miles || 99));

    // Calculate supply metrics
    const activeComps = competitors.filter(c => c.status !== "CLOSED_PERMANENTLY");
    const activeCount = activeComps.length;
    const ratedComps = activeComps.filter(c => c.rating);
    const avgRating = ratedComps.length
      ? Math.round(ratedComps.reduce((sum, c) => sum + c.rating, 0) / ratedComps.length * 10) / 10
      : null;

    // Brand mix analysis
    const premiumCount = activeComps.filter(c => c.brand_tier === "premium").length;
    const midtierCount = activeComps.filter(c => c.brand_tier === "midtier").length;
    const momPopCount = activeComps.filter(c => c.brand_tier === "independent").length;
    const premiumPct = activeCount > 0 ? Math.round(premiumCount / activeCount * 100) : 0;

    // Density metric: facilities per square mile in trade area
    const tradeAreaSqMi = Math.PI * radiusMiles * radiusMiles;
    const densityPerSqMi = Math.round(activeCount / tradeAreaSqMi * 100) / 100;

    // Closest competitor distance
    const closestDist = activeComps[0]?.distance_miles || null;

    return {
      source: "google_places",
      search_radius_miles: radiusMiles,
      total_facilities: competitors.length,
      active_facilities: activeCount,
      avg_rating: avgRating,
      density_per_sq_mi: densityPerSqMi,
      closest_competitor_miles: closestDist ? Math.round(closestDist * 100) / 100 : null,
      brand_mix: { premium: premiumCount, midtier: midtierCount, independent: momPopCount, premium_pct: premiumPct },
      competitors,
      // Format top 5 as "nearby_comps" string for prompt/display
      nearby_comps: competitors.slice(0, 5).map(c =>
        `${c.name} (${c.distance_miles?.toFixed(1) || "?"}mi${c.rating ? `, ${c.rating}★` : ""})`
      ).join("; ") || "None found",
    };
  } catch (e) {
    console.warn("[google-places] fetch error:", e.message);
    return { error: e.message, competitors: [] };
  }
}

/**
 * Classify a facility name into brand tier
 */
function classifyBrand(name) {
  if (PREMIUM_BRANDS.some(rx => rx.test(name))) return "premium";
  if (MIDTIER_BRANDS.some(rx => rx.test(name))) return "midtier";
  return "independent";
}

/**
 * Estimate market rates using Google Places competitor data + demographics
 * This replaces StorTrack when that API isn't available.
 *
 * Methodology:
 * 1. Start with REIT metro benchmark for the area
 * 2. Adjust based on supply density (more competitors = downward pressure)
 * 3. Adjust based on brand mix (more premium = higher market rates)
 * 4. Adjust based on demographics (higher HHI = higher rates)
 * 5. Adjust based on rating quality (higher avg rating = more competitive market)
 *
 * @param {object} competitorData - Output from findCompetitors()
 * @param {object} demographics - Census demographics { median_hhi, total_population }
 * @param {string} metro - Metro name for REIT baseline lookup
 * @returns {object} Rate estimate with source attribution
 */
export function estimateMarketRates(competitorData, demographics, metro) {
  if (!competitorData || competitorData.error) {
    return { error: "No competitor data", rates: null };
  }

  const activeCount = competitorData.active_facilities || 0;
  const radiusMiles = competitorData.search_radius_miles || 3;
  const brandMix = competitorData.brand_mix || {};
  const avgRating = competitorData.avg_rating;
  const density = competitorData.density_per_sq_mi || 0;

  // 1. Get REIT baseline for this metro
  const baseline = getMetroBaseline(metro);

  // 2. Supply density adjustment (-15% to +10%)
  //    National avg ~0.35 facilities/sq mi in 3mi radius
  //    < 0.15 = undersupplied (+10%), > 0.60 = oversupplied (-15%)
  let supplyAdj = 0;
  if (density < 0.10) supplyAdj = 0.10;       // Very undersupplied
  else if (density < 0.20) supplyAdj = 0.07;   // Undersupplied
  else if (density < 0.35) supplyAdj = 0.03;   // Slightly below avg
  else if (density < 0.50) supplyAdj = 0;       // Average
  else if (density < 0.70) supplyAdj = -0.05;   // Above avg supply
  else if (density < 1.00) supplyAdj = -0.10;   // Oversupplied
  else supplyAdj = -0.15;                        // Heavily oversupplied

  // 3. Brand mix adjustment (-5% to +10%)
  //    Markets dominated by REITs/premium brands have higher rate floors
  const premiumPct = brandMix.premium_pct || 0;
  let brandAdj = 0;
  if (premiumPct >= 60) brandAdj = 0.10;        // REIT-dominated, high rates
  else if (premiumPct >= 40) brandAdj = 0.05;   // Strong REIT presence
  else if (premiumPct >= 20) brandAdj = 0;       // Mixed market
  else if (premiumPct > 0) brandAdj = -0.03;     // Few REITs
  else brandAdj = -0.05;                          // All independent

  // 4. Demographics adjustment (-10% to +15%)
  //    Higher HHI = more willingness to pay for storage
  let demoAdj = 0;
  if (demographics?.median_hhi) {
    const hhi = demographics.median_hhi;
    if (hhi >= 120000) demoAdj = 0.15;
    else if (hhi >= 100000) demoAdj = 0.10;
    else if (hhi >= 80000) demoAdj = 0.05;
    else if (hhi >= 60000) demoAdj = 0;
    else if (hhi >= 40000) demoAdj = -0.05;
    else demoAdj = -0.10;
  }

  // 5. Competition quality adjustment (-5% to +5%)
  //    High avg rating = well-run market = higher rate support
  let qualityAdj = 0;
  if (avgRating) {
    if (avgRating >= 4.5) qualityAdj = 0.05;
    else if (avgRating >= 4.0) qualityAdj = 0.02;
    else if (avgRating >= 3.5) qualityAdj = 0;
    else qualityAdj = -0.05;
  }

  // Combine adjustments
  const totalAdj = 1 + supplyAdj + brandAdj + demoAdj + qualityAdj;
  const adjLow = round05(baseline.low * totalAdj);
  const adjHigh = round05(baseline.high * totalAdj);
  const adjTypical = round05(baseline.typical * totalAdj);

  // Non-CC is typically 75-80% of CC
  const nonccLow = round05(adjLow * 0.78);
  const nonccHigh = round05(adjHigh * 0.78);
  const nonccTypical = round05(adjTypical * 0.78);

  const adjustmentDetails = {
    supply: `${(supplyAdj * 100).toFixed(0)}% (${density.toFixed(2)}/sqmi, ${activeCount} facilities)`,
    brand: `${(brandAdj * 100).toFixed(0)}% (${premiumPct}% premium)`,
    demographics: `${(demoAdj * 100).toFixed(0)}%${demographics?.median_hhi ? ` (HHI $${demographics.median_hhi.toLocaleString()})` : ""}`,
    quality: `${(qualityAdj * 100).toFixed(0)}%${avgRating ? ` (avg ${avgRating}★)` : ""}`,
    total: `${((totalAdj - 1) * 100).toFixed(0)}%`,
  };

  console.log(`[google-places] Rate estimate: CC $${adjLow}-$${adjHigh}/SF/mo (base: ${metro || "default"}, adj: ${adjustmentDetails.total})`);

  return {
    source: "google_places_estimated",
    method: "REIT_benchmark_adjusted",
    baseline_metro: metro || "_default",
    facility_count: activeCount,
    search_radius_miles: radiusMiles,
    adjustments: adjustmentDetails,
    cc_10x10: { low: adjLow, high: adjHigh, typical: adjTypical },
    noncc_10x10: { low: nonccLow, high: nonccHigh, typical: nonccTypical },
    // For backwards compat with rate capping pipeline
    market_rate_override: { low: adjLow, high: adjHigh, typical: adjTypical },
  };
}

/**
 * Get REIT baseline rates for a metro area
 */
function getMetroBaseline(metro) {
  if (!metro) return METRO_RATES._default;
  const m = metro.toLowerCase();
  for (const [key, val] of Object.entries(METRO_RATES)) {
    if (key === "_default") continue;
    if (m.includes(key) || key.includes(m)) return val;
  }
  return METRO_RATES._default;
}

/**
 * Estimate SF per capita using competitor count and trade area population
 * National average: ~7.4 SF/capita (2024)
 * Rough heuristic: each facility ≈ 50,000-80,000 net rentable SF
 */
export function estimateSfPerCapita(competitorCount, tradeAreaPop, radiusMiles = 3) {
  if (!tradeAreaPop || tradeAreaPop <= 0) return null;
  const avgFacilitySf = 55000;
  const totalSupplySf = competitorCount * avgFacilitySf;
  return Math.round(totalSupplySf / tradeAreaPop * 100) / 100;
}

/**
 * Build rate context string for AI prompt injection
 * Replaces StorTrack's getRateRefForPrompt()
 */
export function buildRateContext(rateData, competitorData) {
  if (!rateData || rateData.error) return null;

  const parts = [];
  const cc = rateData.cc_10x10;
  const noncc = rateData.noncc_10x10;

  parts.push(`MARKET RATE ESTIMATE (${rateData.facility_count} competitors within ${rateData.search_radius_miles}mi, Google Places + REIT benchmarks):`);

  if (cc) {
    parts.push(`  CC 10x10 T12 achieved: $${cc.low}-$${cc.high}/SF/mo (typical $${cc.typical})`);
  }
  if (noncc) {
    parts.push(`  Non-CC 10x10 T12 achieved: $${noncc.low}-$${noncc.high}/SF/mo (typical $${noncc.typical})`);
  }

  if (rateData.adjustments) {
    const a = rateData.adjustments;
    parts.push(`  Adjustments: supply ${a.supply}, brand ${a.brand}, demo ${a.demographics}`);
  }

  if (competitorData?.brand_mix) {
    const bm = competitorData.brand_mix;
    if (bm.premium > 0) {
      parts.push(`  Market has ${bm.premium} REIT/premium, ${bm.midtier} mid-tier, ${bm.independent} independent operators`);
    }
  }

  return parts.join("\n");
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function round05(val) {
  return Math.round(val * 20) / 20; // Round to nearest $0.05
}

function haversine(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
