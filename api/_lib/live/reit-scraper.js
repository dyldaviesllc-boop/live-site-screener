// ── REIT Facility Rate Scraper ────────────────────────────────────────────────
// Scrapes individual facility pages found via Google Places to get real in-store rates
// Focuses on 10x10 CC units (60-70% of typical unit mix)
//
// Flow: Google Places → competitor list with websiteUri → scrape each facility page
// Captures IN-STORE rates (not web/promo rates) and stores for T12 history
//
// Supported: Public Storage, CubeSmart (via JSON-LD schema)
// Partially supported: Extra Space (403s on direct fetch, falls back to estimation)

const SCRAPE_TIMEOUT = 8000;
const MAX_FACILITIES_TO_SCRAPE = 6; // Top 6 closest REITs — 2 batches of 3

// ── Unit size normalization ──────────────────────────────────────────────────
function parseSize(desc) {
  const m = desc.match(/(\d+)\s*[x×X]\s*(\d+)/);
  if (!m) return null;
  return { w: parseInt(m[1]), l: parseInt(m[2]), key: `${m[1]}x${m[2]}` };
}

function isClimateControlled(desc) {
  const d = (desc || "").toLowerCase();
  // "Inside" units at Public Storage = climate controlled
  // Explicit CC mentions
  if (/climate|heated|cooled|temperature|inside/i.test(d)) return true;
  // "Outside" or "Drive-up" = NOT climate controlled
  if (/outside|drive.?up|exterior|outdoor/i.test(d)) return false;
  return null; // Unknown
}

// ── Scrape a single facility page ────────────────────────────────────────────
async function scrapeFacilityPage(url, facilityName, brand) {
  if (!url) return null;

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT),
      redirect: "follow",
    });

    if (!resp.ok) {
      console.log(`[reit-scraper] ${brand} ${resp.status} for ${url}`);
      return null;
    }

    const html = await resp.text();
    const units = [];

    // Strategy 1: Parse JSON-LD structured data (most reliable)
    const jsonLdUnits = parseJsonLd(html, facilityName, brand);
    if (jsonLdUnits.length) {
      units.push(...jsonLdUnits);
    }

    // Strategy 2: Parse visible pricing from HTML (fallback — only if JSON-LD found nothing)
    // HTML parsing is less reliable — only use as last resort
    if (!units.length) {
      const htmlUnits = parseHtmlPricing(html, facilityName, brand);
      // Mark as HTML-sourced and apply stricter filtering
      for (const u of htmlUnits) u._from_html = true;
      units.push(...htmlUnits);
    }

    if (units.length) {
      console.log(`[reit-scraper] ${brand} "${facilityName}": ${units.length} units scraped`);
    }

    return units.length ? units : null;
  } catch (e) {
    console.log(`[reit-scraper] ${brand} error: ${e.message}`);
    return null;
  }
}

// ── Parse JSON-LD schema markup ──────────────────────────────────────────────
function parseJsonLd(html, facilityName, brand) {
  const units = [];

  // Find all JSON-LD blocks
  const ldRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = ldRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);

      // Deep recursive search for Offer objects with price data
      // Public Storage nests offers inside BreadCrumbList → itemListElement → Offer → itemOffered
      function findOffers(obj, depth = 0) {
        if (depth > 15 || !obj || typeof obj !== "object") return;

        // Check if this object is an Offer with price
        if (obj["@type"] === "Offer" && obj.price) {
          const unit = parseOfferToUnit(obj, facilityName, brand);
          if (unit) {
            unit._source = "json_ld";
            units.push(unit);
          }
        }

        // Recurse into all values
        const values = Array.isArray(obj) ? obj : Object.values(obj);
        for (const v of values) {
          if (v && typeof v === "object") findOffers(v, depth + 1);
        }
      }

      findOffers(data);
    } catch (e) {
      // Invalid JSON-LD, skip
    }
  }

  return units;
}

function parseOfferToUnit(offer, facilityName, brand) {
  // Get name from itemOffered (Public Storage pattern) or direct name
  const itemName = offer.itemOffered?.name || offer.name || "";
  const itemDesc = offer.itemOffered?.description || offer.description || "";
  const fullText = `${itemName} ${itemDesc}`;

  const size = parseSize(fullText);
  if (!size) return null;

  // Parse price — could be "$43 - $65" range or single value
  let priceStr = offer.price || offer.lowPrice || "";
  if (typeof priceStr === "object") priceStr = priceStr.value || "";
  priceStr = String(priceStr);

  let lowPrice = null, highPrice = null;
  const rangeMatch = priceStr.match(/\$?([\d,.]+)\s*[-–]\s*\$?([\d,.]+)/);
  const singleMatch = priceStr.match(/\$?([\d,.]+)/);

  if (rangeMatch) {
    lowPrice = parseFloat(rangeMatch[1].replace(/,/g, ""));
    highPrice = parseFloat(rangeMatch[2].replace(/,/g, ""));
  } else if (singleMatch) {
    lowPrice = parseFloat(singleMatch[1].replace(/,/g, ""));
    highPrice = lowPrice;
  }

  // Minimum plausible monthly rate — filter out promo/first-month pricing
  // A 5x5 ($25 sqft) at $0.50/SF = $12.50/mo minimum
  // A 10x10 (100 sqft) at $0.50/SF = $50/mo minimum
  if (!highPrice || highPrice < 15) return null;
  const sqftCheck = size.w * size.l;
  const ratePsfCheck = highPrice / sqftCheck;
  if (ratePsfCheck < 0.50) return null; // Below $0.50/SF/mo is promo/first-month pricing, not in-store rate

  const cc = isClimateControlled(fullText);
  const sqft = size.w * size.l;

  // For Public Storage: the range is typically web-to-instore
  // Low end = web/promo rate, High end = in-store/regular rate
  // We want the HIGH end (in-store rate)
  const inStoreRate = highPrice;
  const webRate = rangeMatch ? lowPrice : null;

  return {
    facility_name: facilityName,
    brand,
    unit_size: size.key,
    width: size.w,
    length: size.l,
    sqft,
    is_cc: cc === true ? 1 : cc === false ? 0 : null,
    description: fullText.slice(0, 200),
    in_store_rate: inStoreRate,        // Monthly $ — the rate we USE (in-store, NOT web)
    web_rate: webRate,                  // Monthly $ — tracked but NOT used for analysis
    rate_psf: Math.round(inStoreRate / sqft * 100) / 100,  // $/SF/mo
  };
}

// ── Parse HTML pricing (fallback when no JSON-LD) ────────────────────────────
function parseHtmlPricing(html, facilityName, brand) {
  const units = [];

  // Look for common pricing patterns in HTML
  // Pattern: "10x10" near "$123" or "$123/mo"
  const pricePattern = /(\d+)\s*[x×X]\s*(\d+)[^$]*?\$\s*([\d,.]+)/g;
  let m;
  while ((m = pricePattern.exec(html)) !== null) {
    const w = parseInt(m[1]);
    const l = parseInt(m[2]);
    const price = parseFloat(m[3].replace(/,/g, ""));
    if (w > 0 && l > 0 && price >= 15 && price < 2000) {
      const sqft = w * l;
      // Get surrounding text for CC detection
      const context = html.slice(Math.max(0, m.index - 100), m.index + m[0].length + 100);
      const cc = isClimateControlled(context);

      units.push({
        facility_name: facilityName,
        brand,
        unit_size: `${w}x${l}`,
        width: w, length: l, sqft,
        is_cc: cc === true ? 1 : cc === false ? 0 : null,
        description: context.replace(/<[^>]*>/g, "").trim().slice(0, 200),
        in_store_rate: price,
        web_rate: null,
        rate_psf: Math.round(price / sqft * 100) / 100,
      });
    }
  }

  return units;
}

// ── Main: Scrape rates from nearby REIT competitors ──────────────────────────
// Takes the competitor list from Google Places and scrapes each facility's page
export async function scrapeNearbyRates(competitors, searchAddress) {
  if (!competitors?.competitors?.length) return null;

  // Filter to REIT/premium facilities that have website URLs
  const scrapeable = competitors.competitors
    .filter(c => c.website && c.brand_tier === "premium")
    .slice(0, MAX_FACILITIES_TO_SCRAPE);

  if (!scrapeable.length) {
    console.log("[reit-scraper] No scrapeable REIT facilities found");
    return null;
  }

  console.log(`[reit-scraper] Scraping ${scrapeable.length} REIT facilities for ${searchAddress}`);

  const allUnits = [];
  const facilityResults = [];

  // Scrape up to 3 at a time
  const results = [];
  for (let i = 0; i < scrapeable.length; i += 3) {
    const batch = scrapeable.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(async facility => {
      const brand = detectBrand(facility.name);
      const units = await scrapeFacilityPage(facility.website, facility.name, brand);
      return { facility, brand, units };
    }));
    results.push(...batchResults);
  }

  for (const { facility, brand, units } of results) {
    if (units?.length) {
      for (const u of units) {
        u.facility_lat = facility.lat;
        u.facility_lng = facility.lng;
        u.facility_address = facility.address;
        u.distance_miles = facility.distance_miles;
      }
      allUnits.push(...units);
      facilityResults.push({
        name: facility.name,
        brand,
        address: facility.address,
        distance: facility.distance_miles,
        units_found: units.length,
        has_10x10_cc: units.some(u => u.unit_size === "10x10" && u.is_cc === 1),
      });
    }
  }

  if (!allUnits.length) {
    console.log("[reit-scraper] No units scraped from any facility");
    return null;
  }

  // ── Compute weighted market rate (10x10 CC = 65% weight) ─────────────────
  const rateResult = computeWeightedRate(allUnits);
  rateResult.facilities_scraped = facilityResults;
  rateResult.total_units_scraped = allUnits.length;
  rateResult.search_address = searchAddress;
  rateResult.scraped_at = new Date().toISOString();

  console.log(`[reit-scraper] Result: ${allUnits.length} units from ${facilityResults.length} facilities`);
  if (rateResult.cc_10x10) {
    console.log(`[reit-scraper] 10x10 CC in-store: $${rateResult.cc_10x10.rate_psf}/SF/mo ($${rateResult.cc_10x10.monthly}/mo) from ${rateResult.cc_10x10.sample_count} units`);
  }

  return { ...rateResult, raw_units: allUnits };
}

// ── Weighted rate computation ────────────────────────────────────────────────
// 10x10 CC = 65% weight, 10x10 non-CC = 20%, other sizes = 15%
function computeWeightedRate(units) {
  const cc10x10 = units.filter(u => u.unit_size === "10x10" && u.is_cc === 1);
  const noncc10x10 = units.filter(u => u.unit_size === "10x10" && u.is_cc === 0);
  const other10x10 = units.filter(u => u.unit_size === "10x10" && u.is_cc === null);
  const allOther = units.filter(u => u.unit_size !== "10x10");

  const result = { source: "reit_scraped" };

  // 10x10 CC rates (PRIMARY — 65% weight)
  if (cc10x10.length) {
    const rates = cc10x10.map(u => u.rate_psf).sort((a, b) => a - b);
    result.cc_10x10 = {
      rate_psf: median(rates),
      monthly: median(cc10x10.map(u => u.in_store_rate).sort((a, b) => a - b)),
      low: rates[0],
      high: rates[rates.length - 1],
      sample_count: rates.length,
      facilities: [...new Set(cc10x10.map(u => u.facility_name))],
    };
  }

  // 10x10 non-CC rates (20% weight)
  if (noncc10x10.length) {
    const rates = noncc10x10.map(u => u.rate_psf).sort((a, b) => a - b);
    result.noncc_10x10 = {
      rate_psf: median(rates),
      monthly: median(noncc10x10.map(u => u.in_store_rate).sort((a, b) => a - b)),
      low: rates[0],
      high: rates[rates.length - 1],
      sample_count: rates.length,
    };
  }

  // If we have 10x10 units but CC status is unknown, treat as "mixed"
  if (!result.cc_10x10 && !result.noncc_10x10 && other10x10.length) {
    const rates = other10x10.map(u => u.rate_psf).sort((a, b) => a - b);
    result.cc_10x10 = {
      rate_psf: median(rates),
      monthly: median(other10x10.map(u => u.in_store_rate).sort((a, b) => a - b)),
      low: rates[0],
      high: rates[rates.length - 1],
      sample_count: rates.length,
      note: "CC status unknown — treating as mixed",
    };
  }

  // Compute weighted blended CC rate
  // 10x10 CC = 65%, other CC benchmark sizes = 35%
  let weightedRate = null;
  let totalWeight = 0;

  if (result.cc_10x10) {
    weightedRate = (weightedRate || 0) + result.cc_10x10.rate_psf * 0.65;
    totalWeight += 0.65;
  }
  // Other CC sizes (5x10, 10x15, 10x20, etc.) get remaining 35%
  const otherCC = allOther.filter(u => u.is_cc === 1);
  if (otherCC.length && totalWeight < 1) {
    const otherMedian = median(otherCC.map(u => u.rate_psf).sort((a, b) => a - b));
    const remainingWeight = Math.min(0.35, 1 - totalWeight);
    weightedRate = (weightedRate || 0) + otherMedian * remainingWeight;
    totalWeight += remainingWeight;
  }

  if (weightedRate && totalWeight > 0) {
    result.weighted_rate_psf = Math.round(weightedRate / totalWeight * 100) / 100;
  }

  // Build market_rate_override for compatibility with existing pipeline
  if (result.cc_10x10) {
    result.market_rate_override = {
      low: result.cc_10x10.low,
      high: result.cc_10x10.high,
      typical: result.cc_10x10.rate_psf,
    };
  }

  return result;
}

// ── T12 Rate History (SQLite storage) ────────────────────────────────────────
// Call this after scraping to persist the snapshot for trailing-twelve-month analysis

export function storeRateSnapshot(db, scrapedData, searchLat, searchLng) {
  if (!db || !scrapedData?.raw_units?.length) return;

  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_name TEXT NOT NULL,
      brand TEXT,
      facility_address TEXT,
      facility_lat REAL,
      facility_lng REAL,
      unit_size TEXT NOT NULL,
      is_cc INTEGER,
      in_store_rate REAL NOT NULL,
      web_rate REAL,
      rate_psf REAL NOT NULL,
      snapshot_date TEXT NOT NULL DEFAULT (date('now')),
      snapshot_month TEXT NOT NULL,
      search_lat REAL,
      search_lng REAL,
      search_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rate_history_month ON rate_history(snapshot_month);
    CREATE INDEX IF NOT EXISTS idx_rate_history_search ON rate_history(search_lat, search_lng);
    CREATE INDEX IF NOT EXISTS idx_rate_history_facility ON rate_history(facility_name, unit_size);
  `);

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Check if we already have data for this month + location (within 0.01 degrees ≈ 0.7 miles)
  const existing = db.prepare(`
    SELECT COUNT(*) as cnt FROM rate_history
    WHERE snapshot_month = ?
    AND ABS(search_lat - ?) < 0.01
    AND ABS(search_lng - ?) < 0.01
  `).get(month, searchLat, searchLng);

  if (existing?.cnt > 0) {
    console.log(`[reit-scraper] T12: Already have ${month} data for this location, skipping`);
    return;
  }

  // Insert all scraped units
  const insert = db.prepare(`
    INSERT INTO rate_history (facility_name, brand, facility_address, facility_lat, facility_lng,
      unit_size, is_cc, in_store_rate, web_rate, rate_psf, snapshot_month, search_lat, search_lng, search_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((units) => {
    for (const u of units) {
      insert.run(
        u.facility_name, u.brand, u.facility_address, u.facility_lat, u.facility_lng,
        u.unit_size, u.is_cc, u.in_store_rate, u.web_rate, u.rate_psf,
        month, searchLat, searchLng, scrapedData.search_address
      );
    }
  });

  insertMany(scrapedData.raw_units);
  console.log(`[reit-scraper] T12: Stored ${scrapedData.raw_units.length} rate records for ${month}`);
}

// ── T12 Trailing Twelve Month Rate Calculation ───────────────────────────────
// Only returns data when >= 3 months of history exist
// Weights: 10x10 CC = 65%, 10x10 Non-CC = 20%, Other = 15%

export function getT12Rates(db, lat, lng, radiusMiles = 5) {
  if (!db) return null;

  // Check if table exists
  try {
    db.prepare("SELECT 1 FROM rate_history LIMIT 1").get();
  } catch {
    return null; // Table doesn't exist yet
  }

  const degreesApprox = radiusMiles / 69; // rough lat/lng to miles

  // Get distinct months with data near this location
  const months = db.prepare(`
    SELECT DISTINCT snapshot_month
    FROM rate_history
    WHERE ABS(search_lat - ?) < ? AND ABS(search_lng - ?) < ?
    ORDER BY snapshot_month DESC
    LIMIT 12
  `).all(lat, degreesApprox, lng, degreesApprox);

  if (months.length < 3) {
    console.log(`[reit-scraper] T12: Only ${months.length} months of data (need 3+), not showing T12`);
    return { insufficient_data: true, months_available: months.length, months_needed: 3 };
  }

  // Get all rate data for the T12 period
  const t12Data = db.prepare(`
    SELECT * FROM rate_history
    WHERE ABS(search_lat - ?) < ? AND ABS(search_lng - ?) < ?
    AND snapshot_month IN (${months.map(() => "?").join(",")})
    ORDER BY snapshot_month DESC
  `).all(lat, degreesApprox, lng, degreesApprox, ...months.map(m => m.snapshot_month));

  if (!t12Data.length) return null;

  // Compute T12 weighted average (weighted toward 10x10 CC)
  const cc10x10 = t12Data.filter(r => r.unit_size === "10x10" && r.is_cc === 1);
  const noncc10x10 = t12Data.filter(r => r.unit_size === "10x10" && r.is_cc === 0);
  const other = t12Data.filter(r => r.unit_size !== "10x10");

  const monthlyRates = {};
  for (const m of months) {
    const mo = m.snapshot_month;
    const moData = t12Data.filter(r => r.snapshot_month === mo);
    const ccRates = moData.filter(r => r.unit_size === "10x10" && r.is_cc === 1);
    const nccRates = moData.filter(r => r.unit_size === "10x10" && r.is_cc === 0);

    monthlyRates[mo] = {
      cc_10x10_psf: ccRates.length ? median(ccRates.map(r => r.rate_psf).sort((a, b) => a - b)) : null,
      noncc_10x10_psf: nccRates.length ? median(nccRates.map(r => r.rate_psf).sort((a, b) => a - b)) : null,
      sample_count: moData.length,
    };
  }

  // Overall T12 averages
  const allCcRates = cc10x10.map(r => r.rate_psf);
  const allNonccRates = noncc10x10.map(r => r.rate_psf);

  return {
    source: "t12_scraped",
    months_covered: months.length,
    period: `${months[months.length - 1].snapshot_month} to ${months[0].snapshot_month}`,
    cc_10x10_t12: allCcRates.length ? {
      avg_psf: Math.round(avg(allCcRates) * 100) / 100,
      median_psf: median(allCcRates.sort((a, b) => a - b)),
      low: Math.min(...allCcRates),
      high: Math.max(...allCcRates),
      sample_count: allCcRates.length,
    } : null,
    noncc_10x10_t12: allNonccRates.length ? {
      avg_psf: Math.round(avg(allNonccRates) * 100) / 100,
      median_psf: median(allNonccRates.sort((a, b) => a - b)),
      sample_count: allNonccRates.length,
    } : null,
    monthly_trend: monthlyRates,
    total_records: t12Data.length,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectBrand(name) {
  const n = name.toLowerCase();
  if (/public storage/i.test(n)) return "public_storage";
  if (/extra space/i.test(n)) return "extra_space";
  if (/cubesmart/i.test(n)) return "cubesmart";
  if (/life storage/i.test(n)) return "life_storage";
  if (/iron guard/i.test(n)) return "iron_guard";
  if (/storquest/i.test(n)) return "storquest";
  if (/simply self/i.test(n)) return "simply_self_storage";
  return "independent";
}

function median(sorted) {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}
