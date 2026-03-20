// ── Live Data Orchestrator ────────────────────────────────────────────────────
// Coordinates all live data sources and falls back gracefully when unavailable
// Import this in API endpoints instead of calling individual services directly

import { getCensusDemographics, getTradeAreaEstimate } from "./census.js";
import { findCompetitors, estimateSfPerCapita, estimateMarketRates, buildRateContext } from "./google-places.js";
import { scrapeNearbyRates, storeRateSnapshot, getT12Rates } from "./reit-scraper.js";
import { getMarketRates } from "./stortrack.js";
import { getMarketOccupancy } from "./tractiq.js";
import { getParcelData } from "./county-data.js";

/**
 * Check which live data sources are configured (have API keys)
 */
export function getAvailableSources() {
  return {
    census: true,           // Always available (free, optional key)
    county_data: true,      // Always available (free public ArcGIS APIs)
    google_places: !!process.env.GOOGLE_PLACES_API_KEY,
    stortrack: !!(process.env.STORTRACK_USERNAME && process.env.STORTRACK_PASSWORD),
    tractiq: !!process.env.TRACTIQ_API_KEY,
  };
}

/**
 * Get all available live data for a site location
 * Used by /api/screen to enrich AI prompts with real data
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} address - Full street address (needed for county parcel lookup)
 * @param {number} radiusMiles - Trade area radius
 * @returns {object} Aggregated live data from all available sources
 */
export async function getSiteData(lat, lng, address, radiusMiles = 3, db = null) {
  const sources = getAvailableSources();
  const results = { sources_used: [], sources_failed: [] };
  const t0 = Date.now();

  // ── ALL phases run in parallel for maximum speed ───────────────────────
  // Census, Google Places, County parcel all fire simultaneously.
  // REIT scraping chains off Google Places (needs competitor URLs).
  // T12 lookup runs in parallel with everything (sync SQLite query).

  // T12 history check (sync SQLite — instant, run first)
  if (db) {
    try {
      const t12 = getT12Rates(db, lat, lng, radiusMiles);
      if (t12 && !t12.insufficient_data) {
        results.t12 = t12;
        results.sources_used.push("t12_history");
      }
    } catch (e) {
      console.warn("[live-data] T12 history lookup failed:", e.message);
    }
  }

  // Fire all network requests simultaneously
  const censusPromise = getTradeAreaEstimate(lat, lng, 3).catch(e => {
    console.warn("[live-data] Census failed:", e.message);
    results.sources_failed.push("census");
    return null;
  });

  const parcelPromise = getParcelData(lat, lng, address).then(p => {
    if (p && !p.error) {
      results.parcel = p;
      results.sources_used.push("county_data");
    } else if (p?.error) {
      console.warn(`[live-data] County data: ${p.error}`);
      results.sources_failed.push("county_data");
    }
  }).catch(e => {
    console.warn("[live-data] County data failed:", e.message);
    results.sources_failed.push("county_data");
  });

  // Google Places → immediately chain REIT scraping off the result
  const competitorAndRatesPromise = sources.google_places
    ? findCompetitors(lat, lng, radiusMiles).then(async c => {
        if (!c || c.error) {
          if (c?.error) console.warn(`[live-data] Google Places: ${c.error}`);
          results.sources_failed.push("google_places");
          return;
        }
        results.competitors = c;
        results.sources_used.push("google_places");

        // Immediately start REIT scraping — don't wait for Census/County
        try {
          const scrapedRates = await scrapeNearbyRates(c, address);
          if (scrapedRates?.cc_10x10) {
            results.rates = scrapedRates;
            results.sources_used.push("reit_scraped");
            if (db) {
              try { storeRateSnapshot(db, scrapedRates, lat, lng); }
              catch (e) { console.warn("[live-data] T12 store failed:", e.message); }
            }
          }
        } catch (e) {
          console.warn("[live-data] REIT scraping failed:", e.message);
        }
      }).catch(e => {
        console.error("[live-data] Google Places error:", e.message);
        results.sources_failed.push("google_places");
      })
    : Promise.resolve();

  // StorTrack (if configured) — stored separately; merged later with priority logic
  let stortrackRates = null;
  const stortrackPromise = sources.stortrack
    ? getMarketRates(lat, lng, 5)
        .then(r => { if (r && !r.error) { stortrackRates = r; results.sources_used.push("stortrack"); } })
        .catch(e => { console.warn("[live-data] StorTrack failed:", e.message); results.sources_failed.push("stortrack"); })
    : Promise.resolve();

  // TractIQ (if configured)
  const tractiqPromise = sources.tractiq
    ? getMarketOccupancy(lat, lng, 5)
        .then(o => { results.occupancy = o; results.sources_used.push("tractiq"); })
        .catch(e => { console.warn("[live-data] TractIQ failed:", e.message); results.sources_failed.push("tractiq"); })
    : Promise.resolve();

  // Wait for Census first (needed for radius decision), then everything else
  const census = await censusPromise;
  if (census) {
    results.demographics = census;
    results.demographics_source = "census";
    results.sources_used.push("census");

    // Dynamic radius: dense urban = 3mi, suburban/rural = 5mi
    const tradeAreaSqMi = Math.PI * 3 * 3;
    const popDensity = (census.total_population || 0) / tradeAreaSqMi;
    if (popDensity < 1500 && radiusMiles <= 3) {
      radiusMiles = 5;
      console.log(`[live-data] Sparse area (${Math.round(popDensity)} ppl/sqmi) → expanding to ${radiusMiles}mi`);
      // Quick re-fetch with wider radius (Census is fast with cached FIPS)
      const wider = await getTradeAreaEstimate(lat, lng, radiusMiles).catch(() => null);
      if (wider) results.demographics = wider;
    }
  }

  results.trade_area_radius = radiusMiles;

  // Wait for all remaining parallel work
  await Promise.all([parcelPromise, competitorAndRatesPromise, stortrackPromise, tractiqPromise]);

  // ── Rate priority: REIT scraped > StorTrack > T12 history > Google Places estimated ──
  // REIT scraped rates (set during competitor scraping above) are the most accurate —
  // real in-store pricing from facility pages. If those exist, keep them.
  // Otherwise fall back through the hierarchy.
  if (!results.rates && stortrackRates) {
    // StorTrack street rates (×1.20 T12 factor already applied in parser)
    results.rates = stortrackRates;
  }
  if (!results.rates && results.t12) {
    // T12 trailing-twelve-month scraped history
    results.rates = {
      source: "t12_history",
      market_rate_override: results.t12.cc_10x10_t12 ? {
        low: results.t12.cc_10x10_t12.low,
        high: results.t12.cc_10x10_t12.high,
        typical: results.t12.cc_10x10_t12.median_psf,
      } : null,
    };
    if (!results.sources_used.includes("t12_history")) results.sources_used.push("t12_history");
  }
  if (!results.rates && results.competitors && !results.competitors.error) {
    // Google Places estimated rates (REIT benchmarks + competitor density + demographics)
    const metro = detectMetro(address);
    const rateEstimate = estimateMarketRates(results.competitors, results.demographics, metro);
    if (rateEstimate && !rateEstimate.error) {
      results.rates = rateEstimate;
      results.rate_context = buildRateContext(rateEstimate, results.competitors);
      if (!results.sources_used.includes("google_places_rates")) {
        results.sources_used.push("google_places_rates");
      }
    }
  }

  console.log(`[live-data] Done in ${Date.now() - t0}ms — sources: ${results.sources_used.join(", ")}`);

  // Compute derived metrics
  if (results.competitors?.total_facilities && results.demographics?.total_population) {
    results.est_sf_per_capita = estimateSfPerCapita(
      results.competitors.total_facilities,
      results.demographics.total_population || results.demographics.est_pop_trade_area,
      radiusMiles
    );
  }

  return results;
}

/**
 * Build a live-data context string to inject into AI screening prompts
 * This gives Claude real data to work with instead of guessing
 */
export function buildLiveDataContext(siteData) {
  const parts = [];

  if (siteData.demographics) {
    const d = siteData.demographics;
    const pop = d.total_population || d.est_pop_trade_area;
    const hhi = d.median_hhi;
    if (pop) parts.push(`Trade area population: ${pop.toLocaleString()} (${siteData.demographics_source})`);
    if (hhi) parts.push(`Median HHI: $${hhi.toLocaleString()} (${siteData.demographics_source})`);
    if (d.total_households) parts.push(`Households: ${d.total_households.toLocaleString()}`);
  }

  // Parcel data from county ArcGIS
  if (siteData.parcel?.parcel) {
    const p = siteData.parcel.parcel;
    if (p.lot_sf) parts.push(`Lot size: ${p.lot_sf.toLocaleString()} SF (${p.lot_acres ? p.lot_acres + " ac" : ""}) (${siteData.parcel.county_name})`);
    if (p.building_sf) parts.push(`Building SF: ${p.building_sf.toLocaleString()} (county assessor)`);
    if (p.year_built) parts.push(`Year built: ${p.year_built} (county assessor)`);
    if (p.owner) parts.push(`Owner: ${p.owner}`);
    if (p.land_use) parts.push(`Land use: ${p.land_use}`);
  }

  // Zoning from county data
  if (siteData.parcel?.zoning) {
    const z = siteData.parcel.zoning;
    parts.push(`Zoning: ${z.code} (${z.source})`);
    if (z.far) parts.push(`Built FAR: ${z.far}, Max FAR: ${z.max_far || "N/A"}`);
  }

  // Competitors from Google Places
  if (siteData.competitors && !siteData.competitors.error) {
    const c = siteData.competitors;
    parts.push(`Competitors within ${c.search_radius_miles}mi: ${c.total_facilities} facilities (Google Places, verified)`);
    if (c.closest_competitor_miles != null) {
      parts.push(`Closest competitor: ${c.closest_competitor_miles} mi`);
    }
    if (c.brand_mix) {
      const bm = c.brand_mix;
      parts.push(`Brand mix: ${bm.premium} REIT/premium, ${bm.midtier} mid-tier, ${bm.independent} independent`);
    }
    if (c.density_per_sq_mi) {
      parts.push(`Supply density: ${c.density_per_sq_mi} facilities/sqmi (nat'l avg ~0.35)`);
    }
    if (c.nearby_comps) parts.push(`Nearest: ${c.nearby_comps}`);
  }

  // Rate data — from REIT scraping, StorTrack, or Google Places estimation
  if (siteData.rates) {
    const src = siteData.rates.source || "estimated";

    if (src === "reit_scraped" && siteData.rates.cc_10x10) {
      // Real scraped in-store rates from REIT facility pages
      const cc = siteData.rates.cc_10x10;
      const fCount = siteData.rates.facilities_scraped?.length || "?";
      parts.push(`REAL IN-STORE CC 10x10 rates (scraped from ${fCount} REIT facility pages, ${cc.sample_count} units):`);
      parts.push(`  Median: $${cc.rate_psf}/SF/mo ($${cc.monthly}/mo)`);
      parts.push(`  Range: $${cc.low}-$${cc.high}/SF/mo`);
      if (cc.facilities) parts.push(`  Facilities: ${cc.facilities.join(", ")}`);
      parts.push(`  Weighted avg (65% CC 10x10, 35% other CC sizes): $${siteData.rates.weighted_rate_psf}/SF/mo`);
      parts.push(`  NOTE: These are IN-STORE rates, not web/promo rates. Use these for feasibility.`);
    } else if (siteData.rates.market_rate_override) {
      const r = siteData.rates.market_rate_override;
      if (src === "stortrack") {
        const sr = siteData.rates.street_rates || {};
        parts.push(`Market CC rates (StorTrack T12 est): $${r.low}-$${r.high}/SF/mo, typical $${r.typical}`);
        if (sr.cc_10x10) parts.push(`  Street CC: $${sr.cc_10x10.low}-$${sr.cc_10x10.high}/SF/mo (${sr.cc_10x10.count} units sampled)`);
      } else {
        parts.push(`Market CC rates (estimated from ${siteData.rates.facility_count || "?"} competitors + REIT benchmarks): $${r.low}-$${r.high}/SF/mo, typical $${r.typical}`);
        if (siteData.rates.adjustments) {
          parts.push(`  Rate adjustments: supply ${siteData.rates.adjustments.supply}, brand ${siteData.rates.adjustments.brand}`);
        }
      }
    }
  }

  // Rate context string (detailed, from Google Places estimation)
  if (siteData.rate_context) {
    parts.push(siteData.rate_context);
  }

  if (siteData.occupancy?.est_occupancy) {
    parts.push(`Market occupancy (CMBS): ${siteData.occupancy.est_occupancy}% (${siteData.occupancy.cmbs_facilities_sampled} facilities)`);
  }

  if (siteData.est_sf_per_capita != null) {
    parts.push(`Estimated SF/capita: ${siteData.est_sf_per_capita}`);
  }

  // Houston special case
  if (siteData.parcel?.zoning_note) {
    parts.push(`⚠ ${siteData.parcel.zoning_note}`);
  }

  if (!parts.length) return null;

  return `LIVE MARKET DATA (use these real numbers, do NOT guess these values):\n${parts.join("\n")}`;
}

/**
 * Detect metro area from address string for REIT baseline lookup
 */
function detectMetro(address) {
  if (!address) return null;
  const addr = address.toLowerCase();
  const metros = [
    "los angeles", "san francisco", "san jose", "san diego",
    "new york", "brooklyn", "queens", "bronx", "manhattan",
    "chicago", "seattle", "dallas", "fort worth", "houston",
    "austin", "san antonio", "denver", "phoenix", "scottsdale",
    "atlanta", "nashville", "charlotte", "raleigh", "orlando",
    "tampa", "miami", "portland", "boston", "washington",
    "baltimore", "las vegas", "salt lake", "minneapolis",
  ];
  // NYC boroughs → "new york"
  if (/brooklyn|queens|bronx|manhattan|staten island/.test(addr)) return "new york";
  for (const m of metros) {
    if (addr.includes(m)) return m;
  }
  return null;
}

// Re-export individual services for direct use
export { findCompetitors, getMarketRates, getMarketOccupancy, getParcelData };
