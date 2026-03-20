// ── County ArcGIS REST API Configuration ─────────────────────────────────────
// Maps counties to their public ArcGIS REST endpoints for parcel + zoning data
// All endpoints are FREE public government APIs returning JSON
//
// TUNED 2026-03-19: All field names verified against live endpoint metadata
//
// To add a new county:
//   1. Find their ArcGIS REST services root (usually: maps.{county}.gov/arcgis/rest/services)
//   2. Browse layers to find Parcels MapServer/FeatureServer
//   3. Identify the field names for address, lot size, building SF, zoning, etc.
//   4. Add a config entry below with the URL + field mapping
//   5. Test with: GET {url}/query?where=1=1&outFields=*&resultRecordCount=1&f=json

// ── Field mapping standard ──────────────────────────────────────────────────
// Each county maps its fields to our standard schema:
//   address     → site address
//   lot_sf      → lot size in square feet
//   lot_acres   → lot acreage
//   building_sf → total building area (SF)
//   year_built  → year structure built
//   zoning      → zoning code/designation
//   land_use    → land use description
//   owner       → property owner name
//   apn         → assessor parcel number

export const COUNTY_CONFIGS = {

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: Rich parcel data with building SF, year built, owner
  // ═══════════════════════════════════════════════════════════════════════════

  "los_angeles_ca": {
    name: "Los Angeles County, CA",
    fips: "06037",
    // LA County parcel layer has EVERYTHING — no separate assessor query needed
    parcel: {
      url: "https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0",
      addressField: "SitusAddress",
      fields: {
        address: "SitusAddress",
        apn: "AIN",
        land_use: "UseType",
        building_sf: "SQFTmain1",       // primary structure SF
        year_built: "YearBuilt1",        // primary structure year
        lot_sf: "Shape.STArea()",        // parcel geometry area (sq ft in state plane)
      },
    },
    zoning: {
      url: null,
      source: "parcel",  // no zoning field on parcel layer; Claude estimates from land_use
    },
    searchByAddress: true,
  },

  "dallas_tx": {
    name: "Dallas County, TX",
    fips: "48113",
    // DCAD ParcelQuery MapServer layer 4 = ParcelPublishing (verified 2026-03-19)
    parcel: {
      url: "https://maps.dcad.org/prdwa/rest/services/Property/ParcelQuery/MapServer/4",
      addressField: "SITEADDRESS",
      fields: {
        address: "SITEADDRESS",
        building_sf: "RESFLRAREA",       // residential floor area (null for commercial)
        year_built: "RESYRBLT",          // residential year built
        land_use: "CLASSDSCRP",          // "SINGLE FAMILY RESIDENCES", "COMMERCIAL", etc.
        owner: "OWNERNME1",
        apn: "PARCELID",
      },
    },
    // Zoning from City of Dallas separate layer (spatial query needed)
    zoning: {
      url: "https://egis.dallascityhall.com/arcgis/rest/services/Sdc_public/Zoning/MapServer/15",
      source: "arcgis",
      fields: { zoning: "ZONE_DIST" },
    },
    searchByAddress: true,
  },

  "tarrant_tx": {
    name: "Tarrant County, TX",
    fips: "48439",
    // Tarrant County Tax MapServer (verified 2026-03-19)
    parcel: {
      url: "https://mapit.tarrantcounty.com/arcgis/rest/services/Tax/TCProperty/MapServer/0",
      addressField: "SITUS_ADDR",
      fields: {
        address: "SITUS_ADDR",
        lot_sf: "LAND_SQFT",
        lot_acres: "LAND_ACRES",
        building_sf: "LIVING_ARE",       // living area SF
        year_built: "YEAR_BUILT",
        land_use: "DESCR",
        owner: "OWNER_NAME",
        apn: "ACCOUNT",
      },
    },
    zoning: {
      url: null,
      source: "parcel",
    },
    searchByAddress: true,
  },

  "king_wa": {
    name: "King County, WA",
    fips: "53033",
    // King County parcel layer only has PIN + geometry — all detail from Socrata
    parcel: {
      url: "https://gismaps.kingcounty.gov/arcgis/rest/services/Property/KingCo_Parcels/MapServer/0",
      addressField: "PIN",               // parcel layer has no address field
      fields: {
        apn: "PIN",
      },
    },
    // King County eReal Property on Socrata — primary data source
    socrata: {
      url: "https://data.kingcounty.gov/resource/4zym-vfd2.json",
      addressField: "addr_full",
      fields: {
        address: "addr_full",
        building_sf: "bldg_sqft",
        year_built: "yr_built",
        lot_sf: "lot_sqft",
      },
    },
    zoning: {
      url: null,
      source: "parcel",
    },
    searchByAddress: true,
  },

  "maricopa_az": {
    name: "Maricopa County, AZ",
    fips: "04013",
    // Maricopa County Assessor parcels (verified 2026-03-19)
    parcel: {
      url: "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0",
      addressField: "PHYSICAL_ADDRESS",   // full property address
      fields: {
        address: "PHYSICAL_ADDRESS",
        lot_sf: "LAND_SIZE",             // land size (units vary)
        owner: "OWNER_NAME",
        apn: "APN",
        building_sf: "LIVING_SPACE",     // living space SF
        year_built: "CONST_YEAR",        // construction year
        zoning: "CITY_ZONING",           // city zoning code
        land_use: "PUC",                 // property use code
      },
    },
    zoning: {
      url: null,
      source: "parcel",  // CITY_ZONING field on parcel layer
    },
    searchByAddress: true,
  },

  "harris_tx": {
    name: "Harris County, TX",
    fips: "48201",
    // HCAD parcels (verified 2026-03-19)
    parcel: {
      url: "https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0",
      addressField: "site_str_name",      // search by street name (no single full-address field)
      fields: {
        lot_acres: "Acreage",
        lot_sf: "land_sqft",
        owner: "owner_name_1",
        apn: "HCAD_NUM",
        land_use: "land_use",
        // Address assembled in county-data.js from: site_str_num + site_str_pfx + site_str_name + site_str_sfx
      },
    },
    zoning: {
      url: null,
      source: null,  // Houston has no zoning!
      note: "Houston has no zoning. Development governed by subdivision ordinances and deed restrictions.",
    },
    searchByAddress: true,
  },

  "cook_il": {
    name: "Cook County, IL",
    fips: "17031",
    // Cook County splits data across multiple Socrata datasets
    // Primary: Parcel Addresses (has address + owner via mail_address_name)
    socrata: {
      url: "https://datacatalog.cookcountyil.gov/resource/3723-97qp.json",
      addressField: "prop_address_full",
      fields: {
        address: "prop_address_full",
        owner: "mail_address_name",      // mailing name ≈ owner
        apn: "pin",
      },
    },
    // Supplemental: Residential characteristics (lot SF, bldg SF, year built)
    socrata_characteristics: {
      url: "https://datacatalog.cookcountyil.gov/resource/5pge-nu6u.json",
      joinField: "pin",                  // join to address dataset on PIN
      fields: {
        lot_sf: "char_land_sf",
        building_sf: "char_bldg_sf",
        year_built: "char_yrblt",
        land_use: "class",
      },
    },
    zoning: {
      // Chicago zoning on Chicago Data Portal
      socrata_url: "https://data.cityofchicago.org/resource/7cve-jgbp.json",
      source: "socrata",
    },
    searchByAddress: true,
  },

  "nyc_ny": {
    name: "New York City, NY",
    fips: "36061",  // Manhattan; NYC spans multiple FIPS
    fips_all: ["36005", "36047", "36061", "36081", "36085"],  // Bronx, Kings, NY, Queens, Richmond
    // PLUTO is the gold standard — 80+ fields per tax lot (verified working)
    socrata: {
      url: "https://data.cityofnewyork.us/resource/64uk-42ks.json",
      addressField: "address",
      fields: {
        address: "address",
        lot_sf: "lotarea",
        building_sf: "bldgarea",
        year_built: "yearbuilt",
        zoning: "zonedist1",
        zoning2: "zonedist2",
        land_use: "landuse",
        owner: "ownername",
        apn: "bbl",
        far: "builtfar",
        max_far: "residfar",    // residential FAR
        com_far: "commfar",     // commercial FAR
        lot_front: "lotfront",  // lot frontage in feet
        lot_depth: "lotdepth",  // lot depth in feet
        num_floors: "numfloors",
        bldg_class: "bldgclass",
      },
    },
    zoning: {
      source: "socrata",  // PLUTO includes zoning + FAR
    },
    searchByAddress: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: Good parcel data, some fields missing
  // ═══════════════════════════════════════════════════════════════════════════

  "denver_co": {
    name: "Denver County, CO",
    fips: "08031",
    // Denver CCD_Parcels FeatureServer layer 116 (verified 2026-03-19)
    // Note: Field names prefixed with "sd_SpatialJoin7_" in actual responses
    parcel: {
      url: "https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/ArcGIS/rest/services/CCD_Parcels/FeatureServer/116",
      addressField: "sd_SpatialJoin7_SITUS_ADDRESS_L",   // SITUS_ADDRESS_LINE1
      fields: {
        address: "sd_SpatialJoin7_SITUS_ADDRESS_L",
        lot_sf: "sd_SpatialJoin7_LAND_AREA",
        lot_acres: "sd_SpatialJoin7_Areaacres",
        owner: "sd_SpatialJoin7_OWNER_NAME",
        apn: "sd_SpatialJoin7_SCHEDNUM",
        land_use: "sd_SpatialJoin7_D_CLASS_CN",
        year_built: "sd_SpatialJoin7_RES_ORIG_YEAR_B",   // residential year built
        building_sf: "sd_SpatialJoin7_RES_ABOVE_GRADE",   // residential above-grade area
        zoning: "sd_SpatialJoin7_ZONE_ID",
      },
    },
    zoning: {
      url: null,
      source: "parcel",  // ZONE_ID field on parcel layer
    },
    searchByAddress: true,
  },

  "fulton_ga": {
    name: "Fulton County, GA",
    fips: "13121",
    // Fulton County Tax_Parcels (verified 2026-03-19, new ArcGIS org)
    parcel: {
      url: "https://services1.arcgis.com/AQDHTHDrZzfsFsB5/arcgis/rest/services/Tax_Parcels/FeatureServer/0",
      addressField: "Address",
      fields: {
        address: "Address",
        lot_acres: "LandAcres",
        owner: "Owner",
        apn: "ParcelID",
        land_use: "LUCode",
      },
    },
    zoning: { url: null, source: "parcel" },
    searchByAddress: true,
  },

  "davidson_tn": {
    name: "Davidson County, TN",
    fips: "47037",
    // Nashville/Davidson County parcels (verified 2026-03-19)
    parcel: {
      url: "https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels/MapServer/0",
      addressField: "PropAddr",
      fields: {
        address: "PropAddr",
        lot_sf: "StatedArea",
        lot_acres: "Acres",
        owner: "Owner",
        apn: "APN",
        land_use: "LUDesc",
        zoning: "LUCode",               // land use code (closest to zoning available)
      },
    },
    zoning: { url: null, source: "parcel" },
    searchByAddress: true,
  },

  "orange_fl": {
    name: "Orange County, FL",
    fips: "12095",
    // Orange County FL parcels — layer 216 on Public_Dynamic (verified 2026-03-19)
    parcel: {
      url: "https://ocgis4.ocfl.net/arcgis/rest/services/Public_Dynamic/MapServer/216",
      addressField: "SITUS",
      fields: {
        address: "SITUS",
        lot_acres: "ACREAGE",
        building_sf: "LIVING_AREA",
        year_built: "AYB",              // actual year built
        owner: "NAME1",
        apn: "PARCEL",
        land_use: "DOR_CODE",
        zoning: "ZONING_CODE",
      },
    },
    zoning: { url: null, source: "parcel" },
    searchByAddress: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: Limited fields — address + owner + geometry only
  // ═══════════════════════════════════════════════════════════════════════════

  "mecklenburg_nc": {
    name: "Mecklenburg County, NC",
    fips: "37119",
    // Mecklenburg parcel layer has minimal fields (PID + geometry only)
    // Charlotte/Mecklenburg uses a separate property lookup system
    parcel: {
      url: "https://gis.charlottenc.gov/arcgis/rest/services/CountyData/Parcels/MapServer/0",
      addressField: "PID",               // no address field; PID is parcel ID
      fields: {
        apn: "PID",
      },
    },
    // TODO: Find Mecklenburg County CAMA/assessor API for address + building data
    zoning: { url: null, source: "parcel" },
    searchByAddress: false,              // can't search by address on parcel layer
  },

  "hillsborough_fl": {
    name: "Hillsborough County, FL",
    fips: "12057",
    // Hillsborough County WebParcels (verified 2026-03-19)
    // Limited fields: address, owner, sale info, geometry only
    parcel: {
      url: "https://gis.hcpafl.org/arcgis/rest/services/Webmaps/HillsboroughFL_WebParcels/MapServer/0",
      addressField: "FullAddress",
      fields: {
        address: "FullAddress",
        owner: "Owner1",
        apn: "folio",
      },
    },
    // No building SF, year built, zoning on this layer
    zoning: { url: null, source: "parcel" },
    searchByAddress: true,
  },

  "travis_tx": {
    name: "Travis County, TX",
    fips: "48453",
    // Travis County / TCAD parcels (verified 2026-03-19)
    // Limited: address, acres, parcel ID — no building SF or year built
    parcel: {
      url: "https://gis.traviscountytx.gov/server1/rest/services/Boundaries_and_Jurisdictions/TCAD_public/MapServer/0",
      addressField: "situs_address",
      fields: {
        address: "situs_address",
        lot_acres: "tcad_acres",
        apn: "PROP_ID",
      },
    },
    // Austin zoning-by-address on Socrata
    zoning: {
      socrata_url: "https://data.austintexas.gov/resource/nbzi-qabm.json",
      source: "socrata",
      fields: { zoning: "zoning_ztype" },
    },
    searchByAddress: true,
  },
};

// ── County Detection via FIPS ───────────────────────────────────────────────
// Map FIPS codes to county config keys for fast lookup
const fipsToKey = {};
for (const [key, cfg] of Object.entries(COUNTY_CONFIGS)) {
  if (cfg.fips_all) {
    for (const f of cfg.fips_all) fipsToKey[f] = key;
  } else {
    fipsToKey[cfg.fips] = key;
  }
}

/**
 * Get county config by FIPS code
 */
export function getCountyByFips(fips) {
  const key = fipsToKey[fips];
  return key ? { key, ...COUNTY_CONFIGS[key] } : null;
}

/**
 * Get county config by key name
 */
function getCountyByKey(key) {
  return COUNTY_CONFIGS[key] ? { key, ...COUNTY_CONFIGS[key] } : null;
}

/**
 * List all configured counties
 */
function listCounties() {
  return Object.entries(COUNTY_CONFIGS).map(([key, cfg]) => ({
    key,
    name: cfg.name,
    fips: cfg.fips,
  }));
}
