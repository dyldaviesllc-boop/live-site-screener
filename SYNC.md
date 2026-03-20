# Syncing UI Changes from site-screener

This project (`live-site-screener`) is a fork of `site-screener` with live data integrations.
The original `site-screener` continues to receive UI tweaks and feature updates.
When ready, those changes can be synced here.

## What to Sync (Frontend)

These files can be safely copied from `site-screener`:

- `src/App.jsx` — Main UI component (all tabs, styles, interactions)
- `src/main.jsx` — React entry point (rarely changes)
- `index.html` — HTML shell (rarely changes)
- `public/` — Static assets

## What NOT to Sync (Backend/Live Data)

Never overwrite these files — they contain live data integrations:

- `api/screen.js` — Uses live data orchestrator
- `api/enrich-brokers.js` — Uses SerpAPI for search
- `api/market-rates.js` — Uses StorTrack for live rates
- `api/live-data.js` — New consolidated live data endpoint
- `api/_lib/live/` — All live data service modules
- `.env` / `.env.example` — API key configuration
- `vercel.json` — May differ for routing
- `package.json` — Name differs
- `POC_PLAN.md` — This project's plan doc
- `SYNC.md` — This file

## How to Sync

When Claude is asked to sync changes:

1. **Check the changelog** in `site-screener/1784_Site_Screener_Changelog.docx` for what changed
2. **Copy frontend files** listed above from `site-screener` to `live-site-screener`
3. **Review for conflicts** — if App.jsx references any API endpoints that differ, adjust
4. **Test** — run `npm run dev` to verify nothing broke
5. **Do NOT** copy backend API files or overwrite live data modules

## Quick Sync Command

```bash
# From live-site-screener directory:
cp ../site-screener/src/App.jsx src/App.jsx
cp ../site-screener/src/main.jsx src/main.jsx
cp ../site-screener/index.html index.html
```

## When to Sync

Sync when the user requests it, typically after a batch of UI changes has been made
and tested on the original site-screener. The user will say something like
"sync the live-site-screener with the latest changes" or "update live-site-screener UI".
