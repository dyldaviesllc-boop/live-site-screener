import supabase from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { items } = req.body;
  if (!items?.length) return res.status(400).json({ error: "No items" });

  try {
    for (const f of items) {
      const row = {
        result_id: f.result_id,
        zoning_code: f.zoning_code, zoning_desc: f.zoning_desc,
        ss_permitted: !!f.ss_permitted, ss_conditional: !!f.ss_conditional, ss_variance: !!f.ss_variance,
        zoning_path: f.zoning_path, zoning_risk: f.zoning_risk,
        parcel_acres: f.parcel_acres, parcel_sf: f.parcel_sf,
        far_limit: f.far_limit, lot_coverage_pct: f.lot_coverage_pct,
        front_setback_ft: f.front_setback_ft, side_setback_ft: f.side_setback_ft, rear_setback_ft: f.rear_setback_ft,
        max_height_ft: f.max_height_ft, max_stories: f.max_stories,
        buildable_sf: f.buildable_sf, achievable_gsf: f.achievable_gsf,
        stories_proposed: f.stories_proposed, meets_90k: !!f.meets_90k,
        development_notes: f.development_notes,
        existing_building_sf: f.existing_building_sf || null,
        conversion_complexity: f.conversion_complexity || null,
        conversion_notes: f.conversion_notes || null,
      };
      await supabase.from("feasibility").upsert(row, { onConflict: "result_id" });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("Feasibility save error:", e);
    res.status(500).json({ error: e.message });
  }
}
