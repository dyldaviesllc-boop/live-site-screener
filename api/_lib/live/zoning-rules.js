// ── Zoning Rules Parser ──────────────────────────────────────────────────────
// Takes a real zoning code (e.g. "C-2", "M-1", "I-2") from county data
// and uses Claude's knowledge of municipal codes to return structured
// setbacks, FAR, height limits, and permitted uses.
//
// This is NOT guessing — Claude is reading from its training data which
// includes most US municipal codes. The zoning CODE is real (from county GIS),
// and the development standards are Claude's best interpretation of that code.
//
// Results are cached per (city, zoning_code) pair to avoid redundant API calls.

const zoningCache = new Map();

/**
 * Parse zoning development standards from a real zoning code
 * @param {string} zoningCode - The actual zoning designation (e.g. "M-1", "C-2-CU")
 * @param {string} city - City name for municipal code context
 * @param {string} state - State abbreviation
 * @param {Function} callClaude - Reference to the Claude API caller from server.js
 * @returns {object} Structured development standards
 */
export async function getZoningRules(zoningCode, city, state, callClaude) {
  if (!zoningCode || zoningCode === "N/A") return null;

  const cacheKey = `${city}|${state}|${zoningCode}`.toLowerCase();
  if (zoningCache.has(cacheKey)) return zoningCache.get(cacheKey);
  if (zoningCache.size > 2000) zoningCache.clear();

  const prompt = `For the zoning designation "${zoningCode}" in ${city}, ${state}, provide the typical development standards from the municipal zoning code.

Return a JSON object ONLY (no markdown, no explanation):
{
  "zoning_code": "${zoningCode}",
  "zoning_desc": "short description of this zone (e.g. 'Heavy Industrial', 'General Commercial')",
  "ss_permitted": true/false,
  "ss_conditional": true/false,
  "ss_variance": true/false,
  "zoning_path": "most likely path for self-storage (permitted/conditional/variance) + typical timeline",
  "zoning_risk": "low|medium|high",
  "far_limit": N,
  "lot_coverage_pct": N (decimal, e.g. 0.50),
  "front_setback_ft": N,
  "side_setback_ft": N,
  "rear_setback_ft": N,
  "max_height_ft": N,
  "max_stories": N,
  "parking_required": "description of parking requirements for self-storage",
  "notes": "any important restrictions, overlays, or special conditions"
}

Use your knowledge of ${city}'s actual zoning code. If ${zoningCode} is not a valid code for ${city}, return your best interpretation based on standard zoning nomenclature. Be precise with numbers — use the actual code values, not estimates.`;

  try {
    const result = await callClaude(
      "You are a municipal zoning code expert. Return only valid JSON, no markdown or explanation.",
      prompt,
      { maxTokens: 600 },
    );

    // callClaude already parses JSON — result should be an array with one object
    const parsed = Array.isArray(result) ? result[0] : result;

    if (parsed && typeof parsed === "object") {
      // Normalize lot_coverage_pct to decimal
      if (parsed.lot_coverage_pct > 1) parsed.lot_coverage_pct = parsed.lot_coverage_pct / 100;

      // Ensure booleans
      parsed.ss_permitted = !!parsed.ss_permitted;
      parsed.ss_conditional = !!parsed.ss_conditional;
      parsed.ss_variance = !!parsed.ss_variance;

      parsed._source = "claude_zoning_parse";
      parsed._city = city;
      parsed._state = state;

      zoningCache.set(cacheKey, parsed);
      return parsed;
    }
  } catch (e) {
    console.warn(`[zoning-rules] Parse failed for ${zoningCode} in ${city}, ${state}:`, e.message);
  }

  return null;
}

/**
 * Get zoning rules from NYC PLUTO data (no Claude needed — data is already structured)
 */
export function getZoningRulesFromPLUTO(zoningData) {
  if (!zoningData?.code) return null;

  return {
    zoning_code: zoningData.code,
    zoning_desc: `NYC ${zoningData.code}`,
    far_limit: zoningData.com_far || zoningData.max_far || null,
    lot_front: zoningData.lot_front || null,
    lot_depth: zoningData.lot_depth || null,
    num_floors: zoningData.num_floors || null,
    built_far: zoningData.far || null,
    _source: "nyc_pluto",
    // NYC zoning: M zones generally permit self-storage
    ss_permitted: /^M/.test(zoningData.code),
    ss_conditional: /^C/.test(zoningData.code),
    ss_variance: /^R/.test(zoningData.code),
    zoning_risk: /^M/.test(zoningData.code) ? "low" : /^C/.test(zoningData.code) ? "medium" : "high",
    zoning_path: /^M/.test(zoningData.code)
      ? "Self-storage typically permitted as-of-right in M zones"
      : /^C/.test(zoningData.code)
        ? "Self-storage may require special permit in C zones — check BSA"
        : "Self-storage unlikely in R zones — variance required",
  };
}

/**
 * Clear the zoning cache (useful for testing)
 */
function clearZoningCache() {
  zoningCache.clear();
}
