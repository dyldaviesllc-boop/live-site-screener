import { MARKET_RATES } from "./prompt.js";

// Round to nearest $0.05 for realistic pricing
const round05 = v => Math.round(v * 20) / 20;

// Lookup market rate for a given metro string
function getMarketRate(metro) {
  if (!metro) return MARKET_RATES._default;
  const m = metro.toLowerCase();
  for (const [key, val] of Object.entries(MARKET_RATES)) {
    if (key === "_default") continue;
    if (m.includes(key) || key.includes(m)) return val;
  }
  return MARKET_RATES._default;
}

// ── Server-side rate validation ──────────────────────────────────────────────
function validateAndCapRates(results, liveDataMap) {
  return results.map(r => {
    const metro = r.market || "";
    let ref = getMarketRate(metro);

    // If live rates are available (StorTrack or Google Places estimated), use them
    if (liveDataMap) {
      const live = liveDataMap.get(r.address);
      if (live?.rates?.market_rate_override) {
        ref = live.rates.market_rate_override;
      }
    }

    let cc = r.est_cc_rate_psf_mo;
    let noncc = r.est_noncc_rate_psf_mo;
    let score = r.overall_score;
    let rateEnv = r.rate_environment;
    const rawFlags = r.criteria_flags;
    const flags = Array.isArray(rawFlags) ? [...rawFlags] : (typeof rawFlags === "string" ? (() => { try { return JSON.parse(rawFlags); } catch { return []; } })() : []);

    // Clamp estimated rates to market range (+30% ceiling to allow some premium)
    if (cc != null && cc > 0) {
      const maxPlausible = ref.high * 1.3;
      if (cc > maxPlausible) {
        // Over ceiling — clamp to high end of range
        const old = cc;
        cc = round05(ref.high);
        flags.push(`CC rate adjusted: $${old.toFixed(2)}→$${cc.toFixed(2)} (above market ceiling)`);
        console.log(`[rate-fix] ${r.address}: CC $${old.toFixed(2)} → $${cc.toFixed(2)} (${metro} high: $${ref.high})`);
      } else {
        // In range — just snap to $0.05 increments for realism
        cc = round05(cc);
      }
    } else {
      // No rate provided — estimate within the market range using scores as a proxy
      const locFactor = (r.location_score || 5) / 10; // 0-1 scale
      cc = round05(ref.low + (ref.high - ref.low) * locFactor);
      flags.push(`CC rate estimated from market data: $${cc.toFixed(2)}`);
    }

    if (noncc != null && noncc > 0) {
      const maxPlausible = ref.high * 1.0;
      if (noncc > maxPlausible) {
        noncc = round05(cc * 0.78);
      } else {
        noncc = round05(noncc);
      }
    } else {
      // Non-CC is typically 75-80% of CC
      noncc = round05(cc * 0.78);
    }

    // ── Rate-weighted overall score ──────────────────────────────────────────
    // Rates are the #1 factor. Compute overall as weighted blend:
    //   40% rate_environment, 20% market_score, 20% site_potential, 10% location_score, 10% competition_risk
    const re = rateEnv ?? 5;
    const ms = r.market_score ?? 5;
    const sp = r.site_potential ?? 5;
    const ls = r.location_score ?? 5;
    const cr = r.competition_risk ?? 5;
    score = Math.round(re * 0.40 + ms * 0.20 + sp * 0.20 + ls * 0.10 + cr * 0.10);
    score = Math.max(1, Math.min(10, score));

    // Hard caps based on CC rate thresholds (T12 achieved rates)
    // <$0.85→3, <$1.10→4, <$1.40→5, <$2.00→5 (feasibility floor), <$2.50→7, <$3.00→8
    if (cc < 0.85 && score > 3) {
      score = 3;
      rateEnv = Math.min(rateEnv ?? 3, 3);
      flags.push("Score capped at 3: CC T12 rate < $0.85/SF/mo");
    } else if (cc < 1.10 && score > 4) {
      score = 4;
      rateEnv = Math.min(rateEnv ?? 4, 4);
      flags.push("Score capped at 4: CC T12 rate < $1.10/SF/mo");
    } else if (cc < 1.40 && score > 5) {
      score = 5;
      rateEnv = Math.min(rateEnv ?? 5, 5);
      flags.push("Score capped at 5: CC T12 rate < $1.40/SF/mo");
    } else if (cc < 2.00 && score > 5) {
      score = 5;
      rateEnv = Math.min(rateEnv ?? 5, 5);
      flags.push("Score capped at 5: CC T12 rate below $2.00/SF/mo feasibility floor");
    } else if (cc < 2.50 && score > 7) {
      score = 7;
      rateEnv = Math.min(rateEnv ?? 7, 7);
      flags.push("Score capped at 7: CC T12 rate < $2.50/SF/mo");
    } else if (cc < 3.00 && score > 8) {
      score = 8;
      rateEnv = Math.min(rateEnv ?? 8, 8);
      flags.push("Score capped at 8: CC T12 rate < $3.00/SF/mo");
    }

    // 9-10 require elite rates ($3.00+) AND strong fundamentals across the board
    if (score >= 9) {
      const subs = [ls, ms, sp, cr, rateEnv ?? 0];
      const avg = subs.reduce((a, b) => a + b, 0) / subs.length;
      const weak = subs.filter(s => s < 7).length;

      if (score === 10 && (avg < 8.5 || weak > 0)) {
        score = 9;
        flags.push("Score reduced 10→9: not all sub-scores elite");
      }
      if (score === 9 && (avg < 7.5 || weak > 1)) {
        score = 8;
        flags.push("Score reduced 9→8: too many weak sub-scores");
      }
    }

    return {
      ...r,
      est_cc_rate_psf_mo: cc,
      est_noncc_rate_psf_mo: noncc,
      overall_score: score,
      rate_environment: rateEnv,
      criteria_flags: flags,
    };
  });
}

export { validateAndCapRates, getMarketRate };
