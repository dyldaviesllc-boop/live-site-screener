// ── SerpAPI (Google Search Proxy) ─────────────────────────────────────────────
// Pricing: $50/month for 5,000 searches
// Fixes: Broker scraping broken because Google blocks Vercel server IPs
// Docs: https://serpapi.com/search-api

const SERPAPI_BASE = "https://serpapi.com/search.json";

/**
 * Search Google via SerpAPI (avoids IP blocking)
 * @param {string} query - Search query
 * @returns {object} Search results with organic results and URLs
 */
export async function googleSearch(query) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return { error: "SERPAPI_KEY not set", results: [] };

  try {
    const url = new URL(SERPAPI_BASE);
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("engine", "google");
    url.searchParams.set("num", "10");

    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      return { error: `SerpAPI: ${resp.status}`, results: [] };
    }

    const data = await resp.json();
    return {
      organic_results: (data.organic_results || []).map(r => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        displayed_link: r.displayed_link,
      })),
    };
  } catch (e) {
    console.warn("SerpAPI error:", e.message);
    return { error: e.message, results: [] };
  }
}

/**
 * Search for a commercial listing on LoopNet/Crexi via SerpAPI
 * @param {string} address - Property address
 * @returns {object} Listing URL and source
 */
export async function findListingUrl(address) {
  // Try LoopNet first
  const loopnetResults = await googleSearch(`"${address}" site:loopnet.com`);
  if (loopnetResults.organic_results?.length) {
    const loopnetLink = loopnetResults.organic_results.find(r =>
      r.link?.includes("loopnet.com/Listing/")
    );
    if (loopnetLink) {
      return { listing_url: loopnetLink.link, source: "loopnet" };
    }
  }

  // Try Crexi
  const crexiResults = await googleSearch(`"${address}" site:crexi.com`);
  if (crexiResults.organic_results?.length) {
    const crexiLink = crexiResults.organic_results.find(r =>
      r.link?.includes("crexi.com/properties/")
    );
    if (crexiLink) {
      return { listing_url: crexiLink.link, source: "crexi" };
    }
  }

  // Try generic CRE search
  const genericResults = await googleSearch(`"${address}" commercial real estate listing`);
  if (genericResults.organic_results?.length) {
    const crePatterns = [
      /loopnet\.com\/Listing\//,
      /crexi\.com\/properties\//,
      /commercialcafe\.com\//,
    ];
    for (const r of genericResults.organic_results) {
      for (const rx of crePatterns) {
        if (rx.test(r.link)) {
          return { listing_url: r.link, source: "google" };
        }
      }
    }
  }

  return { listing_url: null, source: null };
}
