import { Router } from "express";
import { db } from "../lib/db.js";
import { callClaude } from "../lib/claude.js";
import { geocodeAddress } from "../lib/geocode.js";
import { buildSysPrompt, matchAddress } from "../lib/prompt.js";
import { validateAndCapRates } from "../lib/rates.js";
import { getSiteData, buildLiveDataContext, getAvailableSources } from "../api/_lib/live/index.js";

const router = Router();

router.post("/screen", async (req, res) => {
  // Support both old {addresses:[str]} and new {sites:[{address,building_sf?,acreage?}]}
  const { sites, addresses, criteria } = req.body;
  const siteList = sites || (addresses || []).map(a => typeof a === "string" ? { address: a } : a);
  if (!siteList?.length) return res.status(400).json({ error: "No addresses" });
  if (siteList.length > 50) return res.status(400).json({ error: "Max 50 addresses per batch" });
  try {
    // ── Geocode all addresses + fetch live data in parallel ──────────────
    const liveDataMap = new Map();
    const sources = getAvailableSources();
    const hasLiveSources = sources.census || sources.county_data || sources.google_places || sources.stortrack || sources.tractiq;

    if (hasLiveSources) {
      // Geocode sequentially (Nominatim 1 req/sec policy) then fetch live data
      // Pipeline: overlap geocode delays with live data fetches for speed
      // While live data fetches for addr N, we wait the Nominatim delay and geocode addr N+1
      const pendingLiveData = [];
      for (let i = 0; i < siteList.length; i++) {
        const s = siteList[i];
        const geo = await geocodeAddress(s.address);
        if (geo) {
          // Fire live data fetch WITHOUT awaiting — let it run in background
          const radius = s.trade_area_miles || 3;
          const p = getSiteData(geo.lat, geo.lng, s.address, radius, db)
            .then(data => {
              liveDataMap.set(s.address, data);
              console.log(`[live-data] ${s.address}: ${data.sources_used.join(", ")}`);
            })
            .catch(e => console.warn(`[live-data] Failed for ${s.address}:`, e.message));
          pendingLiveData.push(p);
        }
        // Nominatim rate limit: 1 req/sec — only delay if more addresses remain
        if (i < siteList.length - 1) await new Promise(ok => setTimeout(ok, 1100));
      }
      // Wait for all live data fetches to complete
      await Promise.all(pendingLiveData);
    }

    // ── Build user message with building metadata + live data context ────
    const siteLines = siteList.map(s => {
      let line = s.address;
      const meta = [];
      if (s.building_sf) meta.push(`${Number(s.building_sf).toLocaleString()} SF building`);
      if (s.acreage) meta.push(`${s.acreage} ac`);
      if (meta.length) line += ` [${meta.join(", ")}]`;

      // Append live data context per site
      const liveData = liveDataMap.get(s.address);
      if (liveData) {
        const ctx = buildLiveDataContext(liveData);
        if (ctx) line += `\n  ${ctx.replace(/\n/g, "\n  ")}`;
      }
      return line;
    });

    const raw = await callClaude(
      buildSysPrompt(criteria),
      `Screen ${siteList.length} sites:\n${siteLines.join("\n")}`,
      { maxTokens: Math.min(3200, 400 * siteList.length) },
    );

    // ── Validate & cap rates (with live StorTrack data if available) ─────
    const results = validateAndCapRates(raw, liveDataMap).map(r => {
      const src = matchAddress(r.address, siteList);
      if (src) {
        if (src.building_sf) r.building_sf = src.building_sf;
        else if (r.building_sf && r.building_sf > 500_000) r.building_sf = null;
        if (src.acreage) r.acreage = src.acreage;
        else if (r.acreage && r.acreage > 200) r.acreage = null;
      } else {
        if (r.building_sf && r.building_sf > 500_000) r.building_sf = null;
        if (r.acreage && r.acreage > 200) r.acreage = null;
      }

      // Merge live data into result for frontend display
      const liveData = liveDataMap.get(r.address);
      if (liveData) {
        r._live_sources = liveData.sources_used;
        // Override AI guesses with live data where available
        if (liveData.demographics) {
          const d = liveData.demographics;
          if (d.total_population || d.est_pop_trade_area) r.est_pop_trade_area = d.total_population || d.est_pop_trade_area;
          if (d.median_hhi) r.est_hhi = d.median_hhi;
        }
        if (liveData.competitors && !liveData.competitors.error) {
          r.nearby_comps = liveData.competitors.nearby_comps;
          r._competitor_count = liveData.competitors.total_facilities;
          r._competitor_density = liveData.competitors.density_per_sq_mi;
          r._closest_competitor = liveData.competitors.closest_competitor_miles;
          if (liveData.competitors.brand_mix) r._brand_mix = liveData.competitors.brand_mix;
        }
        // Merge rate data source info
        if (liveData.rates) {
          r._rate_source = liveData.rates.source || "estimated";
          if (liveData.rates.market_rate_override) {
            r._rate_range = liveData.rates.market_rate_override;
          }
          // Scraped REIT rates — override AI rate guesses with real data
          if (liveData.rates.source === "reit_scraped" && liveData.rates.cc_10x10) {
            r._rate_source = "reit_scraped";
            r._rate_range = liveData.rates.market_rate_override;
            r._scraped_facilities = liveData.rates.facilities_scraped?.length || 0;
            r._scraped_units = liveData.rates.total_units_scraped || 0;
            r._scraped_cc_10x10 = liveData.rates.cc_10x10;
            r._scraped_weighted = liveData.rates.weighted_rate_psf;
          }
        }
        if (liveData.est_sf_per_capita != null) r.est_sf_per_capita = liveData.est_sf_per_capita;
        if (liveData.occupancy?.est_occupancy) r.est_occupancy = liveData.occupancy.est_occupancy;
        // Merge county parcel data
        if (liveData.parcel?.parcel) {
          const p = liveData.parcel.parcel;
          if (p.building_sf && !r.building_sf) r.building_sf = p.building_sf;
          if (p.lot_acres && !r.acreage) r.acreage = p.lot_acres;
          if (p.zoning) r._zoning_code = p.zoning;
          if (p.land_use) r._land_use = p.land_use;
          if (p.owner) r._owner = p.owner;
          r._county = liveData.parcel.county_name;
        }
        if (liveData.parcel?.zoning) {
          r._zoning_code = liveData.parcel.zoning.code;
          r._zoning_source = liveData.parcel.zoning.source;
        }
      }
      return r;
    });

    res.json({ results, sources: Object.fromEntries(Object.entries(getAvailableSources()).filter(([,v]) => v)) });
  } catch (e) {
    console.error("Screen error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
