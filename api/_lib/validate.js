// ── Market Rate Reference (REIT 10x10 CC T12/achieved rates, $/SF/mo) ────────
export const MARKET_RATES = {
  "los angeles":    { low: 1.65, high: 3.00, typical: 2.30 },
  "san francisco":  { low: 1.80, high: 3.20, typical: 2.50 },
  "san jose":       { low: 1.60, high: 2.80, typical: 2.10 },
  "oakland":        { low: 1.50, high: 2.60, typical: 1.95 },
  "san diego":      { low: 1.40, high: 2.50, typical: 1.85 },
  "new york":       { low: 1.80, high: 3.50, typical: 2.60 },
  "long island":    { low: 1.50, high: 2.80, typical: 2.00 },
  "chicago":        { low: 1.00, high: 1.80, typical: 1.35 },
  "seattle":        { low: 1.10, high: 1.90, typical: 1.45 },
  "tacoma":         { low: 0.85, high: 1.50, typical: 1.10 },
  "puyallup":       { low: 0.75, high: 1.30, typical: 1.00 },
  "dallas":         { low: 0.85, high: 1.50, typical: 1.10 },
  "fort worth":     { low: 0.75, high: 1.25, typical: 0.95 },
  "dfw":            { low: 0.80, high: 1.40, typical: 1.05 },
  "arlington":      { low: 0.80, high: 1.30, typical: 1.00 },
  "frisco":         { low: 0.75, high: 1.20, typical: 0.90 },
  "mckinney":       { low: 0.70, high: 1.10, typical: 0.85 },
  "wylie":          { low: 0.65, high: 1.05, typical: 0.80 },
  "prosper":        { low: 0.70, high: 1.10, typical: 0.85 },
  "houston":        { low: 0.75, high: 1.30, typical: 0.95 },
  "san antonio":    { low: 0.65, high: 1.15, typical: 0.85 },
  "austin":         { low: 0.85, high: 1.50, typical: 1.10 },
  "denver":         { low: 0.90, high: 1.55, typical: 1.15 },
  "colorado springs": { low: 0.75, high: 1.30, typical: 0.95 },
  "phoenix":        { low: 0.80, high: 1.40, typical: 1.05 },
  "scottsdale":     { low: 0.90, high: 1.55, typical: 1.15 },
  "atlanta":        { low: 0.70, high: 1.25, typical: 0.90 },
  "nashville":      { low: 0.85, high: 1.40, typical: 1.05 },
  "charlotte":      { low: 0.75, high: 1.25, typical: 0.95 },
  "raleigh":        { low: 0.70, high: 1.20, typical: 0.90 },
  "orlando":        { low: 0.80, high: 1.35, typical: 1.00 },
  "tampa":          { low: 0.75, high: 1.30, typical: 0.95 },
  "miami":          { low: 1.15, high: 2.10, typical: 1.55 },
  "minneapolis":    { low: 0.75, high: 1.30, typical: 0.95 },
  "portland":       { low: 0.85, high: 1.50, typical: 1.10 },
  "boston":          { low: 1.40, high: 2.40, typical: 1.80 },
  "washington dc":  { low: 1.25, high: 2.20, typical: 1.65 },
  "baltimore":      { low: 0.95, high: 1.60, typical: 1.20 },
  "las vegas":      { low: 0.80, high: 1.40, typical: 1.05 },
  "salt lake":      { low: 0.80, high: 1.35, typical: 1.00 },
  "huntsville":     { low: 0.65, high: 1.10, typical: 0.80 },
  "_default":       { low: 0.80, high: 1.50, typical: 1.10 },
};

export function getMarketRate(metro) {
  if (!metro) return MARKET_RATES._default;
  const m = metro.toLowerCase();
  for (const [key, val] of Object.entries(MARKET_RATES)) {
    if (key === "_default") continue;
    if (m.includes(key) || key.includes(m)) return val;
  }
  return MARKET_RATES._default;
}

const RATE_REF_TEXT = `RATE DATA PRIORITY: If "LIVE MARKET DATA" is provided below a site address, use those real numbers — they come from live APIs (REIT facility scraping, StorTrack, Census, county GIS). Only fall back to these static benchmarks for sites WITHOUT live data.
Static REIT benchmarks (T12 CC $/SF/mo, low–high): LA:1.65–3.00 SF:1.80–3.20 SJ:1.60–2.80 SD:1.40–2.50 NYC:1.80–3.50 BOS:1.40–2.40 DC:1.25–2.20 MIA:1.15–2.10 CHI:1.00–1.80 SEA:1.10–1.90 DEN:0.90–1.55 DAL:0.85–1.50 FTW:0.75–1.25 HOU:0.75–1.30 PHX:0.80–1.40 ATL:0.70–1.25 NSH:0.85–1.40 CLT:0.75–1.25 Natl:0.80–1.50. T12=15-27% above street.
IMPORTANT: Vary rates per site using $0.05 increments — consider submarket quality, traffic, demographics, competition density, and property specifics. Do NOT give every site in a market the same rate. Premium locations get higher rates; weaker locations get lower.`;

export function critText(criteria) {
  return Object.entries(criteria)
    .filter(([, c]) => c.enabled)
    .map(([, c]) => `- ${c.label}: ${c.op} ${c.value}${c.unit ? " " + c.unit : ""}`)
    .join("\n");
}

export function buildSysPrompt(criteria) {
  return `SS screener. Sub-scores 1-10, overall computed server-side as: 40% rate_environment + 20% market_score + 20% site_potential + 10% location_score + 10% competition_risk. Hard caps: CC<$2.00→max 5, CC<$1.40→max 5, CC<$1.10→max 4, CC<$0.85→max 3.
Rates=T12 $/SF/mo 10x10 CC (NOT promo). Trade:3mi sub,5mi rural. 8+SF/cap=oversupply. rate_environment is the MOST important sub-score — base it on actual CC rate vs market benchmarks.
CONVERSION: If [building SF] provided, evaluate for SS conversion. Industrial w/ 18ft+ clear height & clear span = ideal (+2 site_potential). Office/retail harder (floor loads, ceiling height, column spacing). property_category: "land" if vacant, "conversion" if existing building for SS reuse.
${RATE_REF_TEXT}
${critText(criteria)}
JSON array ONLY:[{"address":"…","overall_score":N,"location_score":N,"market_score":N,"site_potential":N,"competition_risk":N,"rate_environment":N,"potential_use":"Self-Storage|Either|Unlikely","inferred_type":"Land|Industrial|Office|Retail/Big Box|Highway Frontage|Commercial|Other","property_category":"land|conversion","building_sf":N or null,"acreage":N or null,"est_cc_rate_psf_mo":N,"est_occupancy":N,"est_sf_per_capita":N,"est_pop_trade_area":N,"est_hhi":N,"trade_area_miles":N,"nearby_comps":"2-3 comps","criteria_pass":N,"criteria_fail":N,"criteria_flags":["…"],"key_insight":"1 sent","market":"metro"}]`;
}

export const FEAS_SYS_PROMPT = `SS zoning+dev feasibility. RULES: lot_coverage_pct=decimal(0.50 not 65). Typical lot coverage 40-60%, use 50% default. FAR commercial/industrial: 0.5-2.0. Zoning paths: ~20% permitted, ~60% conditional, ~20% variance nationally. Typical setbacks: 20-30ft front, 10-15ft side, 15-20ft rear. Max height 35-55ft typical SS (3-4 stories indoor, 1 story drive-up). meets_90k=achievable_gsf>=90000.
CRITICAL ZONING RULE: Self-storage is NEVER permitted or conditional in residential zones (R-1, R-2, R-3, RE, RA, RS, RD, RW, etc.). If a site is in a residential zone, set ss_permitted=false, ss_conditional=false, ss_variance=true, zoning_risk="high". Residential listings (homes, apartments, condos) are NOT viable for SS development.
CONVERSION: If [building SF] provided, this is a conversion site. existing_building_sf=current building. Conversion achievable_gsf=existing_building_sf×efficiency(0.85-0.95 industrial, 0.70-0.80 office/retail). Industrial clear-span 18ft+→mezzanine potential (1.5-2x floor area). conversion_complexity: "low"=industrial clear-span, "medium"=retail/big-box, "high"=office multi-floor. For land sites, use ground-up buildout logic and leave conversion fields null.
JSON array ONLY:
[{"address":"…","zoning_code":"XX","zoning_desc":"short","ss_permitted":bool,"ss_conditional":bool,"ss_variance":bool,"zoning_path":"path+timeline","zoning_risk":"high|medium|low","parcel_acres":N,"parcel_sf":N,"far_limit":N,"lot_coverage_pct":0.50,"front_setback_ft":N,"side_setback_ft":N,"rear_setback_ft":N,"max_height_ft":N,"max_stories":N,"buildable_sf":N,"achievable_gsf":N,"stories_proposed":3,"meets_90k":bool,"development_notes":"1 sentence","existing_building_sf":N or null,"conversion_complexity":"low|medium|high" or null,"conversion_notes":"1 sentence or null"}]`;

export const BROKER_SYS_PROMPT = `CRE broker recommendation specialist. For each commercial property address, identify the BEST individual broker to contact about this property.
Use your knowledge of the CRE market to recommend the most active and relevant broker for each property based on location, property type, and market.
Major national firms by specialty: Industrial/Logistics → Lee & Associates, CBRE Industrial, Colliers Industrial. Self-Storage → Cushman & Wakefield Self-Storage, Argus Self Storage, Marcus & Millichap. Land → CBRE Land, Colliers Land, local land specialists. Office → JLL, CBRE, Cushman & Wakefield.

CRITICAL NAME RULES:
- listing_broker MUST be a REAL individual person's full name (first + last). NOT a team, group, division, or department.
- INVALID names (use null instead): "CBRE Industrial Team", "Lee & Associates LA", "Self-Storage Advisory Group", "Capital Markets Division", "Investment Sales Team", anything ending in "Team", "Group", "Division", "Advisory", "Services", "Department".
- VALID names: "John Smith", "Michael Chen", "Sarah Johnson" — real first + last names of actual CRE brokers.
- If you don't know a specific individual, set listing_broker to null and put the firm in listing_broker_co. Do NOT fabricate names.

CONTACT INFO RULES:
- listing_broker_phone: ALWAYS provide a phone number. If you know the broker's direct line, use it. Otherwise provide the firm's main local office number for that market (e.g. Lee & Associates Inland Empire office). Format: (XXX) XXX-XXXX.
- listing_broker_email: ALWAYS provide an email. If you know the broker's email, use it. If you have the broker's name, construct it as firstname.lastname@firm.com (e.g. john.smith@lee-associates.com). If no individual, use the firm's general contact (e.g. info@lee-associates.com).

Use regional knowledge — e.g. Lee & Associates dominates SoCal industrial, Marcus & Millichap is strong for investment sales.
Never return "Unknown". If you know a specific broker name, use it with high confidence. If you only know the firm, set listing_broker to null and put the firm name in listing_broker_co with medium confidence.
JSON array ONLY:[{"address":"…","listing_broker":"individual person name or null","listing_broker_co":"firm name","listing_broker_phone":"(XXX) XXX-XXXX","listing_broker_email":"email@firm.com","confidence":"high|medium|low","reasoning":"1 sentence why this broker/firm"}]`;

// ── Shared Anthropic caller ──────────────────────────────────────────────────

// Simple per-invocation rate state (no cross-invocation persistence in serverless)
const rl = {
  rem: 50, remTok: 80000, last: 0, gap: 800,

  update(h) {
    const rr = h.get("x-ratelimit-remaining-requests");
    const rt = h.get("x-ratelimit-remaining-tokens");
    if (rr != null) this.rem = parseInt(rr, 10);
    if (rt != null) this.remTok = parseInt(rt, 10);
    this.gap = this.rem <= 3 || this.remTok <= 5000 ? 12000
      : this.rem <= 8 || this.remTok <= 12000 ? 4000
      : this.rem <= 20 ? 1200 : 600;
  },

  async acquire() {
    const elapsed = Date.now() - this.last;
    if (elapsed < this.gap)
      await new Promise(ok => setTimeout(ok, this.gap - elapsed));
    this.last = Date.now();
  },
};

export async function callClaude(system, userMsg, { maxTokens = 2048 } = {}, attempt = 0) {
  const MAX_RETRIES = 4;
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  await rl.acquire();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-beta": "prompt-caching-2024-07-31" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: userMsg }] }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (attempt < MAX_RETRIES) {
      const wait = (2 ** attempt) * 3000;
      await new Promise(ok => setTimeout(ok, wait));
      return callClaude(system, userMsg, { maxTokens }, attempt + 1);
    }
    throw err;
  }
  clearTimeout(timer);
  rl.update(r.headers);

  if ((r.status === 429 || r.status === 529) && attempt < MAX_RETRIES) {
    const retryAfter = parseInt(r.headers.get("retry-after") || "0", 10);
    const wait = Math.max(retryAfter * 1000, (2 ** attempt) * 5000, 10000);
    await new Promise(ok => setTimeout(ok, wait));
    return callClaude(system, userMsg, { maxTokens }, attempt + 1);
  }

  const data = await r.json();
  if (data.error) throw new Error(data.error.message || "API error");

  const txt = (data.content || []).filter(b => b.type === "text").map(b => b.text || "").join("");
  const clean = txt.replace(/```json|```/g, "").trim();

  function repairJSON(s) {
    return s
      .replace(/:\s*([A-Za-z][A-Za-z0-9\-\/]+)\s*([,}])/g, (_, v, end) => {
        if (/^(true|false|null)$/i.test(v)) return `: ${v.toLowerCase()}${end}`;
        return `: "${v}"${end}`;
      })
      .replace(/,\s*([}\]])/g, "$1");
  }

  function tryParse(s) {
    try { return JSON.parse(s); } catch {}
    try { return JSON.parse(repairJSON(s)); } catch {}
    return null;
  }

  const match = clean.match(/\[[\s\S]*\]/);
  if (match) { const parsed = tryParse(match[0]); if (parsed) return parsed; }

  const arrStart = clean.indexOf("[");
  if (arrStart >= 0) {
    let partial = clean.slice(arrStart);
    const lastBrace = partial.lastIndexOf("}");
    if (lastBrace > 0) {
      partial = partial.slice(0, lastBrace + 1) + "]";
      const parsed = tryParse(partial);
      if (parsed) return parsed;
    }
  }

  const parsed = tryParse(clean);
  if (parsed) return parsed;

  const objMatches = clean.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
  if (objMatches?.length) {
    const items = objMatches.map(m => tryParse(m)).filter(Boolean);
    if (items.length) return items;
  }

  const lines = clean.split("\n").map(l => l.trim()).filter(l => l.startsWith("{"));
  if (lines.length) {
    const items = lines.map(l => tryParse(l)).filter(Boolean);
    if (items.length) return items;
  }

  throw new Error("Failed to parse API response as JSON");
}

// ── Rate validation ──────────────────────────────────────────────────────────

const round05 = v => Math.round(v * 20) / 20;

export function matchAddress(resultAddr, siteList) {
  return siteList.find(s => s.address && resultAddr && (
    resultAddr.toLowerCase().includes(s.address.toLowerCase().split(",")[0]) ||
    s.address.toLowerCase().includes(resultAddr.toLowerCase().split(",")[0])
  ));
}

export function validateAndCapRates(results, liveDataMap) {
  return results.map(r => {
    const metro = r.market || "";
    let ref = getMarketRate(metro);

    // If StorTrack live rates are available for this address, use them
    if (liveDataMap) {
      const live = liveDataMap.get(r.address);
      if (live?.rates?.cc_low && live?.rates?.cc_high) {
        ref = { low: live.rates.cc_low, high: live.rates.cc_high };
      }
    }

    let cc = r.est_cc_rate_psf_mo;
    let noncc = r.est_noncc_rate_psf_mo;
    let score = r.overall_score;
    let rateEnv = r.rate_environment;
    const rawFlags = r.criteria_flags;
    const flags = Array.isArray(rawFlags) ? [...rawFlags] : (typeof rawFlags === "string" ? (() => { try { return JSON.parse(rawFlags); } catch { return []; } })() : []);

    if (cc != null && cc > 0) {
      const maxPlausible = ref.high * 1.3;
      if (cc > maxPlausible) {
        const old = cc;
        cc = round05(ref.high);
        flags.push(`CC rate adjusted: $${old.toFixed(2)}→$${cc.toFixed(2)} (above market ceiling)`);
      } else {
        cc = round05(cc);
      }
    } else {
      const locFactor = (r.location_score || 5) / 10;
      cc = round05(ref.low + (ref.high - ref.low) * locFactor);
      flags.push(`CC rate estimated from market data: $${cc.toFixed(2)}`);
    }

    if (noncc != null && noncc > 0) {
      if (noncc > ref.high) noncc = round05(cc * 0.78);
      else noncc = round05(noncc);
    } else {
      noncc = round05(cc * 0.78);
    }

    // Rate-weighted overall: 40% rates, 20% market, 20% site, 10% location, 10% competition
    const re = rateEnv || 5;
    const ms = r.market_score || 5;
    const sp = r.site_potential || 5;
    const ls = r.location_score || 5;
    const cr = r.competition_risk || 5;
    score = Math.round(re * 0.40 + ms * 0.20 + sp * 0.20 + ls * 0.10 + cr * 0.10);
    score = Math.max(1, Math.min(10, score));

    // Hard caps: <$0.85→3, <$1.10→4, <$1.40→5, <$2.00→5, <$2.50→7, <$3.00→8
    if (cc < 0.85 && score > 3) { score = 3; rateEnv = Math.min(rateEnv || 3, 3); flags.push("Score capped at 3: CC rate < $0.85/SF/mo"); }
    else if (cc < 1.10 && score > 4) { score = 4; rateEnv = Math.min(rateEnv || 4, 4); flags.push("Score capped at 4: CC rate < $1.10/SF/mo"); }
    else if (cc < 1.40 && score > 5) { score = 5; rateEnv = Math.min(rateEnv || 5, 5); flags.push("Score capped at 5: CC rate < $1.40/SF/mo"); }
    else if (cc < 2.00 && score > 5) { score = 5; rateEnv = Math.min(rateEnv || 5, 5); flags.push("Score capped at 5: CC rate below $2.00/SF/mo feasibility floor"); }
    else if (cc < 2.50 && score > 7) { score = 7; rateEnv = Math.min(rateEnv || 7, 7); flags.push("Score capped at 7: CC rate < $2.50/SF/mo"); }
    else if (cc < 3.00 && score > 8) { score = 8; rateEnv = Math.min(rateEnv || 8, 8); flags.push("Score capped at 8: CC rate < $3.00/SF/mo"); }

    if (score >= 9) {
      const subs = [ls, ms, sp, cr, rateEnv || 0];
      const avg = subs.reduce((a, b) => a + b, 0) / subs.length;
      const weak = subs.filter(s => s < 7).length;
      if (score === 10 && (avg < 8.5 || weak > 0)) { score = 9; flags.push("Score reduced 10→9: not all sub-scores elite"); }
      if (score === 9 && (avg < 7.5 || weak > 1)) { score = 8; flags.push("Score reduced 9→8: too many weak sub-scores"); }
    }

    return { ...r, est_cc_rate_psf_mo: cc, est_noncc_rate_psf_mo: noncc, overall_score: score, rate_environment: rateEnv, criteria_flags: flags };
  });
}
