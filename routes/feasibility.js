import { Router } from "express";
import { db, feasStmts } from "../lib/db.js";
import { callClaude } from "../lib/claude.js";
import { geocodeAddress } from "../lib/geocode.js";
import { FEAS_SYS_PROMPT } from "../lib/prompt.js";
import { getZoningRules, getZoningRulesFromPLUTO } from "../api/_lib/live/zoning-rules.js";
import { getParcelData } from "../api/_lib/live/county-data.js";

const router = Router();

// Detect if address has a street number (exact address)
function hasStreetNumber(addr) {
  return /^\d/.test(addr.trim());
}

router.post("/feasibility", async (req, res) => {
  // Support both old {addresses:[str]} and new {sites:[{address,building_sf?,acreage?}]}
  const { sites, addresses } = req.body;
  const siteList = sites || (addresses || []).map(a => typeof a === "string" ? { address: a } : a);
  if (!siteList?.length) return res.status(400).json({ error: "No addresses" });
  if (siteList.length > 50) return res.status(400).json({ error: "Max 50 addresses per batch" });

  // Split into exact vs non-exact
  const exact = siteList.filter(s => hasStreetNumber(s.address));
  const flagged = siteList.filter(s => !hasStreetNumber(s.address));

  try {
    let apiResults = [];
    if (exact.length) {
      // ── Fetch real parcel + zoning data for each site ──────────────────
      const parcelDataMap = new Map();
      const zoningRulesMap = new Map();

      // Pipeline: overlap geocode delays with parcel fetches
      const pendingParcel = [];
      for (let i = 0; i < exact.length; i++) {
        const s = exact[i];
        const geo = await geocodeAddress(s.address);
        if (geo) {
          // Fire parcel + zoning fetch in background
          const p = (async () => {
            try {
              const pData = await getParcelData(geo.lat, geo.lng, s.address);
              if (pData && !pData.error) {
                parcelDataMap.set(s.address, pData);
                if (pData.zoning?.code) {
                  const parts = s.address.split(",").map(p => p.trim());
                  const city = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
                  const stateMatch = s.address.match(/,\s*([A-Z]{2})\s*\d{0,5}\s*$/);
                  const state = stateMatch ? stateMatch[1] : "";
                  if (pData.zoning.source === "socrata_pluto") {
                    zoningRulesMap.set(s.address, getZoningRulesFromPLUTO(pData.zoning));
                  } else {
                    const rules = await getZoningRules(pData.zoning.code, city, state, callClaude);
                    if (rules) zoningRulesMap.set(s.address, rules);
                  }
                }
              }
            } catch (e) {
              console.warn(`[feasibility] County data failed for ${s.address}:`, e.message);
            }
          })();
          pendingParcel.push(p);
        }
        // Nominatim rate limit — only delay if more addresses remain
        if (i < exact.length - 1) await new Promise(ok => setTimeout(ok, 1100));
      }
      await Promise.all(pendingParcel);

      // ── Build feasibility prompt with real data context ────────────────
      const feasLines = exact.map(s => {
        let line = s.address;
        const meta = [];

        // Use county parcel data for building_sf and acreage (real data!)
        const pData = parcelDataMap.get(s.address);
        const bldgSf = s.building_sf || pData?.parcel?.building_sf;
        const acreage = s.acreage || pData?.parcel?.lot_acres;
        const lotSf = pData?.parcel?.lot_sf;

        if (bldgSf) meta.push(`${Number(bldgSf).toLocaleString()} SF building`);
        if (acreage) meta.push(`${acreage} ac`);
        if (lotSf && !acreage) meta.push(`${lotSf.toLocaleString()} SF lot`);
        if (meta.length) line += ` [${meta.join(", ")}]`;

        // Inject real zoning rules into the prompt
        const rules = zoningRulesMap.get(s.address);
        if (rules) {
          const rParts = [];
          rParts.push(`REAL ZONING DATA (from county records + municipal code):`);
          rParts.push(`  Zoning: ${rules.zoning_code} — ${rules.zoning_desc || ""}`);
          if (rules.ss_permitted) rParts.push(`  Self-storage: PERMITTED as-of-right`);
          else if (rules.ss_conditional) rParts.push(`  Self-storage: CONDITIONAL use permit required`);
          else if (rules.ss_variance) rParts.push(`  Self-storage: VARIANCE required`);
          if (rules.zoning_path) rParts.push(`  Path: ${rules.zoning_path}`);
          if (rules.far_limit) rParts.push(`  FAR limit: ${rules.far_limit}`);
          if (rules.lot_coverage_pct) rParts.push(`  Lot coverage: ${(rules.lot_coverage_pct * 100).toFixed(0)}%`);
          if (rules.front_setback_ft) rParts.push(`  Setbacks: ${rules.front_setback_ft}ft front, ${rules.side_setback_ft}ft side, ${rules.rear_setback_ft}ft rear`);
          if (rules.max_height_ft) rParts.push(`  Max height: ${rules.max_height_ft}ft, ${rules.max_stories} stories`);
          if (rules.parking_required) rParts.push(`  Parking: ${rules.parking_required}`);
          if (rules.notes) rParts.push(`  Notes: ${rules.notes}`);
          line += `\n  ${rParts.join("\n  ")}`;
        } else if (pData?.zoning?.code) {
          line += `\n  Zoning code (from county): ${pData.zoning.code}`;
        }

        return line;
      });

      const raw = await callClaude(
        FEAS_SYS_PROMPT,
        `Feasibility for ${exact.length} sites:\n${feasLines.join("\n")}`,
        { maxTokens: Math.min(1200, 400 * exact.length) },
      );
      apiResults = raw.map(r => {
        const result = {
          ...r,
          lot_coverage_pct: r.lot_coverage_pct > 1 ? r.lot_coverage_pct / 100 : r.lot_coverage_pct,
          ss_permitted: !!r.ss_permitted,
          ss_conditional: !!r.ss_conditional,
          ss_variance: !!r.ss_variance,
          meets_90k: !!r.meets_90k,
          address_flagged: false,
        };

        // Merge real parcel data into result
        const pData = parcelDataMap.get(r.address);
        if (pData?.parcel) {
          if (pData.parcel.lot_acres) result.parcel_acres = pData.parcel.lot_acres;
          if (pData.parcel.lot_sf) result.parcel_sf = pData.parcel.lot_sf;
          result._data_source = "county_assessor";
          result._county = pData.county_name;
        }

        // Tag zoning source
        const rules = zoningRulesMap.get(r.address);
        if (rules) {
          result._zoning_source = rules._source;
          result._zoning_verified = true;
        }

        return result;
      });
    }

    // Return flagged addresses as stub results
    const flaggedResults = flagged.map(s => ({
      address: s.address,
      address_flagged: true,
      zoning_code: "N/A", zoning_desc: "No exact address — cannot verify zoning",
      ss_permitted: false, ss_conditional: false, ss_variance: false,
      zoning_path: "Exact street address required for zoning lookup",
      zoning_risk: "high",
      parcel_acres: 0, parcel_sf: 0, far_limit: 0, lot_coverage_pct: 0,
      front_setback_ft: 0, side_setback_ft: 0, rear_setback_ft: 0,
      max_height_ft: 0, max_stories: 0, buildable_sf: 0, achievable_gsf: 0,
      stories_proposed: 0, meets_90k: false,
      development_notes: "Cannot assess — no street number provided",
    }));

    res.json({ results: [...apiResults, ...flaggedResults] });
  } catch (e) {
    console.error("Feasibility error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/feasibility/save — persist feasibility results ─────────────────

router.post("/feasibility/save", (req, res) => {
  const { items } = req.body; // [{result_id, ...feasibility fields}]
  if (!items?.length) return res.status(400).json({ error: "No items" });
  db.transaction(() => {
    for (const f of items) {
      feasStmts.upsert.run(
        f.result_id, f.zoning_code, f.zoning_desc,
        f.ss_permitted ? 1 : 0, f.ss_conditional ? 1 : 0, f.ss_variance ? 1 : 0,
        f.zoning_path, f.zoning_risk,
        f.parcel_acres, f.parcel_sf, f.far_limit, f.lot_coverage_pct,
        f.front_setback_ft, f.side_setback_ft, f.rear_setback_ft,
        f.max_height_ft, f.max_stories,
        f.buildable_sf, f.achievable_gsf, f.stories_proposed,
        f.meets_90k ? 1 : 0, f.development_notes,
        f.existing_building_sf || null, f.conversion_complexity || null, f.conversion_notes || null
      );
    }
  })();
  res.json({ ok: true });
});

export default router;
