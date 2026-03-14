import supabase from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("sessions")
      .select("*, results(id, overall_score)")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const sessions = data.map(s => ({
      ...s,
      result_count: s.results?.length || 0,
      avg_score: s.results?.length
        ? Math.round(s.results.reduce((a, r) => a + (r.overall_score || 0), 0) / s.results.length * 10) / 10
        : null,
      results: undefined,
    }));
    return res.json(sessions);
  }

  if (req.method === "POST") {
    const { name, criteria, results } = req.body;
    if (!results?.length) return res.status(400).json({ error: "No results" });

    // Extract addresses for re-screen fallback
    const addressesText = results.map(r => r.address).filter(Boolean).join("\n");

    // Insert session (with addresses backup)
    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .insert({ name, address_count: results.length, criteria_json: JSON.stringify(criteria), addresses_text: addressesText })
      .select()
      .single();

    if (sErr) return res.status(500).json({ error: sErr.message });

    // Insert results
    const rows = results.map(r => ({
      session_id: session.id,
      address: r.address, overall_score: r.overall_score,
      location_score: r.location_score, market_score: r.market_score,
      site_potential: r.site_potential, competition_risk: r.competition_risk,
      rate_environment: r.rate_environment,
      potential_use: r.potential_use, inferred_type: r.inferred_type,
      est_cc_rate_psf_mo: r.est_cc_rate_psf_mo, est_noncc_rate_psf_mo: r.est_noncc_rate_psf_mo,
      est_occupancy: r.est_occupancy, est_sf_per_capita: r.est_sf_per_capita,
      est_pop_trade_area: r.est_pop_trade_area, est_hhi: r.est_hhi,
      trade_area_miles: r.trade_area_miles, nearby_comps: r.nearby_comps,
      criteria_pass: r.criteria_pass, criteria_fail: r.criteria_fail,
      criteria_flags: r.criteria_flags || [],
      key_insight: r.key_insight, market: r.market,
      listing_broker: r.listing_broker || null, listing_broker_co: r.listing_broker_co || null,
      listing_broker_phone: r.listing_broker_phone || null, listing_broker_email: r.listing_broker_email || null,
      building_sf: r.building_sf || null, acreage: r.acreage || null,
      property_category: r.property_category || null,
      broker_confidence: r.broker_confidence || null, broker_enriched: !!r.broker_enriched,
    }));

    const { data: inserted, error: rErr } = await supabase.from("results").insert(rows).select("id");
    if (rErr) return res.status(500).json({ error: rErr.message });

    return res.json({ id: session.id, resultIds: inserted.map(r => r.id) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
