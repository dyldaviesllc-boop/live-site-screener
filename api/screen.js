import { buildSysPrompt, callClaude, validateAndCapRates, matchAddress, getMarketRate } from "./_lib/validate.js";
import { getSiteData, buildLiveDataContext } from "./_lib/live/index.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { sites, addresses, criteria } = req.body;
  const siteList = sites || (addresses || []).map(a => typeof a === "string" ? { address: a } : a);
  if (!siteList?.length) return res.status(400).json({ error: "No addresses" });

  try {
    // ── Fetch live data for each site (if coordinates provided) ──────────
    const liveDataMap = new Map();
    const liveDataPromises = siteList
      .filter(s => s.lat && s.lng)
      .map(async (s) => {
        try {
          const data = await getSiteData(s.lat, s.lng, s.trade_area_miles || 3);
          liveDataMap.set(s.address, data);
        } catch (e) {
          console.warn(`Live data fetch failed for ${s.address}:`, e.message);
        }
      });
    await Promise.all(liveDataPromises);

    // ── Build site lines with live data context ──────────────────────────
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

    // ── Build system prompt (may include live rate data) ─────────────────
    const raw = await callClaude(
      buildSysPrompt(criteria),
      `Screen ${siteList.length} sites:\n${siteLines.join("\n")}`,
      { maxTokens: Math.min(3200, 400 * siteList.length) },
    );

    // ── Validate & cap rates ────────────────────────────────────────────
    // If StorTrack data is available, use live market rates for capping
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
        if (liveData.competitors) {
          r.nearby_comps = liveData.competitors.nearby_comps;
          r._competitor_count = liveData.competitors.total_facilities;
        }
        if (liveData.est_sf_per_capita != null) r.est_sf_per_capita = liveData.est_sf_per_capita;
        if (liveData.occupancy?.est_occupancy) r.est_occupancy = liveData.occupancy.est_occupancy;
      }
      return r;
    });

    res.json({ results });
  } catch (e) {
    console.error("Screen error:", e);
    res.status(500).json({ error: e.message });
  }
}
