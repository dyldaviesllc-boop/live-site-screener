import { Router } from "express";
import { db, stmts, feasStmts } from "../lib/db.js";

const router = Router();

router.get("/sessions", (req, res) => res.json(stmts.listSessions.all()));

router.get("/sessions/:id", (req, res) => {
  const session = stmts.getSession.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Not found" });
  const results = stmts.getResults.all(req.params.id);
  const feasibility = feasStmts.getByResults.all(req.params.id);
  res.json({ ...session, results, feasibility });
});

router.post("/sessions", (req, res) => {
  const { name, criteria, results } = req.body;
  if (!results?.length) return res.status(400).json({ error: "No results" });

  const { sid, resultIds } = db.transaction(() => {
    const info = stmts.insertSession.run(name, results.length, JSON.stringify(criteria));
    const sid = info.lastInsertRowid;
    const resultIds = [];
    for (const r of results) {
      const ri = stmts.insertResult.run(
        sid, r.address, r.overall_score, r.location_score, r.market_score,
        r.site_potential, r.competition_risk, r.rate_environment,
        r.potential_use, r.inferred_type,
        r.est_cc_rate_psf_mo, r.est_noncc_rate_psf_mo,
        r.est_occupancy, r.est_sf_per_capita, r.est_pop_trade_area, r.est_hhi,
        r.trade_area_miles, r.nearby_comps, r.criteria_pass, r.criteria_fail,
        JSON.stringify(r.criteria_flags || []), r.key_insight, r.market,
        r.listing_broker || null, r.listing_broker_co || null,
        r.listing_broker_phone || null, r.listing_broker_email || null,
        r.building_sf || null, r.acreage || null, r.property_category || null,
        r.broker_confidence || null, r.broker_enriched ? 1 : 0
      );
      resultIds.push(Number(ri.lastInsertRowid));
    }
    return { sid, resultIds };
  })();

  res.json({ id: sid, resultIds });
});

router.delete("/sessions/:id", (req, res) => {
  stmts.deleteSession.run(req.params.id);
  res.json({ ok: true });
});

export default router;
