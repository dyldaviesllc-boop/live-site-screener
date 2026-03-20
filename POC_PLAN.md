# Live Site Screener — POC Integration Plan

**Created:** March 17, 2026
**Status:** Pre-implementation (awaiting API keys)
**Base Project:** Forked from `site-screener` v1.2.3

---

## Overview

This project replaces AI-guessed data with live data sources while keeping Claude AI for subjective scoring and zoning analysis. The goal is a credible, self-deployable screening tool backed by real market data.

---

## Current Data Sources (AI-Generated)

| Data Point | Current Source | Problem |
|---|---|---|
| Population, HHI | Claude guess | Not census-accurate |
| CC/Non-CC Rates | Claude guess + REIT guardrails | Not facility-level |
| Occupancy | Claude guess | Often wrong |
| SF/Capita | Claude guess (pop ÷ supply) | Both inputs are guesses |
| Competitors | Claude training data | May be outdated/missing |
| Broker Names | Web scrape (blocked by Google) | Non-functional |
| Zoning/Feasibility | Claude AI | May contain errors |

---

## Plan A: Minimal Viable Live Data (~$80-130/month)

### Sources
| Source | Replaces | Cost | Status |
|---|---|---|---|
| US Census Bureau API | Population, HHI, households | Free | Ready to implement |
| Google Places API | Competitor identification | ~$30-80/mo | Need API key |
| SerpAPI | Fix broker scraping (Google search proxy) | $50/mo | Need API key |

### What Changes
- Demographics become real census data
- Competitors become real Google business listings
- Broker scraping works again via proxy
- Rates and occupancy still AI-estimated

### API Keys Required
```
CENSUS_API_KEY=           # Free at api.census.gov/data/key_signup.html
GOOGLE_PLACES_API_KEY=    # Google Cloud Console → APIs & Services
SERPAPI_KEY=              # serpapi.com signup
```

---

## Plan B: Real Rates + Demographics (~$200-350/month)

### Sources (Plan A plus:)
| Source | Replaces | Cost | Status |
|---|---|---|---|
| StorTrack API | CC/Non-CC street rates | $49-199/mo | Need subscription |

### What Changes
- Everything in Plan A
- **Real street rates** for competitor facilities
- Rate capping logic uses live market data instead of hardcoded REIT ranges
- Biggest credibility upgrade — real $/SF from actual facilities

### API Keys Required
```
STORTRACK_API_KEY=        # stortrack.com subscription
```

---

## Plan C: Full Live Data (~$350-550/month)

### Sources (Plan B plus:)
| Source | Replaces | Cost | Status |
|---|---|---|---|
| TractIQ | CMBS facility occupancy | $159-199/mo | Firm getting access |
| ESRI GeoEnrichment | Enhanced demographics | ~$0 if firm license covers API | Check with firm |

### What Changes
- Everything in Plan B
- Real occupancy data for CMBS-loan facilities (~20-30% of market)
- ESRI proprietary demographic models (better than raw Census for current-year)
- Only AI-generated data remaining: scores (appropriate) and zoning analysis

### API Keys Required
```
TRACTIQ_API_KEY=          # From firm's TractIQ subscription
ESRI_API_KEY=             # From firm's ESRI ArcGIS account
```

---

## Legality Summary

| Source | Risk | Notes |
|---|---|---|
| Census API | None | Public domain, no restrictions |
| Google Places API | None | Licensed commercial API, standard ToS |
| SerpAPI | Low | They assume Google ToS risk; you're a customer |
| StorTrack API | None | Licensed commercial data |
| TractIQ | None | Licensed CMBS data |
| ESRI API | None | Licensed through firm account |
| LoopNet scraping | Medium | Technically violates ToS; low enforcement at low volume |
| CoStar scraping | **HIGH** | They sue aggressively — do NOT scrape, use API only |

---

## Self-Deploy Considerations

- Each deployment needs its own API keys (cannot share one key across coworkers)
- **Recommended:** Deploy one central instance, give coworkers login access
- Vercel Hobby is free but single-user; Vercel Pro ($20/mo) for team
- Supabase free tier (500MB) is sufficient for small team
- Store API keys in Vercel environment variables, not in code

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend (React 19 SPA)                        │
│  Same UI as site-screener                       │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  API Layer (Vercel Serverless)                   │
│                                                  │
│  /api/screen         → Claude AI + live data     │
│  /api/feasibility    → Claude AI (zoning)        │
│  /api/enrich-brokers → SerpAPI + scrape          │
│  /api/market-rates   → StorTrack or Census       │
│  /api/demographics   → Census API (NEW)          │
│  /api/competitors    → Google Places (NEW)       │
│  /api/occupancy      → TractIQ (NEW)             │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  Live Data Services (api/_lib/live/)             │
│                                                  │
│  census.js      → US Census Bureau ACS API       │
│  google-places.js → Google Places Nearby Search  │
│  stortrack.js   → StorTrack rate data            │
│  tractiq.js     → TractIQ CMBS occupancy         │
│  esri.js        → ESRI GeoEnrichment             │
│  serpapi.js     → SerpAPI Google search proxy     │
└──────────────┬──────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────┐
│  Database (Supabase PostgreSQL)                  │
│  Same schema as site-screener                    │
└─────────────────────────────────────────────────┘
```

---

## Implementation Status

| Module | File | Status |
|---|---|---|
| Census demographics | `api/_lib/live/census.js` | Built, needs API key to test |
| Google Places competitors | `api/_lib/live/google-places.js` | Built, needs API key to test |
| StorTrack rates | `api/_lib/live/stortrack.js` | Built, needs subscription |
| TractIQ occupancy | `api/_lib/live/tractiq.js` | Stubbed, awaiting API docs |
| ESRI demographics | `api/_lib/live/esri.js` | Stubbed, awaiting firm API access |
| SerpAPI broker search | `api/_lib/live/serpapi.js` | Built, needs API key to test |
| Screen endpoint (live) | `api/screen.js` | Integrated with Census + Places |
| Broker endpoint (live) | `api/enrich-brokers.js` | Integrated with SerpAPI |
| Market rates (live) | `api/market-rates.js` | Integrated with StorTrack |
| Demographics endpoint | `api/demographics.js` | New endpoint, ready |
| Competitors endpoint | `api/competitors.js` | New endpoint, ready |

---

## Syncing UI from site-screener

When UI changes are made to the original `site-screener` project:

1. Check the changelog for what changed
2. Copy updated `src/App.jsx` and any changed frontend files
3. Do NOT overwrite: `api/`, `api/_lib/live/`, `.env`, `vercel.json`, `POC_PLAN.md`, `SYNC.md`
4. Test that live data integrations still work after UI sync

See `SYNC.md` for detailed instructions.
