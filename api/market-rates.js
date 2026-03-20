import { MARKET_RATES, getMarketRate } from "./_lib/validate.js";
import { getMarketRates as getStorTrackRates } from "./_lib/live/stortrack.js";

export default async function handler(req, res) {
  const metro = req.query.metro;
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  // If lat/lng provided and StorTrack is configured, return live rates
  if (lat && lng && process.env.STORTRACK_API_KEY) {
    try {
      const liveRates = await getStorTrackRates(lat, lng, 5);
      if (liveRates.market_rate_override) {
        return res.json({
          ...liveRates.market_rate_override,
          source: "stortrack",
          facility_count: liveRates.facility_count,
          street_rates: liveRates.street_rates,
        });
      }
    } catch (e) {
      console.warn("StorTrack fallback to REIT data:", e.message);
    }
  }

  // Fallback to hardcoded REIT data
  if (metro) {
    res.json({ ...getMarketRate(metro), source: "reit_hardcoded" });
  } else {
    res.json(MARKET_RATES);
  }
}
