// ── TractIQ API ──────────────────────────────────────────────────────────────
// Pricing: $159-199/month
// Replaces: Claude-guessed occupancy percentages
// Data: Real occupancy from CMBS servicer reports for facilities with CMBS loans
// Coverage: ~20-30% of self-storage facilities (those with CMBS loans)
// Note: API docs not yet available — this is a stub awaiting TractIQ access

/**
 * Get CMBS occupancy data for self-storage facilities near a location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMiles - Search radius
 * @returns {object} Occupancy data
 */
export async function getCmbsOccupancy(lat, lng, radiusMiles = 5) {
  const apiKey = process.env.TRACTIQ_API_KEY;
  if (!apiKey) return { error: "TRACTIQ_API_KEY not set", occupancy: null };

  try {
    // TractIQ API endpoint — PLACEHOLDER, update when API docs are available
    // Possible endpoints based on typical CMBS data APIs:
    //   GET /api/v1/facilities?lat=X&lng=Y&radius=Z
    //   GET /api/v1/occupancy?address=X
    //   GET /api/v1/market-stats?lat=X&lng=Y

    const url = new URL("https://api.tractiq.com/v1/facilities"); // Placeholder
    url.searchParams.set("lat", lat);
    url.searchParams.set("lng", lng);
    url.searchParams.set("radius_miles", radiusMiles);
    url.searchParams.set("property_type", "self_storage");

    const resp = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return { error: `TractIQ API: ${resp.status}`, occupancy: null };
    }

    const data = await resp.json();
    return parseTractIqResponse(data, radiusMiles);
  } catch (e) {
    console.warn("TractIQ API error:", e.message);
    return { error: e.message, occupancy: null };
  }
}

/**
 * Parse TractIQ response — adjust when actual API schema is known
 */
function parseTractIqResponse(data, radiusMiles) {
  const facilities = data.facilities || data.results || [];

  if (!facilities.length) {
    return { source: "tractiq", occupancy: null, facilities: [] };
  }

  const occupancies = facilities
    .map(f => f.occupancy || f.physical_occupancy || f.economic_occupancy)
    .filter(o => o != null && o > 0 && o <= 100);

  if (!occupancies.length) {
    return { source: "tractiq", occupancy: null, facilities };
  }

  occupancies.sort((a, b) => a - b);
  const avg = occupancies.reduce((a, b) => a + b, 0) / occupancies.length;

  return {
    source: "tractiq",
    search_radius_miles: radiusMiles,
    cmbs_facility_count: facilities.length,
    occupancy: {
      avg: Math.round(avg * 10) / 10,
      low: occupancies[0],
      high: occupancies[occupancies.length - 1],
      median: occupancies[Math.floor(occupancies.length / 2)],
      count: occupancies.length,
    },
    // Individual facility data
    facilities: facilities.map(f => ({
      name: f.name || f.facility_name || "Unknown",
      address: f.address || null,
      occupancy: f.occupancy || f.physical_occupancy || null,
      loan_balance: f.loan_balance || null,
      reporting_date: f.reporting_date || f.as_of_date || null,
    })),
  };
}

/**
 * Get market occupancy estimate combining TractIQ + any other sources
 * Returns a confidence-weighted occupancy for the trade area
 */
export async function getMarketOccupancy(lat, lng, radiusMiles = 5) {
  const cmbs = await getCmbsOccupancy(lat, lng, radiusMiles);

  if (cmbs.occupancy) {
    return {
      est_occupancy: cmbs.occupancy.avg,
      occupancy_source: "tractiq_cmbs",
      occupancy_confidence: "high",
      cmbs_facilities_sampled: cmbs.occupancy.count,
      note: `Based on ${cmbs.occupancy.count} CMBS-loan facilities within ${radiusMiles}mi. CMBS facilities tend to be larger/more established — actual market avg may differ.`,
    };
  }

  // No TractIQ data available — return null to let AI estimate
  return {
    est_occupancy: null,
    occupancy_source: null,
    occupancy_confidence: null,
    note: "No CMBS occupancy data available for this trade area",
  };
}
