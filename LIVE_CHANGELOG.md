# Live Site Screener — Changelog

---

## v1.2.0 — StorTrack API Integration (2026-03-19)

### Added
- **Real StorTrack API integration** — OAuth2 Password Flow via `POST /authtoken`, live rate queries via `POST /pricesbyradius`
- **Token caching** — OAuth2 access tokens cached with auto-refresh on expiry (60s safety buffer)
- **401 auto-retry** — If token expires mid-session, clears cache and re-authenticates automatically
- **Full response parsing** — Extracts per-unit rates by size, climate control status, and space type
- **Rate statistics** — Computes low/high/median/avg for CC and Non-CC 10x10 units separately
- **T12 estimation** — Street rates × 1.20 factor for estimated achieved rates (industry standard)
- **Facility detail capture** — Stores name, address, total/rentable sqft, unit breakdown per competitor
- **Enhanced prompt injection** — AI screening prompts now include separate CC/Non-CC rate ranges with sample counts

### Changed
- **Auth method** — Switched from `STORTRACK_API_KEY` (Bearer token) to `STORTRACK_USERNAME` + `STORTRACK_PASSWORD` (OAuth2 Password Flow)
- **API endpoint** — Switched from placeholder `GET /rates/nearby` to real `POST /pricesbyradius`
- **`.env.example`** — Updated with StorTrack credential variables and cleaned up removed services (ESRI, SerpAPI)
- **`server.js`** — Fixed `hasLiveSources` check: added `county_data`, removed stale `esri` reference
- **`index.js`** — Source detection now checks `STORTRACK_USERNAME && STORTRACK_PASSWORD`

---

## v1.1.0 — Full Live Data Pipeline (2026-03-19)

### Added
- **Live Data Sources indicator** — Results tab shows green/red badges for each data source (census, county_data, google_places, stortrack, tractiq)
- **County Data panel** — Expanded result detail now shows Zoning Code, Land Use, Owner, County, Data Sources from live county records
- **CSV export enhanced** — Now includes County, Zoning Code, Land Use, Owner, Building SF, Acreage, Data Sources columns
- **Feasibility data attribution** — Shows county name, "Zoning Verified" badge, and data source tags in dev analysis
- **Address normalization** — Smart suffix stripping for Socrata queries (NYC PLUTO uses "5 AVENUE" not "5TH AVE") with prefix-match retry

### Fixed
- **`/api/live-data` endpoint** — Was missing `address` parameter in `getSiteData()` call, so county parcel data was never fetched
- **`/api/screen` criteria null crash** — `critText()` now handles null/undefined criteria gracefully
- **Stale Vite ports** — Resolved port conflicts from accumulated dev server instances
- **Express 5 server exit** — Previous "exited with code 0" was caused by stale process holding port 3784

### Verified Working End-to-End
- **Tarrant County** — Returns lot SF, building SF, year built, owner, land use from county ArcGIS
- **NYC PLUTO** — Returns lot area, building area, zoning (R6B), FAR, owner, year built from Socrata
- **Census API** — Returns tract-level population, HHI, households, home values, trade area estimates
- **Full screening** — Geocode → Census + County data → Claude scoring → Rate capping → Result merge all working

---

## v1.0.1 — County ArcGIS Field Tuning (2026-03-19)

### Fixed
- **All 15 county configs tuned** — Field names verified against live ArcGIS/Socrata endpoint metadata
  - **LA County** — Uses `SQFTmain1`, `YearBuilt1` directly from parcel layer (no separate assessor needed)
  - **Dallas** — New working URL: `ParcelQuery/MapServer/4` with `SITEADDRESS`, `RESFLRAREA`, `RESYRBLT`, `OWNERNME1`; added City of Dallas zoning layer
  - **Tarrant** — New working URL: `mapit.tarrantcounty.com/Tax/TCProperty/MapServer/0` with `SITUS_ADDR`, `LAND_SQFT`, `LIVING_ARE`, `YEAR_BUILT`
  - **Maricopa** — Fixed: `PHYSICAL_ADDRESS` (not SITUS), `LAND_SIZE`, `LIVING_SPACE`, `CONST_YEAR`, `CITY_ZONING`
  - **Harris** — Fixed: `site_str_name` for address search, `land_sqft`, `owner_name_1`; address assembled from components
  - **Cook County** — Split into 2 Socrata datasets: addresses (`3723-97qp`) + characteristics (`5pge-nu6u`); auto-joins on PIN
  - **Denver** — New working URL: `CCD_Parcels/FeatureServer/116`; fields prefixed `sd_SpatialJoin7_`; has zoning (`ZONE_ID`), year built, building SF
  - **Fulton GA** — New ArcGIS org URL: `AQDHTHDrZzfsFsB5/Tax_Parcels`; fields: `Address`, `Owner`, `LandAcres`, `LUCode`
  - **Nashville** — Fixed: `PropAddr`, `StatedArea`, `Owner`, `LUDesc`, `APN`
  - **Orange FL** — Fixed: layer 216 (not 0); `SITUS`, `LIVING_AREA`, `AYB`, `NAME1`, `ZONING_CODE`, `ACREAGE`
  - **Mecklenburg** — Moved to correct URL (`gis.charlottenc.gov`); minimal fields (PID only); marked `searchByAddress: false`
  - **Hillsborough** — New URL: `gis.hcpafl.org/Webmaps/HillsboroughFL_WebParcels`; limited: `FullAddress`, `Owner1`, `folio`
  - **Travis** — Fixed: `situs_address`, `tcad_acres`, `PROP_ID`
  - **King County** — Confirmed parcel layer has only PIN; Socrata eReal Property is primary data source
  - **NYC** — Already working (unchanged)

### Changed
- **`county-data.js`** — Added Cook County multi-dataset join (address lookup → PIN → characteristics lookup)
- **`county-data.js`** — Added Harris County address assembly from component fields (`site_str_num` + `site_str_pfx` + `site_str_name` + `site_str_sfx`)
- **`county-data.js`** — Skip ArcGIS parcel query when `searchByAddress: false` (Mecklenburg)
- **County configs organized into tiers** — Tier 1 (rich data), Tier 2 (good data), Tier 3 (limited)

---

## v1.0.0 — Live Data Foundation (2026-03-19)

### Added
- **County ArcGIS Integration** — 15 county/city APIs configured for free parcel + zoning data
  - `api/_lib/live/county-config.js` — Endpoint configs for LA, Dallas, Tarrant, King, Maricopa, Harris, Cook, NYC, Denver, Fulton, Davidson, Mecklenburg, Orange FL, Hillsborough, Travis counties
  - `api/_lib/live/county-data.js` — Queries ArcGIS REST + Socrata APIs for lot size, building SF, acreage, owner, zoning code
  - Automatic county detection via Census FIPS reverse geocode
  - Falls back gracefully for unconfigured counties

- **Zoning Rules Parser** — Real zoning codes → structured development standards
  - `api/_lib/live/zoning-rules.js` — Takes real zoning code from county data, uses Claude to parse municipal code for setbacks, FAR, height limits, permitted uses
  - NYC PLUTO data parsed directly (already has FAR, lot dimensions — no Claude needed)
  - Results cached per (city, zoning_code) to avoid redundant API calls

- **Live Data Orchestrator Rewrite** — `api/_lib/live/index.js`
  - Added county parcel + zoning data as always-available source
  - Parcel data (lot SF, building SF, owner) injected into screening prompts
  - Zoning code injected into feasibility prompts
  - Removed ESRI dependency (Census API sufficient)
  - Removed SerpAPI dependency (broker scraping eliminated)

- **Server.js Live Data Integration**
  - Geocoding via Nominatim (free) for all addresses
  - County FIPS detection → route to correct ArcGIS endpoint
  - Parcel data merged into screening results (_zoning_code, _land_use, _owner, _county)
  - Feasibility endpoint now fetches real parcel data + zoning rules before calling Claude
  - Claude receives real zoning code + development standards in feasibility prompts
  - Live StorTrack data used for rate capping when available
  - `/api/live-status` endpoint for checking configured sources
  - `/api/live-data` endpoint for testing individual address lookups

- **Vite proxy** — `/api` requests proxied from :3786 to Express :3784

- **100-site import cap** — Frontend enforces MAX_SITES = 100 with visual warning

- **Deploy plan** — `DEPLOY_PLAN.md` with full budget breakdown and phased rollout

- **County portal reference** — `COUNTY_PORTAL_REFERENCE.md` with URLs and API details for all 15 markets

### Changed
- **`api/_lib/validate.js`** — `validateAndCapRates()` now accepts optional `liveDataMap` parameter for StorTrack live rate capping
- **`src/App.jsx`** — Placeholder text updated (removed CoStar branding, shows "paste from spreadsheet")
- **`src/App.jsx`** — Sites capped at 100 via `MAX_SITES` constant
- **`src/App.jsx`** — "Find Broker" / "Re-scrape Listing" buttons replaced with "View Details"
- **`src/App.jsx`** — Google verify link no longer includes `site:costar.com`

### Removed
- **ESRI module** — Census API provides sufficient demographics for free
- **SerpAPI module** — No longer imported or used (broker scraping eliminated)
- **Broker enrichment endpoint** (`/api/enrich-brokers`) — Entire endpoint removed from server.js
- **Broker manual update endpoint** (`/api/results/:id/broker`) — Removed from server.js
- **`BROKER_SYS_PROMPT`** — Removed from server.js
- **CoStar references** — Removed from UI placeholder text and verify links
- **LoopNet/Crexi page scraping** — All automated page fetching eliminated

### Security / Legal
- Eliminated all CoStar/LoopNet scraping risk
- All data sources are either: (1) licensed commercial APIs, (2) free public government APIs, or (3) AI judgment
- 100-site cap prevents bulk export patterns that could flag CoStar
- No proprietary data from any source touches the app without a paid API license

### Architecture
```
Address → Nominatim (geocode) → Census FIPS (county detect)
  → County ArcGIS (parcel + zoning)     FREE
  → Census API (demographics)            FREE
  → Google Places (competitors)           ~$64/mo
  → StorTrack (rates)                     $49-99/mo
  → TractIQ (occupancy)                   $0 (firm)
  → Claude (scoring + judgment ONLY)      ~$25/mo
```

### Budget
- **Phase 1 (now):** ~$25/mo (Claude API only — all other sources free)
- **Phase 2 (+ paid APIs):** ~$138-188/mo
- **Previous Plan C estimate:** $350-550/mo (eliminated $200-400/mo via free public APIs)
