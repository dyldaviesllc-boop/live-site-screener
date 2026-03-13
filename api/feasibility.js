import { FEAS_SYS_PROMPT, callClaude } from "./_lib/validate.js";

export const config = { maxDuration: 60 };

function hasStreetNumber(addr) {
  return /^\d/.test(addr.trim());
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { sites, addresses } = req.body;
  const siteList = sites || (addresses || []).map(a => typeof a === "string" ? { address: a } : a);
  if (!siteList?.length) return res.status(400).json({ error: "No addresses" });

  const exact = siteList.filter(s => hasStreetNumber(s.address));
  const flagged = siteList.filter(s => !hasStreetNumber(s.address));

  try {
    let apiResults = [];
    if (exact.length) {
      const feasLines = exact.map(s => {
        let line = s.address;
        const meta = [];
        if (s.building_sf) meta.push(`${Number(s.building_sf).toLocaleString()} SF building`);
        if (s.acreage) meta.push(`${s.acreage} ac`);
        if (meta.length) line += ` [${meta.join(", ")}]`;
        return line;
      });
      const raw = await callClaude(
        FEAS_SYS_PROMPT,
        `Feasibility for ${exact.length} sites:\n${feasLines.join("\n")}`,
        { maxTokens: Math.min(1200, 400 * exact.length) },
      );
      apiResults = raw.map(r => ({
        ...r,
        lot_coverage_pct: r.lot_coverage_pct > 1 ? r.lot_coverage_pct / 100 : r.lot_coverage_pct,
        ss_permitted: !!r.ss_permitted,
        ss_conditional: !!r.ss_conditional,
        ss_variance: !!r.ss_variance,
        meets_90k: !!r.meets_90k,
        address_flagged: false,
      }));
    }

    const flaggedResults = flagged.map(s => ({
      address: s.address, address_flagged: true,
      zoning_code: "N/A", zoning_desc: "No exact address — cannot verify zoning",
      ss_permitted: false, ss_conditional: false, ss_variance: false,
      zoning_path: "Exact street address required for zoning lookup", zoning_risk: "high",
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
}
