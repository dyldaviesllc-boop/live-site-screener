// ── Consolidated Live Data endpoint ──────────────────────────────────────────
// Handles demographics, competitors, and data status via ?type= query param
// Consolidates 3 endpoints into 1 to stay within Vercel Hobby's 12-function limit
//
// GET /api/live-data?type=demographics&lat=X&lng=Y&radius=3
// GET /api/live-data?type=competitors&lat=X&lng=Y&radius=3
// GET /api/live-data?type=status
// GET /api/live-data?type=all&lat=X&lng=Y&radius=3

import { getTradeAreaEstimate } from "./_lib/live/census.js";
import { getEsriDemographics } from "./_lib/live/esri.js";
import { findCompetitors, estimateSfPerCapita } from "./_lib/live/google-places.js";
import { getAvailableSources, getSiteData } from "./_lib/live/index.js";

export default async function handler(req, res) {
  const type = req.query.type || "status";
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius) || 3;

  try {
    switch (type) {
      case "demographics": {
        if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });

        if (process.env.ESRI_API_KEY) {
          const esri = await getEsriDemographics(lat, lng, radius);
          if (esri?.demographics) {
            return res.json({ source: "esri", radius_miles: radius, ...esri.demographics });
          }
        }

        const census = await getTradeAreaEstimate(lat, lng, radius);
        if (census) {
          return res.json({
            source: "census_acs",
            radius_miles: radius,
            total_population: census.est_pop_trade_area || census.total_population,
            median_hhi: census.median_hhi,
            total_households: census.total_households,
            median_age: census.median_age,
            estimation_method: census.estimation_method,
          });
        }
        return res.json({ source: null, error: "No demographic data available" });
      }

      case "competitors": {
        if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
        if (!process.env.GOOGLE_PLACES_API_KEY) {
          return res.status(503).json({ error: "GOOGLE_PLACES_API_KEY not configured" });
        }

        const result = await findCompetitors(lat, lng, radius);
        const pop = parseInt(req.query.population);
        if (pop && result.total_facilities) {
          result.est_sf_per_capita = estimateSfPerCapita(result.total_facilities, pop, radius);
        }
        return res.json(result);
      }

      case "all": {
        if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
        const siteData = await getSiteData(lat, lng, "", radius);
        return res.json(siteData);
      }

      case "status":
      default: {
        const sources = getAvailableSources();
        const sourceInfo = {
          census: { name: "US Census", configured: sources.census, cost: "Free", replaces: "Population, HHI" },
          google_places: { name: "Google Places", configured: sources.google_places, cost: "~$30-80/mo", replaces: "Competitors" },
          stortrack: { name: "StorTrack", configured: sources.stortrack, cost: "$49-199/mo", replaces: "Market rates" },
          tractiq: { name: "TractIQ", configured: sources.tractiq, cost: "$159-199/mo", replaces: "Occupancy (CMBS)" },
          esri: { name: "ESRI", configured: sources.esri, cost: "Credits-based", replaces: "Enhanced demographics" },
          serpapi: { name: "SerpAPI", configured: sources.serpapi, cost: "$50/mo", replaces: "Broker search" },
        };
        const configuredCount = Object.values(sources).filter(Boolean).length;
        return res.json({
          sources: sourceInfo,
          configured_count: configuredCount,
          total_sources: Object.keys(sources).length,
          ai_still_used_for: [
            "Site scoring (1-10 across 5 dimensions)",
            "Zoning analysis and feasibility",
            !sources.stortrack && "Rate estimation",
            !sources.google_places && "Competitor identification",
            !sources.tractiq && "Occupancy estimation",
          ].filter(Boolean),
        });
      }
    }
  } catch (e) {
    console.error("Live data error:", e);
    res.status(500).json({ error: e.message });
  }
}
