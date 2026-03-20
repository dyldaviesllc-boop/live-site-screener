import { Router } from "express";
import { db, brokerStmts } from "../lib/db.js";
import { rl } from "../lib/claude.js";
import { geocodeAddress } from "../lib/geocode.js";
import { MARKET_RATES } from "../lib/prompt.js";
import { getMarketRate } from "../lib/rates.js";
import { getSiteData, getAvailableSources } from "../api/_lib/live/index.js";

const router = Router();

// ── GET /api/live-data — consolidated live data endpoint for testing ──────────
router.get("/live-data", async (req, res) => {
  const { type, address, lat, lng, radius } = req.query;
  if (type === "status") return res.json(getAvailableSources());
  if (!lat || !lng) {
    if (address) {
      const geo = await geocodeAddress(address);
      if (!geo) return res.status(400).json({ error: "Could not geocode address" });
      const data = await getSiteData(geo.lat, geo.lng, address, parseFloat(radius) || 3, db);
      return res.json(data);
    }
    return res.status(400).json({ error: "Provide lat+lng or address" });
  }
  const data = await getSiteData(parseFloat(lat), parseFloat(lng), address || "", parseFloat(radius) || 3, db);
  res.json(data);
});

// ── GET /api/live-status — check which live data sources are configured ──────
router.get("/live-status", (req, res) => {
  res.json(getAvailableSources());
});

// ── GET /api/rate-status ─────────────────────────────────────────────────────
router.get("/rate-status", (req, res) => {
  res.json({ rem: rl.rem, remTok: rl.remTok, inflight: rl.inflight, queued: rl.queue.length, gap: rl.gap, throttled: rl.rem <= 8 || rl.remTok <= 20000 });
});

// ── GET /api/market-rates — return reference rate data ──────────────────────
router.get("/market-rates", (req, res) => {
  const metro = req.query.metro;
  if (metro) {
    res.json(getMarketRate(metro));
  } else {
    res.json(MARKET_RATES);
  }
});

// ── GET /api/results/search ──────────────────────────────────────────────────
router.get("/results/search", (req, res) => res.json(brokerStmts.searchResults.all()));

export default router;
