# 1784 Live Site Screener — Solo Deployment Plan (FINAL)

> **Goal:** Replace every AI-guessed data point with real data.
> **Phase 1:** Solo use, ~$25/mo (free public APIs + Claude API)
> **Phase 2:** + Google Places + StorTrack (~$138-188/mo)
> **Phase 3:** Team deployment on Azure (future)
> **Editor:** VS Code (Bradley-approved)
> **Updated:** 2026-03-19

---

## Architecture

```
User pastes up to 100 addresses
    ↓
Geocode (Nominatim — free)
    ↓
Detect county (Census FIPS lookup — free)
    ↓
┌─ Parallel API calls ──────────────────────────────────┐
│ Census API → demographics (pop, HHI, households)      │  FREE
│ County ArcGIS → parcel data (lot SF, bldg SF, owner)  │  FREE
│ County ArcGIS → zoning code (real designation)        │  FREE
│ Zoning Rules → Claude parses setbacks/FAR/height      │  ~$1/mo
│ Google Places → competitors (names, distance, rating) │  ~$64/mo
│ StorTrack → street rates (when key available)         │  $49-99/mo
│ TractIQ → CMBS occupancy (when firm provides)        │  $0 (firm)
└───────────────────────────────────────────────────────┘
    ↓
All real data → Claude prompt
Claude does JUDGMENT + SCORING only (no data guessing)
    ↓
Results with real data + source attribution
```

---

## Monthly Budget

### Phase 1 — Free Tier (Deploy Now)

| Item | Cost |
|---|---|
| Claude API (Sonnet 4, ~2,000 sites/mo) | ~$25/mo |
| Census API | $0 |
| County ArcGIS APIs (15 counties) | $0 |
| Nominatim geocoding | $0 |
| Vercel Hobby hosting | $0 |
| **Total** | **~$25/mo** |

### Phase 2 — Full Live Data

| Item | Cost |
|---|---|
| Claude API | ~$25/mo |
| Google Places (~2,000 sites/mo) | ~$64/mo |
| StorTrack (street rates) | $49-99/mo |
| TractIQ (CMBS occupancy) | $0 (firm covers) |
| **Total** | **~$138-188/mo** |

---

## Data Sources

| Data Point | Source | Cost | Status |
|---|---|---|---|
| Population, HHI, households | Census API (ACS 5-year) | Free | ✅ Built |
| Lot size, building SF, acreage | County ArcGIS REST APIs | Free | ✅ Built |
| Property owner | County ArcGIS REST APIs | Free | ✅ Built |
| Zoning code | County/city ArcGIS + Socrata | Free | ✅ Built |
| Setbacks, FAR, height limits | Zoning code → Claude parse | ~$1/mo | ✅ Built |
| Competitor facilities | Google Places API | ~$64/mo | ✅ Built (needs key) |
| Street rates | StorTrack API | $49-99/mo | ✅ Placeholder (needs key) |
| CMBS occupancy | TractIQ API | $0 (firm) | ✅ Placeholder (needs key) |

---

## Counties Covered (15 markets)

| Market | County | API Type | Parcel Data | Zoning |
|---|---|---|---|---|
| Los Angeles | LA County | ArcGIS REST | ✅ | ✅ (assessor) |
| Dallas | Dallas County | ArcGIS REST | ✅ | ✅ |
| Fort Worth | Tarrant County | ArcGIS Hub | ✅ | ✅ |
| Seattle | King County | ArcGIS + Socrata | ✅ | ✅ |
| Phoenix | Maricopa County | ArcGIS REST | ✅ | ✅ (assessor) |
| Houston | Harris County | ArcGIS REST | ✅ | ⚠ No zoning |
| Chicago | Cook County | Socrata SODA | ✅ | ✅ (data portal) |
| New York City | NYC (all boroughs) | Socrata PLUTO | ✅ | ✅ + FAR |
| Denver | Denver County | ArcGIS REST | ✅ | ✅ |
| Atlanta | Fulton County | ArcGIS Hub | ✅ | ✅ |
| Nashville | Davidson County | ArcGIS REST | ✅ | ✅ |
| Charlotte | Mecklenburg County | ArcGIS REST | ✅ | ✅ |
| Orlando | Orange County FL | ArcGIS REST | ✅ | ✅ |
| Tampa | Hillsborough County | ArcGIS REST | ✅ | ✅ |
| Austin | Travis County | ArcGIS + Socrata | ✅ | ✅ |

For addresses outside these counties: Census demographics still work (national), parcel/zoning falls back to Claude estimates with a flag.

---

## What Was Removed

- ❌ ESRI module (Census API is sufficient)
- ❌ SerpAPI module (no broker scraping)
- ❌ Broker enrichment endpoint (CoStar/LoopNet risk eliminated)
- ❌ CoStar references in UI (rebranded to generic)
- ❌ LoopNet/Crexi page scraping (legal risk eliminated)

---

## Import Cap

- **100 sites per session** (prevents CoStar export flagging)
- Frontend enforces cap with visual warning
- Still processes in batches of 10 for Claude API efficiency

---

## Deployment Steps

### Phase 1 (This Week)
1. Get Census API key (free, instant): https://api.census.gov/data/key_signup.html
2. Add to `.env`: `CENSUS_API_KEY=your_key`
3. Run locally: `npm run dev` (Express :3784, Vite :3786)
4. Test: screen 5 addresses, verify county parcel data + zoning appears
5. Deploy to Vercel: `npx vercel --prod`

### Phase 2 (When Keys Arrive)
1. Google Cloud → Enable Places API → Budget cap $100 → Add key to `.env`
2. Contact StorTrack sales for developer pricing → Add key to `.env`
3. Ask firm IT for TractIQ access → Add key to `.env`

### Azure Migration (Future)
- `server.js` already works as standalone Express app
- Merge any remaining `api/*.js` serverless routes into it
- Add Azure AD SSO middleware
- Replace Supabase with Azure PostgreSQL
- Deploy to Azure App Service (~$30-50/mo)

---

## Files Modified/Created

### New Files
- `api/_lib/live/county-config.js` — 15 county ArcGIS endpoint configs
- `api/_lib/live/county-data.js` — Parcel + zoning data fetcher
- `api/_lib/live/zoning-rules.js` — Zoning code → development standards parser
- `COUNTY_PORTAL_REFERENCE.md` — Research reference for all county portals

### Modified Files
- `api/_lib/live/index.js` — Added county data, removed ESRI + SerpAPI
- `server.js` — Live data integration, county data in screening + feasibility, broker removal
- `api/_lib/validate.js` — Rate capping with live StorTrack data
- `src/App.jsx` — 100-site cap, CoStar scrubbed, broker buttons updated
- `vite.config.js` — Added /api proxy to Express
