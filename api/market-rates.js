import { MARKET_RATES, getMarketRate } from "./_lib/validate.js";

export default function handler(req, res) {
  const metro = req.query.metro;
  if (metro) {
    res.json(getMarketRate(metro));
  } else {
    res.json(MARKET_RATES);
  }
}
