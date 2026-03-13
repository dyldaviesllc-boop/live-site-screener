import { readFileSync, existsSync, mkdirSync } from "fs";
import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const envFile = readFileSync(join(__dirname, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch {}

const PORT = process.env.PORT || 3784;
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("ANTHROPIC_API_KEY not set in .env"); process.exit(1); }

// ── SQLite ───────────────────────────────────────────────────────────────────

const dataDir = join(__dirname, "data");
if (!existsSync(dataDir)) mkdirSync(dataDir);

const db = new Database(join(dataDir, "screener.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, address_count INTEGER, criteria_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    overall_score REAL, location_score REAL, market_score REAL,
    site_potential REAL, competition_risk REAL, rate_environment REAL,
    potential_use TEXT, inferred_type TEXT,
    est_cc_rate_psf_mo REAL, est_noncc_rate_psf_mo REAL,
    est_occupancy REAL, est_sf_per_capita REAL,
    est_pop_trade_area INTEGER, est_hhi INTEGER,
    trade_area_miles REAL, nearby_comps TEXT,
    criteria_pass INTEGER, criteria_fail INTEGER, criteria_flags TEXT,
    key_insight TEXT, market TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS feasibility (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER UNIQUE REFERENCES results(id) ON DELETE CASCADE,
    zoning_code TEXT, zoning_desc TEXT,
    ss_permitted INTEGER, ss_conditional INTEGER, ss_variance INTEGER,
    zoning_path TEXT, zoning_risk TEXT,
    parcel_acres REAL, parcel_sf REAL,
    far_limit REAL, lot_coverage_pct REAL,
    front_setback_ft REAL, side_setback_ft REAL, rear_setback_ft REAL,
    max_height_ft REAL, max_stories INTEGER,
    buildable_sf REAL, achievable_gsf REAL, stories_proposed INTEGER,
    meets_90k INTEGER, development_notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS brokers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, company TEXT, email TEXT, phone TEXT,
    markets TEXT, specialty TEXT, status TEXT DEFAULT 'active',
    notes TEXT, last_contact TEXT, next_followup TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS broker_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    broker_id INTEGER REFERENCES brokers(id) ON DELETE CASCADE,
    result_id INTEGER REFERENCES results(id) ON DELETE CASCADE,
    notes TEXT, created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(broker_id, result_id)
  );
  CREATE INDEX IF NOT EXISTS idx_results_session ON results(session_id);
  CREATE INDEX IF NOT EXISTS idx_results_score ON results(overall_score DESC);
  CREATE INDEX IF NOT EXISTS idx_feas_result ON feasibility(result_id);
  CREATE INDEX IF NOT EXISTS idx_bs_broker ON broker_sites(broker_id);
  CREATE INDEX IF NOT EXISTS idx_bs_result ON broker_sites(result_id);
`);

// Migration: add listing broker columns to results
try { db.exec("ALTER TABLE results ADD COLUMN listing_broker TEXT"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN listing_broker_co TEXT"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN listing_broker_phone TEXT"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN listing_broker_email TEXT"); } catch {}

// Migration: add building/conversion columns
try { db.exec("ALTER TABLE results ADD COLUMN building_sf REAL"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN acreage REAL"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN property_category TEXT"); } catch {}
try { db.exec("ALTER TABLE feasibility ADD COLUMN existing_building_sf REAL"); } catch {}
try { db.exec("ALTER TABLE feasibility ADD COLUMN conversion_complexity TEXT"); } catch {}
try { db.exec("ALTER TABLE feasibility ADD COLUMN conversion_notes TEXT"); } catch {}

// Migration: broker enrichment columns
try { db.exec("ALTER TABLE results ADD COLUMN broker_confidence TEXT"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN broker_enriched INTEGER DEFAULT 0"); } catch {}

// ── Market Rate Reference (REIT 10x10 CC T12/achieved rates, $/SF/mo) ────────
// Source: Extra Space, Public Storage, CubeSmart — T12 in-place achieved rates
// In-place rents avg 15-27% above advertised street rates (TractIQ Q3 2024)
// Extra Space in-place 26.7% above street; PS move-out $20.81 PSF vs move-in $14.45
const MARKET_RATES = {
  // Metro → { low, high, typical } = T12 achieved CC rates in $/SF/mo
  // Source: Yardi Matrix 2024-25, REIT earnings (ESS, PSA, CUBE). T12 in-place ~15-27% above street.
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
  // National fallback
  "_default":       { low: 0.80, high: 1.50, typical: 1.10 },
};

// Compact rate reference for prompt — includes LOW-HIGH range so Claude varies per site
const RATE_REF_TEXT = `T12 CC $/SF/mo ranges (low–high): LA:1.65–3.00 SF:1.80–3.20 SJ:1.60–2.80 SD:1.40–2.50 NYC:1.80–3.50 BOS:1.40–2.40 DC:1.25–2.20 MIA:1.15–2.10 CHI:1.00–1.80 SEA:1.10–1.90 DEN:0.90–1.55 DAL:0.85–1.50 FTW:0.75–1.25 HOU:0.75–1.30 PHX:0.80–1.40 ATL:0.70–1.25 NSH:0.85–1.40 CLT:0.75–1.25 Natl:0.80–1.50. T12=15-27% above street.
IMPORTANT: Vary rates per site using $0.05 increments — consider submarket quality, traffic, demographics, competition density, and property specifics. Do NOT give every site in a market the same rate. Premium locations get higher rates; weaker locations get lower.`;

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

// ── Prompt builders ──────────────────────────────────────────────────────────

function critText(criteria) {
  return Object.entries(criteria)
    .filter(([, c]) => c.enabled)
    .map(([, c]) => `- ${c.label}: ${c.op} ${c.value}${c.unit ? " " + c.unit : ""}`)
    .join("\n");
}

let _sysKey = "", _sysVal = "";
function cachedSysPrompt(criteria) {
  const key = JSON.stringify(criteria);
  if (key !== _sysKey) {
    _sysKey = key;
    _sysVal = `SS screener. Score 1-10. #1 RATES #2 PARCEL #3 ZONING.
Rates=T12 $/SF/mo 10x10 CC (NOT promo). CC<$1.40→cap 5,<$1.10→cap 4,<$0.85→cap 3. Trade:3mi sub,5mi rural. 8+SF/cap=oversupply.
CONVERSION: If [building SF] provided, evaluate for SS conversion. Industrial w/ 18ft+ clear height & clear span = ideal (+2 site_potential). Office/retail harder (floor loads, ceiling height, column spacing). property_category: "land" if vacant, "conversion" if existing building for SS reuse.
${RATE_REF_TEXT}
${critText(criteria)}
JSON array ONLY:[{"address":"…","overall_score":N,"location_score":N,"market_score":N,"site_potential":N,"competition_risk":N,"rate_environment":N,"potential_use":"Self-Storage|Either|Unlikely","inferred_type":"Land|Industrial|Office|Retail/Big Box|Highway Frontage|Commercial|Other","property_category":"land|conversion","building_sf":N or null,"acreage":N or null,"est_cc_rate_psf_mo":N,"est_noncc_rate_psf_mo":N,"est_occupancy":N,"est_sf_per_capita":N,"est_pop_trade_area":N,"est_hhi":N,"trade_area_miles":N,"nearby_comps":"2-3 comps","criteria_pass":N,"criteria_fail":N,"criteria_flags":["…"],"key_insight":"1 sent","market":"metro"}]`;
  }
  return _sysVal;
}

const FEAS_SYS_PROMPT = `SS zoning+dev feasibility. RULES: lot_coverage_pct=decimal(0.50 not 65). Typical lot coverage 40-60%, use 50% default. FAR commercial/industrial: 0.5-2.0. Zoning paths: ~20% permitted, ~60% conditional, ~20% variance nationally. Typical setbacks: 20-30ft front, 10-15ft side, 15-20ft rear. Max height 35-55ft typical SS (3-4 stories indoor, 1 story drive-up). meets_90k=achievable_gsf>=90000.
CONVERSION: If [building SF] provided, this is a conversion site. existing_building_sf=current building. Conversion achievable_gsf=existing_building_sf×efficiency(0.85-0.95 industrial, 0.70-0.80 office/retail). Industrial clear-span 18ft+→mezzanine potential (1.5-2x floor area). conversion_complexity: "low"=industrial clear-span, "medium"=retail/big-box, "high"=office multi-floor. For land sites, use ground-up buildout logic and leave conversion fields null.
JSON array ONLY:
[{"address":"…","zoning_code":"XX","zoning_desc":"short","ss_permitted":bool,"ss_conditional":bool,"ss_variance":bool,"zoning_path":"path+timeline","zoning_risk":"high|medium|low","parcel_acres":N,"parcel_sf":N,"far_limit":N,"lot_coverage_pct":0.50,"front_setback_ft":N,"side_setback_ft":N,"rear_setback_ft":N,"max_height_ft":N,"max_stories":N,"buildable_sf":N,"achievable_gsf":N,"stories_proposed":3,"meets_90k":bool,"development_notes":"1 sentence","existing_building_sf":N or null,"conversion_complexity":"low|medium|high" or null,"conversion_notes":"1 sentence or null"}]`;

// Broker CRM is manual — users add brokers via "+ Add to CRM" button in the UI

// ── Express ──────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "2mb" }));

const distPath = join(__dirname, "dist");
if (existsSync(distPath)) app.use(express.static(distPath));

// ── Rate Limiter ─────────────────────────────────────────────────────────────

const rl = {
  rem: 50, remTok: 80000, resetAt: 0, resetTokAt: 0,
  last: 0, gap: 800, inflight: 0, maxConc: 1, queue: [],

  update(h) {
    const rr = h.get("x-ratelimit-remaining-requests");
    const rt = h.get("x-ratelimit-remaining-tokens");
    if (rr != null) this.rem = parseInt(rr, 10);
    if (rt != null) this.remTok = parseInt(rt, 10);
    const rReq = h.get("x-ratelimit-reset-requests");
    const rTok = h.get("x-ratelimit-reset-tokens");
    if (rReq) this.resetAt = new Date(rReq).getTime();
    if (rTok) this.resetTokAt = new Date(rTok).getTime();
    this.gap = this.rem <= 3 || this.remTok <= 5000 ? 12000
      : this.rem <= 8 || this.remTok <= 12000 ? 4000
      : this.rem <= 20 ? 1200 : 600;
    console.log(`[rate] ${this.rem} req, ${this.remTok} tok → ${this.gap}ms`);
  },

  async acquire() {
    while (this.inflight >= this.maxConc)
      await new Promise(r => this.queue.push(r));
    this.inflight++;
    const elapsed = Date.now() - this.last;
    if (elapsed < this.gap)
      await new Promise(ok => setTimeout(ok, this.gap - elapsed));
    if (this.rem <= 1 && this.resetAt > Date.now())
      await new Promise(ok => setTimeout(ok, Math.min(this.resetAt - Date.now() + 500, 65000)));
    if (this.remTok <= 5000 && this.resetTokAt > Date.now())
      await new Promise(ok => setTimeout(ok, Math.min(this.resetTokAt - Date.now() + 500, 65000)));
    this.last = Date.now();
  },

  release() {
    this.inflight--;
    if (this.queue.length) this.queue.shift()();
  },
};

// ── Shared Anthropic caller ──────────────────────────────────────────────────

async function callClaude(system, userMsg, { maxTokens = 2048 } = {}, attempt = 0) {
  const MAX_RETRIES = 4;
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
    rl.release();
    if (attempt < MAX_RETRIES) {
      const wait = (2 ** attempt) * 3000;
      console.log(`[retry] fetch err (${attempt + 1}): ${err.message}, ${wait / 1000}s`);
      await new Promise(ok => setTimeout(ok, wait));
      return callClaude(system, userMsg, { maxTokens }, attempt + 1);
    }
    throw err;
  }
  clearTimeout(timer);
  rl.update(r.headers);
  rl.release();

  if ((r.status === 429 || r.status === 529) && attempt < MAX_RETRIES) {
    const retryAfter = parseInt(r.headers.get("retry-after") || "0", 10);
    const wait = Math.max(retryAfter * 1000, (2 ** attempt) * 5000, 10000);
    console.log(`[retry] ${r.status} (${attempt + 1}), ${wait / 1000}s`);
    await new Promise(ok => setTimeout(ok, wait));
    return callClaude(system, userMsg, { maxTokens }, attempt + 1);
  }

  const data = await r.json();
  if (data.error) {
    console.error(`[api-error] ${r.status} ${JSON.stringify(data.error)}`);
    throw new Error(data.error.message || "API error");
  }

  const txt = (data.content || []).filter(b => b.type === "text").map(b => b.text || "").join("");
  const clean = txt.replace(/```json|```/g, "").trim();

  // Helper: fix common JSON issues (unquoted values, trailing commas)
  function repairJSON(s) {
    return s
      .replace(/:\s*([A-Za-z][A-Za-z0-9\-\/]+)\s*([,}])/g, (_, v, end) => {
        // Don't requote true/false/null
        if (/^(true|false|null)$/i.test(v)) return `: ${v.toLowerCase()}${end}`;
        return `: "${v}"${end}`;
      })
      .replace(/,\s*([}\]])/g, "$1"); // trailing commas
  }

  function tryParse(s) {
    try { return JSON.parse(s); } catch {}
    try { return JSON.parse(repairJSON(s)); } catch {}
    return null;
  }

  // 1. Try exact array match
  const match = clean.match(/\[[\s\S]*\]/);
  if (match) {
    const parsed = tryParse(match[0]);
    if (parsed) return parsed;
  }

  // 2. Try to recover truncated JSON arrays
  const arrStart = clean.indexOf("[");
  if (arrStart >= 0) {
    let partial = clean.slice(arrStart);
    const lastBrace = partial.lastIndexOf("}");
    if (lastBrace > 0) {
      partial = partial.slice(0, lastBrace + 1) + "]";
      const parsed = tryParse(partial);
      if (parsed) { console.log(`[json-recover] truncated → recovered ${parsed.length} items`); return parsed; }
    }
  }

  // 3. Last resort — try full text
  const parsed = tryParse(clean);
  if (parsed) return parsed;

  // 4. Extract individual JSON objects and rebuild array
  const objMatches = clean.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
  if (objMatches?.length) {
    const items = objMatches.map(m => tryParse(m)).filter(Boolean);
    if (items.length) { console.log(`[json-recover] extracted ${items.length} individual objects`); return items; }
  }

  // 5. Try line-by-line JSONL (some models output one JSON object per line)
  const lines = clean.split("\n").map(l => l.trim()).filter(l => l.startsWith("{"));
  if (lines.length) {
    const items = lines.map(l => tryParse(l)).filter(Boolean);
    if (items.length) { console.log(`[json-recover] JSONL → recovered ${items.length} items`); return items; }
  }

  // Log raw response for debugging
  console.error("[json-fail] raw response text:", txt.substring(0, 500));
  throw new Error("Failed to parse API response as JSON");
}

// ── POST /api/screen ─────────────────────────────────────────────────────────

// ── Shared helpers ───────────────────────────────────────────────────────────

// Round to nearest $0.05 for realistic pricing
const round05 = v => Math.round(v * 20) / 20;

// Match a result address to a site in a list by partial first-segment overlap
function matchAddress(resultAddr, siteList) {
  return siteList.find(s => s.address && resultAddr && (
    resultAddr.toLowerCase().includes(s.address.toLowerCase().split(",")[0]) ||
    s.address.toLowerCase().includes(resultAddr.toLowerCase().split(",")[0])
  ));
}

// ── Server-side rate validation ──────────────────────────────────────────────
function validateAndCapRates(results) {
  return results.map(r => {
    const metro = r.market || "";
    const ref = getMarketRate(metro);
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

    // Enforce score caps based on CC rate thresholds (T12 achieved rates)
    // Ladder: <$0.85→3, <$1.10→4, <$1.40→5, <$2.00→6, <$2.50→7, <$3.00→8
    if (cc < 0.85 && score > 3) {
      score = 3;
      rateEnv = Math.min(rateEnv || 3, 3);
      flags.push("Score capped at 3: CC T12 rate < $0.85/SF/mo");
    } else if (cc < 1.10 && score > 4) {
      score = 4;
      rateEnv = Math.min(rateEnv || 4, 4);
      flags.push("Score capped at 4: CC T12 rate < $1.10/SF/mo");
    } else if (cc < 1.40 && score > 5) {
      score = 5;
      rateEnv = Math.min(rateEnv || 5, 5);
      flags.push("Score capped at 5: CC T12 rate < $1.40/SF/mo");
    } else if (cc < 2.00 && score > 6) {
      score = 6;
      rateEnv = Math.min(rateEnv || 6, 6);
      flags.push("Score capped at 6: CC T12 rate < $2.00/SF/mo");
    } else if (cc < 2.50 && score > 7) {
      score = 7;
      rateEnv = Math.min(rateEnv || 7, 7);
      flags.push("Score capped at 7: CC T12 rate < $2.50/SF/mo");
    } else if (cc < 3.00 && score > 8) {
      score = 8;
      rateEnv = Math.min(rateEnv || 8, 8);
      flags.push("Score capped at 8: CC T12 rate < $3.00/SF/mo");
    }

    // 9-10 require elite rates ($3.00+) AND strong fundamentals across the board
    if (score >= 9) {
      const loc = r.location_score || 0;
      const mkt = r.market_score || 0;
      const sit = r.site_potential || 0;
      const comp = r.competition_risk || 0;
      const subs = [loc, mkt, sit, comp, rateEnv || 0];
      const avg = subs.reduce((a, b) => a + b, 0) / subs.length;
      const weak = subs.filter(s => s < 7).length;

      if (score === 10 && (avg < 8.5 || weak > 0)) {
        // 10 requires all subs ≥7 and avg ≥8.5
        score = 9;
        flags.push("Score reduced 10→9: not all sub-scores elite");
      }
      if (score === 9 && (avg < 7.5 || weak > 1)) {
        // 9 requires avg ≥7.5 and at most 1 weak sub-score
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

app.post("/api/screen", async (req, res) => {
  // Support both old {addresses:[str]} and new {sites:[{address,building_sf?,acreage?}]}
  const { sites, addresses, criteria } = req.body;
  const siteList = sites || (addresses || []).map(a => typeof a === "string" ? { address: a } : a);
  if (!siteList?.length) return res.status(400).json({ error: "No addresses" });
  try {
    // Build user message with building metadata when available
    const siteLines = siteList.map(s => {
      let line = s.address;
      const meta = [];
      if (s.building_sf) meta.push(`${Number(s.building_sf).toLocaleString()} SF building`);
      if (s.acreage) meta.push(`${s.acreage} ac`);
      if (meta.length) line += ` [${meta.join(", ")}]`;
      return line;
    });
    const raw = await callClaude(
      cachedSysPrompt(criteria),
      `Screen ${siteList.length} sites:\n${siteLines.join("\n")}`,
      { maxTokens: Math.min(3200, 400 * siteList.length) },
    );
    // Merge input metadata back onto results + sanity-check building_sf
    const results = validateAndCapRates(raw).map(r => {
      const src = matchAddress(r.address, siteList);
      if (src) {
        // Prefer user-provided building_sf over Claude's (user knows their data)
        if (src.building_sf) r.building_sf = src.building_sf;
        else if (r.building_sf && r.building_sf > 500_000) r.building_sf = null; // sanity cap: no SS conversion > 500K SF
        if (src.acreage) r.acreage = src.acreage;
        else if (r.acreage && r.acreage > 200) r.acreage = null; // sanity cap
      } else {
        // No source match — still sanity-check Claude's values
        if (r.building_sf && r.building_sf > 500_000) r.building_sf = null;
        if (r.acreage && r.acreage > 200) r.acreage = null;
      }
      return r;
    });
    res.json({ results });
  } catch (e) {
    console.error("Screen error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/enrich-brokers — dedicated broker lookup ──────────────────────

const BROKER_SYS_PROMPT = `CRE broker recommendation specialist. For each commercial property address, identify the BEST individual broker to contact about this property.
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

const updateBrokerStmt = db.prepare(`UPDATE results SET listing_broker=?,listing_broker_co=?,listing_broker_phone=?,listing_broker_email=?,broker_confidence=?,broker_enriched=? WHERE id=?`);

app.post("/api/enrich-brokers", async (req, res) => {
  const { sites } = req.body;
  if (!sites?.length) return res.status(400).json({ error: "No sites" });
  try {
    const siteLines = sites.map(s => {
      let line = s.address;
      const meta = [];
      if (s.inferred_type) meta.push(s.inferred_type);
      if (s.market) meta.push(`${s.market} market`);
      if (meta.length) line += ` [${meta.join(", ")}]`;
      return line;
    });
    let raw;
    try {
      raw = await callClaude(
        BROKER_SYS_PROMPT,
        `Find listing brokers for ${sites.length} properties:\n${siteLines.join("\n")}`,
        { maxTokens: Math.min(4096, 400 * sites.length) },
      );
    } catch (parseErr) {
      // JSON parse failed — return empty results so frontend skips this batch gracefully
      console.error("Broker enrich parse error (batch skipped):", parseErr.message);
      return res.json({ results: [], skipped: sites.length, parseError: true });
    }
    // Update DB and build response — skip "Unknown" so they can be retried
    const results = raw.map(r => {
      const src = matchAddress(r.address, sites);
      if (src?.result_id) {
        const isKnown = r.listing_broker && r.listing_broker.toLowerCase() !== "unknown";
        const hasCo = r.listing_broker_co && r.listing_broker_co.toLowerCase() !== "unknown";
        updateBrokerStmt.run(
          isKnown ? r.listing_broker : null, hasCo ? r.listing_broker_co : null,
          isKnown ? (r.listing_broker_phone || null) : null, isKnown ? (r.listing_broker_email || null) : null,
          (isKnown || hasCo) ? (r.confidence || "low") : null, (isKnown || hasCo) ? 1 : 0, src.result_id
        );
      }
      return { ...r, result_id: src?.result_id };
    });

    res.json({ results });
  } catch (e) {
    console.error("Enrich-brokers error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/results/:id/broker — manual broker update ──────────────────────

app.put("/api/results/:id/broker", (req, res) => {
  const { listing_broker, listing_broker_co, listing_broker_phone, listing_broker_email, broker_confidence } = req.body;
  updateBrokerStmt.run(
    listing_broker || null, listing_broker_co || null,
    listing_broker_phone || null, listing_broker_email || null,
    broker_confidence || "manual", 1, req.params.id
  );
  res.json({ ok: true });
});

// ── POST /api/feasibility ────────────────────────────────────────────────────

// Detect if address has a street number (exact address)
function hasStreetNumber(addr) {
  return /^\d/.test(addr.trim());
}

app.post("/api/feasibility", async (req, res) => {
  // Support both old {addresses:[str]} and new {sites:[{address,building_sf?,acreage?}]}
  const { sites, addresses } = req.body;
  const siteList = sites || (addresses || []).map(a => typeof a === "string" ? { address: a } : a);
  if (!siteList?.length) return res.status(400).json({ error: "No addresses" });

  // Split into exact vs non-exact
  const exact = siteList.filter(s => hasStreetNumber(s.address));
  const flagged = siteList.filter(s => !hasStreetNumber(s.address));

  try {
    let apiResults = [];
    if (exact.length) {
      // Build message with building metadata
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

// ── GET /api/rate-status ─────────────────────────────────────────────────────

app.get("/api/rate-status", (req, res) => {
  res.json({ rem: rl.rem, remTok: rl.remTok, inflight: rl.inflight, queued: rl.queue.length, gap: rl.gap, throttled: rl.rem <= 8 || rl.remTok <= 20000 });
});

// ── GET /api/market-rates — return reference rate data ──────────────────────

app.get("/api/market-rates", (req, res) => {
  const metro = req.query.metro;
  if (metro) {
    res.json(getMarketRate(metro));
  } else {
    res.json(MARKET_RATES);
  }
});

// ── Sessions CRUD ────────────────────────────────────────────────────────────

const stmts = {
  listSessions: db.prepare(`SELECT s.*, COUNT(r.id) as result_count, ROUND(AVG(r.overall_score),1) as avg_score FROM sessions s LEFT JOIN results r ON r.session_id=s.id GROUP BY s.id ORDER BY s.created_at DESC`),
  getSession: db.prepare("SELECT * FROM sessions WHERE id=?"),
  getResults: db.prepare("SELECT * FROM results WHERE session_id=? ORDER BY overall_score DESC"),
  insertSession: db.prepare("INSERT INTO sessions (name,address_count,criteria_json) VALUES (?,?,?)"),
  insertResult: db.prepare(`INSERT INTO results (session_id,address,overall_score,location_score,market_score,site_potential,competition_risk,rate_environment,potential_use,inferred_type,est_cc_rate_psf_mo,est_noncc_rate_psf_mo,est_occupancy,est_sf_per_capita,est_pop_trade_area,est_hhi,trade_area_miles,nearby_comps,criteria_pass,criteria_fail,criteria_flags,key_insight,market,listing_broker,listing_broker_co,listing_broker_phone,listing_broker_email,building_sf,acreage,property_category,broker_confidence,broker_enriched) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  deleteSession: db.prepare("DELETE FROM sessions WHERE id=?"),
};

const feasStmts = {
  upsert: db.prepare(`INSERT INTO feasibility (result_id,zoning_code,zoning_desc,ss_permitted,ss_conditional,ss_variance,zoning_path,zoning_risk,parcel_acres,parcel_sf,far_limit,lot_coverage_pct,front_setback_ft,side_setback_ft,rear_setback_ft,max_height_ft,max_stories,buildable_sf,achievable_gsf,stories_proposed,meets_90k,development_notes,existing_building_sf,conversion_complexity,conversion_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(result_id) DO UPDATE SET zoning_code=excluded.zoning_code,zoning_desc=excluded.zoning_desc,ss_permitted=excluded.ss_permitted,ss_conditional=excluded.ss_conditional,ss_variance=excluded.ss_variance,zoning_path=excluded.zoning_path,zoning_risk=excluded.zoning_risk,parcel_acres=excluded.parcel_acres,parcel_sf=excluded.parcel_sf,far_limit=excluded.far_limit,lot_coverage_pct=excluded.lot_coverage_pct,front_setback_ft=excluded.front_setback_ft,side_setback_ft=excluded.side_setback_ft,rear_setback_ft=excluded.rear_setback_ft,max_height_ft=excluded.max_height_ft,max_stories=excluded.max_stories,buildable_sf=excluded.buildable_sf,achievable_gsf=excluded.achievable_gsf,stories_proposed=excluded.stories_proposed,meets_90k=excluded.meets_90k,development_notes=excluded.development_notes,existing_building_sf=excluded.existing_building_sf,conversion_complexity=excluded.conversion_complexity,conversion_notes=excluded.conversion_notes`),
  getByResults: db.prepare("SELECT * FROM feasibility WHERE result_id IN (SELECT id FROM results WHERE session_id=?)"),
  getByResultId: db.prepare("SELECT * FROM feasibility WHERE result_id=?"),
};

app.get("/api/sessions", (req, res) => res.json(stmts.listSessions.all()));

app.get("/api/sessions/:id", (req, res) => {
  const session = stmts.getSession.get(req.params.id);
  if (!session) return res.status(404).json({ error: "Not found" });
  const results = stmts.getResults.all(req.params.id);
  const feasibility = feasStmts.getByResults.all(req.params.id);
  res.json({ ...session, results, feasibility });
});

app.post("/api/sessions", (req, res) => {
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

app.delete("/api/sessions/:id", (req, res) => {
  stmts.deleteSession.run(req.params.id);
  res.json({ ok: true });
});

// ── POST /api/feasibility/save — persist feasibility results ─────────────────

app.post("/api/feasibility/save", (req, res) => {
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

// ── Brokers CRUD ─────────────────────────────────────────────────────────────

const brokerStmts = {
  list: db.prepare("SELECT b.*, COUNT(bs.id) as site_count FROM brokers b LEFT JOIN broker_sites bs ON bs.broker_id=b.id GROUP BY b.id ORDER BY b.last_contact DESC NULLS LAST, b.name ASC"),
  get: db.prepare("SELECT * FROM brokers WHERE id=?"),
  insert: db.prepare("INSERT INTO brokers (name,company,email,phone,markets,specialty,status,notes,last_contact,next_followup) VALUES (?,?,?,?,?,?,?,?,?,?)"),
  update: db.prepare("UPDATE brokers SET name=?,company=?,email=?,phone=?,markets=?,specialty=?,status=?,notes=?,last_contact=?,next_followup=? WHERE id=?"),
  delete: db.prepare("DELETE FROM brokers WHERE id=?"),
  getSites: db.prepare("SELECT r.*,bs.notes as broker_note,bs.id as link_id FROM broker_sites bs JOIN results r ON r.id=bs.result_id WHERE bs.broker_id=? ORDER BY r.overall_score DESC"),
  linkSite: db.prepare("INSERT OR IGNORE INTO broker_sites (broker_id,result_id,notes) VALUES (?,?,?)"),
  unlinkSite: db.prepare("DELETE FROM broker_sites WHERE broker_id=? AND result_id=?"),
  searchResults: db.prepare("SELECT id,address,market,overall_score,potential_use FROM results ORDER BY overall_score DESC LIMIT 50"),
};

app.get("/api/brokers", (req, res) => res.json(brokerStmts.list.all()));
app.get("/api/brokers/:id", (req, res) => {
  const broker = brokerStmts.get.get(req.params.id);
  if (!broker) return res.status(404).json({ error: "Not found" });
  res.json({ ...broker, sites: brokerStmts.getSites.all(req.params.id) });
});
app.post("/api/brokers", (req, res) => {
  const b = req.body;
  const info = brokerStmts.insert.run(b.name, b.company||null, b.email||null, b.phone||null, b.markets||null, b.specialty||null, b.status||"active", b.notes||null, b.last_contact||null, b.next_followup||null);
  res.json({ id: info.lastInsertRowid });
});
app.put("/api/brokers/:id", (req, res) => {
  const b = req.body;
  brokerStmts.update.run(b.name, b.company||null, b.email||null, b.phone||null, b.markets||null, b.specialty||null, b.status||"active", b.notes||null, b.last_contact||null, b.next_followup||null, req.params.id);
  res.json({ ok: true });
});
app.delete("/api/brokers/:id", (req, res) => { brokerStmts.delete.run(req.params.id); res.json({ ok: true }); });
app.post("/api/brokers/:id/sites", (req, res) => {
  const { result_id, notes } = req.body;
  // INSERT OR IGNORE — won't overwrite existing link
  brokerStmts.linkSite.run(req.params.id, result_id, notes || null);
  // If link already existed and new notes provided, append them
  if (notes) {
    const existing = db.prepare("SELECT notes FROM broker_sites WHERE broker_id=? AND result_id=?").get(req.params.id, result_id);
    if (existing && existing.notes && !existing.notes.includes(notes)) {
      db.prepare("UPDATE broker_sites SET notes=? WHERE broker_id=? AND result_id=?").run(existing.notes + "\n" + notes, req.params.id, result_id);
    }
  }
  res.json({ ok: true });
});
// Append-only notes endpoint — never overwrites, only accumulates
app.put("/api/brokers/:brokerId/sites/:resultId/notes", (req, res) => {
  const { note } = req.body;
  if (!note) return res.status(400).json({ error: "note required" });
  const existing = db.prepare("SELECT notes FROM broker_sites WHERE broker_id=? AND result_id=?").get(req.params.brokerId, req.params.resultId);
  if (!existing) return res.status(404).json({ error: "link not found" });
  const updated = existing.notes ? existing.notes + "\n" + note : note;
  db.prepare("UPDATE broker_sites SET notes=? WHERE broker_id=? AND result_id=?").run(updated, req.params.brokerId, req.params.resultId);
  res.json({ ok: true, notes: updated });
});
app.delete("/api/brokers/:brokerId/sites/:resultId", (req, res) => { brokerStmts.unlinkSite.run(req.params.brokerId, req.params.resultId); res.json({ ok: true }); });
app.get("/api/results/search", (req, res) => res.json(brokerStmts.searchResults.all()));

// SPA fallback
if (existsSync(distPath)) {
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(join(distPath, "index.html"));
  });
}

app.listen(PORT, () => console.log(`Site Screener → http://localhost:${PORT}`));
