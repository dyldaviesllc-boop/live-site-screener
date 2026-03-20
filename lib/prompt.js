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

// Generate compact rate reference for prompt from MARKET_RATES — keeps them in sync
const RATE_ABBREVS = {
  "los angeles": "LA", "san francisco": "SF", "san jose": "SJ", "oakland": "OAK",
  "san diego": "SD", "new york": "NYC", "long island": "LI", "chicago": "CHI",
  "seattle": "SEA", "tacoma": "TAC", "puyallup": "PUY", "dallas": "DAL",
  "fort worth": "FTW", "dfw": "DFW", "arlington": "ARL", "frisco": "FRS",
  "mckinney": "MCK", "wylie": "WYL", "prosper": "PRS", "houston": "HOU",
  "san antonio": "SAT", "austin": "AUS", "denver": "DEN", "colorado springs": "COS",
  "phoenix": "PHX", "scottsdale": "SCT", "atlanta": "ATL", "nashville": "NSH",
  "charlotte": "CLT", "raleigh": "RAL", "orlando": "ORL", "tampa": "TPA",
  "miami": "MIA", "minneapolis": "MSP", "portland": "PDX", "boston": "BOS",
  "washington dc": "DC", "baltimore": "BAL", "las vegas": "LAS", "salt lake": "SLC",
  "huntsville": "HSV", "_default": "Natl",
};

function generateRateRefText() {
  const entries = Object.entries(MARKET_RATES)
    .map(([key, { low, high }]) => {
      const abbr = RATE_ABBREVS[key] || key.toUpperCase();
      return `${abbr}:${low.toFixed(2)}\u2013${high.toFixed(2)}`;
    })
    .join(" ");
  return `T12 CC $/SF/mo ranges (low\u2013high): ${entries}. T12=15-27% above street.
IMPORTANT: Vary rates per site using $0.05 increments \u2014 consider submarket quality, traffic, demographics, competition density, and property specifics. Do NOT give every site in a market the same rate. Premium locations get higher rates; weaker locations get lower.`;
}

// ── Prompt builders ──────────────────────────────────────────────────────────

function critText(criteria) {
  if (!criteria || typeof criteria !== "object") return "";
  return Object.entries(criteria)
    .filter(([, c]) => c.enabled)
    .map(([, c]) => `- ${c.label}: ${c.op} ${c.value}${c.unit ? " " + c.unit : ""}`)
    .join("\n");
}

function buildSysPrompt(criteria) {
  return `SS screener. Sub-scores 1-10, overall computed server-side as: 40% rate_environment + 20% market_score + 20% site_potential + 10% location_score + 10% competition_risk. Hard caps: CC<$2.00→max 5, CC<$1.40→max 5, CC<$1.10→max 4, CC<$0.85→max 3.
Rates=T12 $/SF/mo 10x10 CC (NOT promo). Trade:3mi sub,5mi rural. 8+SF/cap=oversupply. rate_environment is the MOST important sub-score — base it on actual CC rate vs market benchmarks.
CONVERSION: If [building SF] provided, evaluate for SS conversion. Industrial w/ 18ft+ clear height & clear span = ideal (+2 site_potential). Office/retail harder (floor loads, ceiling height, column spacing). property_category: "land" if vacant, "conversion" if existing building for SS reuse.
${generateRateRefText()}
${critText(criteria)}
JSON array ONLY:[{"address":"…","overall_score":N,"location_score":N,"market_score":N,"site_potential":N,"competition_risk":N,"rate_environment":N,"potential_use":"Self-Storage|Either|Unlikely","inferred_type":"Land|Industrial|Office|Retail/Big Box|Highway Frontage|Commercial|Other","property_category":"land|conversion","building_sf":N or null,"acreage":N or null,"est_cc_rate_psf_mo":N,"est_occupancy":N,"est_sf_per_capita":N,"est_pop_trade_area":N,"est_hhi":N,"trade_area_miles":N,"nearby_comps":"2-3 comps","criteria_pass":N,"criteria_fail":N,"criteria_flags":["…"],"key_insight":"1 sent","market":"metro"}]`;
}

const FEAS_SYS_PROMPT = `SS zoning+dev feasibility. RULES: lot_coverage_pct=decimal(0.50 not 65). Typical lot coverage 40-60%, use 50% default. FAR commercial/industrial: 0.5-2.0. Zoning paths: ~20% permitted, ~60% conditional, ~20% variance nationally. Typical setbacks: 20-30ft front, 10-15ft side, 15-20ft rear. Max height 35-55ft typical SS (3-4 stories indoor, 1 story drive-up). meets_90k=achievable_gsf>=90000.
CONVERSION: If [building SF] provided, this is a conversion site. existing_building_sf=current building. Conversion achievable_gsf=existing_building_sf×efficiency(0.85-0.95 industrial, 0.70-0.80 office/retail). Industrial clear-span 18ft+→mezzanine potential (1.5-2x floor area). conversion_complexity: "low"=industrial clear-span, "medium"=retail/big-box, "high"=office multi-floor. For land sites, use ground-up buildout logic and leave conversion fields null.
JSON array ONLY:
[{"address":"…","zoning_code":"XX","zoning_desc":"short","ss_permitted":bool,"ss_conditional":bool,"ss_variance":bool,"zoning_path":"path+timeline","zoning_risk":"high|medium|low","parcel_acres":N,"parcel_sf":N,"far_limit":N,"lot_coverage_pct":0.50,"front_setback_ft":N,"side_setback_ft":N,"rear_setback_ft":N,"max_height_ft":N,"max_stories":N,"buildable_sf":N,"achievable_gsf":N,"stories_proposed":3,"meets_90k":bool,"development_notes":"1 sentence","existing_building_sf":N or null,"conversion_complexity":"low|medium|high" or null,"conversion_notes":"1 sentence or null"}]`;

// Match a result address to a site in a list with tiered matching
function matchAddress(resultAddr, siteList) {
  if (!resultAddr) return undefined;
  const rNorm = resultAddr.toLowerCase().trim();

  // 1. Exact match (case-insensitive)
  const exact = siteList.find(s => s.address && s.address.toLowerCase().trim() === rNorm);
  if (exact) return exact;

  // 2. Street portion match (before first comma) — strict equality
  const rStreet = rNorm.split(",")[0].trim();
  const streetMatch = siteList.find(s => {
    if (!s.address) return false;
    const sStreet = s.address.toLowerCase().split(",")[0].trim();
    return sStreet === rStreet;
  });
  if (streetMatch) return streetMatch;

  // 3. Substring fallback — require the street portion to match at least 80% of chars
  //    and both directions must satisfy length threshold to avoid cross-matching
  return siteList.find(s => {
    if (!s.address) return false;
    const sStreet = s.address.toLowerCase().split(",")[0].trim();
    if (sStreet.length < 5 || rStreet.length < 5) return false; // too short for substring
    const shorter = Math.min(sStreet.length, rStreet.length);
    const longer = Math.max(sStreet.length, rStreet.length);
    // Only match if lengths are within 20% of each other
    if (shorter / longer < 0.8) return false;
    return rStreet.includes(sStreet) || sStreet.includes(rStreet);
  });
}

export { MARKET_RATES, RATE_ABBREVS, generateRateRefText, critText, buildSysPrompt, FEAS_SYS_PROMPT, matchAddress };
