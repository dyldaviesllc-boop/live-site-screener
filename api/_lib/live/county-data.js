// ── County Parcel & Zoning Data Fetcher ──────────────────────────────────────
// Queries free public ArcGIS REST APIs and Socrata endpoints for real parcel data
// Falls back gracefully when a county isn't configured or API is down

import { COUNTY_CONFIGS, getCountyByFips } from "./county-config.js";

const TIMEOUT = 10000;

// ── FIPS lookup via Census geocoder (free, no key) ──────────────────────────

const fipsCache = new Map();

/**
 * Get county FIPS code from lat/lng using Census geocoder
 */
export async function getCountyFips(lat, lng) {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (fipsCache.has(cacheKey)) return fipsCache.get(cacheKey);
  if (fipsCache.size > 2000) fipsCache.clear();

  try {
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    const data = await resp.json();

    const geos = data?.result?.geographies?.Counties;
    if (geos?.length) {
      const fips = geos[0].STATE + geos[0].COUNTY; // e.g. "06037" for LA County
      const result = { fips, state: geos[0].STATE, county: geos[0].COUNTY, name: geos[0].NAME };
      fipsCache.set(cacheKey, result);
      return result;
    }
  } catch (e) {
    console.warn("[county-data] FIPS lookup failed:", e.message);
  }

  fipsCache.set(cacheKey, null);
  return null;
}

// ── ArcGIS REST query ───────────────────────────────────────────────────────

/**
 * Query an ArcGIS REST endpoint by address
 */
async function queryArcGIS(serviceUrl, addressField, addressQuery, outFields = "*", maxRecords = 5) {
  try {
    // Clean the address for SQL LIKE query — basic normalization (keeps street suffixes)
    const cleanAddr = normalizeAddrForQuery(addressQuery)
      .replace(/['"%;_\-\-]/g, "")  // strip all SQL-sensitive chars
      .trim();

    const params = new URLSearchParams({
      where: `UPPER(${addressField}) LIKE '%${cleanAddr}%'`,
      outFields,
      returnGeometry: "false",
      resultRecordCount: String(maxRecords),
      f: "json",
    });

    const url = `${serviceUrl}/query?${params}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!resp.ok) return null;

    const data = await resp.json();
    if (data.error) {
      console.warn(`[county-data] ArcGIS error: ${data.error.message}`);
      return null;
    }

    return data.features?.map(f => f.attributes) || [];
  } catch (e) {
    console.warn(`[county-data] ArcGIS query failed: ${e.message}`);
    return null;
  }
}

// ── Socrata SODA query ──────────────────────────────────────────────────────

/**
 * Normalize street address for LIKE queries
 * Basic: just takes the street address part (before comma), cleans quotes
 * Aggressive (for NYC PLUTO): also strips ordinals + suffixes
 */
function normalizeAddrForQuery(addr, aggressive = false) {
  let clean = addr
    .split(",")[0]           // remove city, state, zip
    .trim()
    .toUpperCase()
    .replace(/'/g, "");       // strip single quotes

  if (aggressive) {
    // NYC PLUTO uses "5 AVENUE" not "5TH AVE" — strip suffixes + ordinals
    clean = clean
      .replace(/\b(AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|LN|LANE|CT|COURT|PL|PLACE|WAY|CIR|CIRCLE|TER|TERRACE|PKY|PKWY|PARKWAY|HWY|HIGHWAY)\b\.?/g, "")
      .replace(/\b(ST|STREET)\b\.?(?!\s*\w)/g, "")  // strip trailing ST/STREET only at end
      .replace(/(\d+)(ST|ND|RD|TH)\b/g, "$1")        // "5TH" → "5", "3RD" → "3"
      .replace(/\s+/g, " ").trim();
  }

  return clean.replace(/\s+/g, " ").trim();
}

/**
 * Query a Socrata dataset by address
 */
async function querySocrata(baseUrl, addressField, addressQuery, limit = 5) {
  try {
    const cleanAddr = normalizeAddrForQuery(addressQuery);

    // Build URL with proper encoding for Socrata SoQL
    const whereClause = `upper(${addressField}) like '%${cleanAddr}%'`;
    const url = `${baseUrl}?$where=${encodeURIComponent(whereClause)}&$limit=${limit}`;

    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!resp.ok) {
      console.warn(`[county-data] Socrata ${resp.status} for ${cleanAddr}`);
      return null;
    }

    const results = await resp.json();

    // If no results, retry with aggressive normalization (NYC PLUTO format)
    // Use prefix match (no leading %) to avoid broad fuzzy matches like "1350" for "350"
    if ((!results || results.length === 0) && cleanAddr !== normalizeAddrForQuery(addressQuery, true)) {
      const aggressiveAddr = normalizeAddrForQuery(addressQuery, true);
      const aggressiveWhere = `upper(${addressField}) like '${aggressiveAddr}%'`;
      const aggressiveUrl = `${baseUrl}?$where=${encodeURIComponent(aggressiveWhere)}&$limit=${limit}`;
      const aggressiveResp = await fetch(aggressiveUrl, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (aggressiveResp.ok) {
        const aggressiveResults = await aggressiveResp.json();
        if (aggressiveResults?.length) return aggressiveResults;
      }
    }

    return results;
  } catch (e) {
    console.warn(`[county-data] Socrata query failed: ${e.message}`);
    return null;
  }
}

// ── Normalize results to standard schema ────────────────────────────────────

function mapFields(record, fieldMapping) {
  const result = {};
  for (const [standardKey, sourceField] of Object.entries(fieldMapping)) {
    if (sourceField && record[sourceField] != null) {
      result[standardKey] = record[sourceField];
    }
  }
  return result;
}

function normalizeParcelData(mapped) {
  const result = { ...mapped };

  // Normalize lot_sf from acres if only acres available
  if (!result.lot_sf && result.lot_acres) {
    result.lot_sf = Math.round(parseFloat(result.lot_acres) * 43560);
  }
  // Normalize lot_acres from sf if only sf available
  if (!result.lot_acres && result.lot_sf) {
    result.lot_acres = Math.round(parseFloat(result.lot_sf) / 43560 * 100) / 100;
  }

  // Ensure numeric fields are numbers
  for (const key of ["lot_sf", "lot_acres", "building_sf", "year_built"]) {
    if (result[key] != null) result[key] = parseFloat(result[key]) || null;
  }

  // Ensure string fields are trimmed
  for (const key of ["address", "owner", "apn", "zoning", "land_use"]) {
    if (result[key] && typeof result[key] === "string") {
      result[key] = result[key].trim();
    }
  }

  return result;
}

// ── Main: Get parcel data for an address ────────────────────────────────────

/**
 * Fetch real parcel data + zoning for an address using free public APIs
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} address - Full street address
 * @returns {object} Parcel data with lot_sf, building_sf, zoning, owner, etc.
 */
export async function getParcelData(lat, lng, address) {
  // Step 1: Determine which county this is in
  const fipsInfo = await getCountyFips(lat, lng);
  if (!fipsInfo) {
    return { error: "Could not determine county", source: null };
  }

  const county = getCountyByFips(fipsInfo.fips);
  if (!county) {
    return {
      error: `County not configured: ${fipsInfo.name} (FIPS ${fipsInfo.fips})`,
      county_name: fipsInfo.name,
      fips: fipsInfo.fips,
      source: null,
    };
  }

  const result = {
    county_name: county.name,
    county_key: county.key,
    fips: fipsInfo.fips,
    source: "county_arcgis",
    parcel: null,
    zoning: null,
  };

  // Step 2: Query parcel data
  if (county.parcel && county.searchByAddress !== false) {
    const records = await queryArcGIS(
      county.parcel.url,
      county.parcel.addressField,
      address,
      "*",
      5
    );
    if (records?.length) {
      result.parcel = normalizeParcelData(mapFields(records[0], county.parcel.fields));
      result.source = "county_arcgis";

      // Harris County: assemble address from components
      if (county.key === "harris_tx" && !result.parcel.address && records[0]) {
        const r = records[0];
        const parts = [r.site_str_num, r.site_str_pfx, r.site_str_name, r.site_str_sfx].filter(Boolean);
        if (parts.length) result.parcel.address = parts.join(" ").trim();
      }

      // If zoning comes from parcel layer, extract it
      if (county.zoning?.source === "parcel" && result.parcel.zoning) {
        result.zoning = { code: result.parcel.zoning, source: "county_parcel" };
      }
    }
  }

  // Step 2b: If county uses Socrata as primary (Cook County, NYC)
  if (!result.parcel && county.socrata) {
    const records = await querySocrata(
      county.socrata.url,
      county.socrata.addressField,
      address,
      5
    );
    if (records?.length) {
      result.parcel = normalizeParcelData(mapFields(records[0], county.socrata.fields));
      result.source = "county_socrata";

      // NYC PLUTO includes zoning + FAR
      if (county.zoning?.source === "socrata" && result.parcel.zoning) {
        result.zoning = {
          code: result.parcel.zoning,
          source: "socrata_pluto",
          // NYC PLUTO has FAR built in
          far: result.parcel.far ? parseFloat(result.parcel.far) : null,
          max_far: result.parcel.max_far ? parseFloat(result.parcel.max_far) : null,
          com_far: result.parcel.com_far ? parseFloat(result.parcel.com_far) : null,
          lot_front: result.parcel.lot_front ? parseFloat(result.parcel.lot_front) : null,
          lot_depth: result.parcel.lot_depth ? parseFloat(result.parcel.lot_depth) : null,
          num_floors: result.parcel.num_floors ? parseFloat(result.parcel.num_floors) : null,
        };
      }

      // Cook County: supplement with characteristics dataset (lot SF, bldg SF, year built)
      if (county.socrata_characteristics && result.parcel.apn) {
        try {
          const pin = result.parcel.apn;
          const charUrl = `${county.socrata_characteristics.url}?pin=${encodeURIComponent(pin)}&$order=year DESC&$limit=1`;
          const charResp = await fetch(charUrl, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(TIMEOUT),
          });
          if (charResp.ok) {
            const charData = await charResp.json();
            if (charData?.length) {
              const charMapped = mapFields(charData[0], county.socrata_characteristics.fields);
              // Fill in missing fields from characteristics
              if (!result.parcel.lot_sf && charMapped.lot_sf) result.parcel.lot_sf = parseFloat(charMapped.lot_sf) || null;
              if (!result.parcel.building_sf && charMapped.building_sf) result.parcel.building_sf = parseFloat(charMapped.building_sf) || null;
              if (!result.parcel.year_built && charMapped.year_built) result.parcel.year_built = parseFloat(charMapped.year_built) || null;
              if (!result.parcel.land_use && charMapped.land_use) result.parcel.land_use = charMapped.land_use;
              // Re-normalize after adding fields
              result.parcel = normalizeParcelData(result.parcel);
            }
          }
        } catch (e) {
          console.warn(`[county-data] Cook County characteristics lookup failed: ${e.message}`);
        }
      }
    }
  }

  // Step 3: Supplemental assessor data (building SF, year built) if parcel layer didn't have it
  if (result.parcel && county.assessor && (!result.parcel.building_sf || !result.parcel.year_built)) {
    const assessorRecords = await queryArcGIS(
      county.assessor.url,
      county.parcel.addressField,  // reuse same address field
      address,
      "*",
      3
    );
    if (assessorRecords?.length) {
      const assessorData = mapFields(assessorRecords[0], county.assessor.fields);
      // Fill in missing fields only
      if (!result.parcel.building_sf && assessorData.building_sf) {
        result.parcel.building_sf = parseFloat(assessorData.building_sf) || null;
      }
      if (!result.parcel.year_built && assessorData.year_built) {
        result.parcel.year_built = parseFloat(assessorData.year_built) || null;
      }
      if (!result.parcel.zoning && assessorData.zoning) {
        result.parcel.zoning = assessorData.zoning;
        result.zoning = { code: assessorData.zoning, source: "county_assessor" };
      }
    }
  }

  // Step 3b: Supplemental Socrata data (King County eReal Property)
  if (result.parcel && county.socrata && county.parcel && (!result.parcel.building_sf || !result.parcel.year_built)) {
    const socrataRecords = await querySocrata(
      county.socrata.url,
      county.socrata.addressField,
      address,
      3
    );
    if (socrataRecords?.length) {
      const socrataData = mapFields(socrataRecords[0], county.socrata.fields);
      if (!result.parcel.building_sf && socrataData.building_sf) {
        result.parcel.building_sf = parseFloat(socrataData.building_sf) || null;
      }
      if (!result.parcel.year_built && socrataData.year_built) {
        result.parcel.year_built = parseFloat(socrataData.year_built) || null;
      }
    }
  }

  // Step 4: Separate zoning query if needed
  if (!result.zoning && county.zoning?.url) {
    // ArcGIS zoning layer (e.g., Denver)
    const zoningRecords = await queryArcGIS(
      county.zoning.url,
      county.parcel?.addressField || "ADDRESS",
      address,
      county.zoning.fields ? Object.values(county.zoning.fields).join(",") : "*",
      3
    );
    if (zoningRecords?.length) {
      const zoningData = county.zoning.fields ? mapFields(zoningRecords[0], county.zoning.fields) : zoningRecords[0];
      result.zoning = { code: zoningData.zoning || Object.values(zoningData)[0], source: "county_zoning_layer" };
    }
  }

  // Step 4b: Socrata zoning query (e.g., Austin zoning-by-address)
  if (!result.zoning && county.zoning?.socrata_url) {
    const zoningRecords = await querySocrata(
      county.zoning.socrata_url,
      county.zoning.fields ? Object.keys(county.zoning.fields)[0] : "address",
      address,
      3
    );
    if (zoningRecords?.length) {
      const zoningData = county.zoning.fields ? mapFields(zoningRecords[0], county.zoning.fields) : zoningRecords[0];
      result.zoning = { code: zoningData.zoning || Object.values(zoningData)[0], source: "socrata_zoning" };
    }
  }

  // Houston special case
  if (county.zoning?.note) {
    result.zoning_note = county.zoning.note;
  }

  return result;
}
