# Live Site Screener — Data Methodology & Source Log

**Created:** March 17, 2026
**Updated:** March 20, 2026
**Status:** v1.5.0 — All core data sources live; static benchmarks demoted to last-resort fallback

---

## Methodology Overview

This tool screens self-storage development sites using **live data from real APIs**, with Claude AI limited to **judgment and scoring only**. Every data point that can be sourced from a live API is — Claude never guesses demographics, rates, competitors, or parcel data.

### Data Flow

```
Address → Nominatim geocode (free) → Census FIPS county detect (free)
  ↓
  Parallel live data fetches:
    1. Census ACS API     → population, HHI, households         [LIVE, free]
    2. County ArcGIS/Socrata → lot SF, bldg SF, owner, zoning   [LIVE, free]
    3. Google Places API  → competitor facilities + brand mix    [LIVE, ~$64/mo]
    4. REIT Facility Scraping → in-store rates from REIT pages  [LIVE, free]
    5. StorTrack API      → street rates (when configured)      [LIVE, $49-99/mo]
    6. TractIQ API        → CMBS occupancy (when configured)    [LIVE, $0 via firm]
  ↓
  All live data injected into Claude prompt
  Claude does SCORING + JUDGMENT only (does NOT guess data)
  ↓
  Server-side rate validation + score capping
  Results with source attribution per data point
```

---

## Live Data Sources (Priority Order)

### Tier 1: Always Available (Free)

| Source | Data Points | API | Status |
|---|---|---|---|
| **US Census Bureau ACS** | Population, HHI, households, home values, median age | `api.census.gov/data/{year}/acs/acs5` | ✅ Live |
| **FCC Census Block** | FIPS code, county detection | `geo.fcc.gov/api/census/block/find` | ✅ Live |
| **County ArcGIS REST** (15 counties) | Lot SF, building SF, acreage, owner, zoning code, land use | Per-county ArcGIS/Socrata endpoints | ✅ Live |
| **Nominatim** | Geocoding (lat/lng from address) | `nominatim.openstreetmap.org` | ✅ Live |

### Tier 2: Requires API Keys

| Source | Data Points | API | Status |
|---|---|---|---|
| **Google Places** | Competitor facilities, ratings, distance, brand tier | `places.googleapis.com/v1/places:searchText` | ✅ Built (needs key) |
| **REIT Facility Scraping** | In-store CC/Non-CC rates from Public Storage, CubeSmart pages | JSON-LD + HTML parsing | ✅ Live (chains off Google Places) |
| **StorTrack** | Street rates by facility, unit breakdown | `api.stortrack.com` (OAuth2 Password Flow) | ✅ Built (needs credentials) |
| **TractIQ** | CMBS facility occupancy | `api.tractiq.com/v1/facilities` | ⏳ Stub (awaiting API docs) |

### Tier 3: Optional Enhancements

| Source | Data Points | Status |
|---|---|---|
| **ESRI GeoEnrichment** | Current-year population estimates (more recent than Census) | ⏳ Stub (awaiting firm ESRI license) |
| **T12 Rate History** | Trailing-twelve-month rate trends from stored REIT scrapes | ✅ Built (accumulates over time) |

---

## Rate Data Priority Hierarchy

The system uses a strict priority order for rate data. Higher priority sources always override lower ones:

| Priority | Source | Type | Accuracy |
|---|---|---|---|
| 1 | **REIT Facility Scraping** | Real in-store rates from REIT pages (JSON-LD) | Highest — actual facility pricing |
| 2 | **StorTrack API** | Street rates × 1.20 T12 factor | High — real market data |
| 3 | **T12 History** | Trailing 12-month scraped averages (≥3 months required) | High — trend data |
| 4 | **Google Places Estimated** | REIT benchmarks adjusted by competitor density, brand mix, demographics | Medium — modeled |
| 5 | **Static REIT Benchmarks** | Hardcoded Yardi Matrix 2024-25 rates for 35+ metros | Low — last resort fallback |

**v1.5.0 fix:** The prompt now explicitly tells Claude to prefer "LIVE MARKET DATA" injected per-site over static benchmarks. The rate priority race condition between StorTrack and REIT scraping has been resolved — REIT scraped always wins.

---

## What Is NOT Live Data

These remain as static business logic / configuration, not data:

| Item | Type | Justification |
|---|---|---|
| **Score weighting formula** | Business logic | 40% rate + 20% market + 20% site + 10% location + 10% competition |
| **Rate score caps** | Business logic | CC < $0.85 → max 3, etc. — firm's feasibility thresholds |
| **Brand tier classifications** | Configuration | Regex patterns for Premium/Mid-tier/Independent brands |
| **Demographic adjustment factors** | Configuration | HHI-based rate adjustment percentages |
| **REIT benchmark table** | Static fallback | 35+ metro T12 CC rate ranges — only used when ALL live sources fail |
| **Zoning heuristics** | Business logic | Typical setbacks, FAR, height — used when county data unavailable |
| **Non-CC ratio** | Industry constant | Non-CC ≈ 78% of CC rate |

---

## County Coverage (15 Markets)

| Market | County | API Type | Parcel | Zoning | Tier |
|---|---|---|---|---|---|
| Los Angeles | LA County | ArcGIS REST | ✅ | ✅ | 1 |
| Dallas | Dallas County | ArcGIS REST | ✅ | ✅ | 1 |
| Fort Worth | Tarrant County | ArcGIS Hub | ✅ | ✅ | 1 |
| Seattle | King County | ArcGIS + Socrata | ✅ | ✅ | 1 |
| Phoenix | Maricopa County | ArcGIS REST | ✅ | ✅ | 1 |
| Houston | Harris County | ArcGIS REST | ✅ | ⚠ No zoning | 2 |
| Chicago | Cook County | Socrata (2-dataset join) | ✅ | ✅ | 1 |
| New York City | NYC PLUTO | Socrata | ✅ | ✅ + FAR | 1 |
| Denver | Denver County | ArcGIS REST | ✅ | ✅ | 1 |
| Atlanta | Fulton County | ArcGIS Hub | ✅ | ✅ | 2 |
| Nashville | Davidson County | ArcGIS REST | ✅ | ✅ | 2 |
| Charlotte | Mecklenburg County | ArcGIS REST | ✅ | ✅ | 3 |
| Orlando | Orange County FL | ArcGIS REST | ✅ | ✅ | 1 |
| Tampa | Hillsborough County | ArcGIS REST | ✅ | ✅ | 3 |
| Austin | Travis County | ArcGIS + Socrata | ✅ | ✅ | 2 |

For addresses outside these counties: Census demographics still work nationally. Parcel/zoning falls back to Claude estimation with a flag.

---

## Prompt Methodology

### Screening Prompt
- System prompt includes score formula, rate caps, conversion logic
- Static REIT benchmarks included as **fallback only** — prompt explicitly says to prefer live data
- Per-site: live data context injected with source attribution ("LIVE MARKET DATA")
- Claude scores sites 1-10 on 5 sub-dimensions; overall score computed server-side (not by AI)

### Feasibility Prompt
- Real zoning code from county ArcGIS injected into prompt
- Real parcel dimensions (lot SF, building SF) injected
- Claude parses municipal code for setbacks, FAR, height limits
- Results cached per (city, zoning_code) to avoid redundant API calls
- NYC PLUTO data parsed directly (structured data, no Claude needed)

### Rate Validation (Server-Side)
1. Get market rate reference from live data (if available) or static benchmarks (fallback)
2. Clamp AI-estimated rates to market ceiling (high × 1.3)
3. If no rate provided, estimate within range using location_score as proxy
4. Apply hard score caps based on CC rate thresholds
5. Recompute overall score with rate-weighted formula
6. Block 9-10 scores unless all sub-scores are elite

---

## Implementation Files

### Live Data Services (`api/_lib/live/`)
| File | Source | Status |
|---|---|---|
| `census.js` | Census ACS demographics | ✅ Live |
| `county-config.js` | 15 county ArcGIS endpoint configs | ✅ Live |
| `county-data.js` | Parcel + zoning data fetcher | ✅ Live |
| `google-places.js` | Competitor finder + rate estimator | ✅ Live (needs key) |
| `reit-scraper.js` | In-store rate scraper from REIT pages | ✅ Live |
| `stortrack.js` | StorTrack street rates | ✅ Live (needs credentials) |
| `tractiq.js` | TractIQ CMBS occupancy | ⏳ Stub |
| `esri.js` | ESRI GeoEnrichment | ⏳ Stub |
| `zoning-rules.js` | Zoning code → development standards | ✅ Live (Claude parse, cached) |
| `index.js` | Orchestrator — parallel fetch + rate priority | ✅ Live |

### Server Routes (`routes/`)
| File | Purpose |
|---|---|
| `screen.js` | Screening pipeline: geocode → live data → Claude → validate |
| `feasibility.js` | Feasibility: parcel + zoning → Claude parse → structured output |
| `brokers.js` | Broker CRUD + site assignment |
| `sessions.js` | Session management |
| `data.js` | Live data, market rates, rate status endpoints |

### Shared Libraries (`lib/`)
| File | Purpose |
|---|---|
| `claude.js` | Anthropic API caller with rate limiting, retries, JSON repair |
| `db.js` | SQLite schema, migrations, prepared statements |
| `geocode.js` | Nominatim geocoding with caching |
| `prompt.js` | System prompts, rate reference, criteria formatting |
| `rates.js` | Rate validation, capping, market rate lookup |

---

## Legality Summary

| Source | Risk | Notes |
|---|---|---|
| Census API | None | Public domain, no restrictions |
| County ArcGIS/Socrata | None | Free public government APIs |
| Google Places API | None | Licensed commercial API |
| StorTrack API | None | Licensed commercial data |
| REIT Facility Scraping | Low | Public web pages, JSON-LD structured data |
| TractIQ | None | Licensed CMBS data |
| ESRI API | None | Licensed through firm account |
| Claude AI | None | Licensed API, judgment only |

All CoStar/LoopNet scraping eliminated. No proprietary data touches the app without a paid API license.
