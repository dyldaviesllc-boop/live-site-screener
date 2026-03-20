import supabase from "./_lib/supabase.js";
import { findListingUrl } from "./_lib/live/serpapi.js";

export const config = { maxDuration: 120 };

// ── Web scrape: fetch listing page and extract broker info ──────────────────

async function fetchAndExtractBroker(listingUrl, source) {
  try {
    const resp = await fetch(listingUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    return extractBrokerFromHtml(html, source);
  } catch {
    return null;
  }
}

function extractBrokerFromHtml(html, source) {
  const patterns = [];

  if (source === "loopnet") {
    patterns.push(
      /"agent":\s*\{[^}]*"name":\s*"([^"]+)"/i,
      /class="broker-card[^"]*"[^>]*>[\s\S]*?<[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)/i,
      /data-broker-name="([^"]+)"/i,
      /Listing\s+(?:Broker|Agent|Contact)[:\s]*(?:<[^>]+>)*\s*([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/,
      /"brokerName":\s*"([^"]+)"/,
      /itemprop="agent"[^>]*>[\s\S]*?itemprop="name"[^>]*>([^<]+)/i,
    );
  }

  if (source === "crexi") {
    patterns.push(
      /"brokerName":\s*"([^"]+)"/,
      /class="broker[^"]*name[^"]*"[^>]*>([^<]+)/i,
      /class="agent[^"]*name[^"]*"[^>]*>([^<]+)/i,
      /"contactName":\s*"([^"]+)"/,
    );
  }

  patterns.push(
    /"listing_broker":\s*"([^"]+)"/i,
    /"contactName":\s*"([^"]+)"/i,
    /"agent_name":\s*"([^"]+)"/i,
    /Presented\s+by:?\s*(?:<[^>]+>)*\s*([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
    /Listed\s+by:?\s*(?:<[^>]+>)*\s*([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
  );

  const invalidNameRx = /\b(Team|Group|Division|Advisory|Services|Department|Associates|Partners|Capital|Realty|Properties|Corporation|Inc|LLC|Corp|Brokerage|Company)\s*$/i;
  const isValidName = (name) => {
    if (!name || name.length < 3 || name.length > 50) return false;
    const t = name.trim();
    if (invalidNameRx.test(t) || t.includes("&") || t.includes("@")) return false;
    if (!/\s/.test(t)) return false;
    if (!/^[A-Z]/.test(t)) return false;
    return true;
  };

  for (const rx of patterns) {
    const m = html.match(rx);
    if (m && m[1] && isValidName(m[1].trim())) {
      const name = m[1].trim();
      const nameIdx = html.indexOf(name);
      const context = html.substring(Math.max(0, nameIdx - 500), Math.min(html.length, nameIdx + 1000));

      let company = null;
      let phone = null;
      let email = null;

      const coMatch = context.match(/(?:company|firm|brokerage|office)[":\s]*(?:<[^>]+>)*\s*([^<"\n]{3,50})/i)
        || context.match(/(?:CBRE|JLL|Cushman|Marcus|Colliers|Lee\s*&\s*Associates|Newmark|Avison|NAI|KW|SVN|Sperry|Berkadia|HFF|Eastdil)/i);
      if (coMatch) company = coMatch[1] || coMatch[0];

      const phoneMatch = context.match(/(?:phone|tel|call)[:\s"]*(?:<[^>]+>)*\s*\(?(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})/i)
        || context.match(/\((\d{3})\)\s*(\d{3})[-.](\d{4})/);
      if (phoneMatch) phone = phoneMatch.length === 4
        ? `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`
        : phoneMatch[0];

      const emailMatch = context.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) email = emailMatch[1];

      return { listing_broker: name, listing_broker_co: company, listing_broker_phone: phone, listing_broker_email: email };
    }
  }

  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { sites } = req.body;
  if (!sites?.length) return res.status(400).json({ error: "No sites" });

  const hasSerpApi = !!process.env.SERPAPI_KEY;

  try {
    const results = [];
    const scrapePromises = sites.map(async (s) => {
      const out = {
        address: s.address,
        result_id: s.result_id,
        listing_broker: null,
        listing_broker_co: null,
        listing_broker_phone: null,
        listing_broker_email: null,
        listing_url: null,
        source: null,
        confidence: null,
      };

      try {
        // Use SerpAPI if available (bypasses Google IP blocking), else direct scrape
        let listingInfo;
        if (hasSerpApi) {
          listingInfo = await findListingUrl(s.address);
        } else {
          listingInfo = await directGoogleSearch(s.address);
        }

        if (listingInfo?.listing_url) {
          out.listing_url = listingInfo.listing_url;
          out.source = listingInfo.source;

          // Fetch the actual listing page and extract broker info
          const brokerInfo = await fetchAndExtractBroker(listingInfo.listing_url, listingInfo.source);
          if (brokerInfo) {
            out.listing_broker = brokerInfo.listing_broker;
            out.listing_broker_co = brokerInfo.listing_broker_co || null;
            out.listing_broker_phone = brokerInfo.listing_broker_phone || null;
            out.listing_broker_email = brokerInfo.listing_broker_email || null;
            out.confidence = "high";
          }
        }
      } catch (e) {
        console.warn(`Scrape failed for ${s.address}:`, e.message);
      }

      // Update DB
      if (s.result_id) {
        const isKnown = !!out.listing_broker;
        const hasCo = out.listing_broker_co && out.listing_broker_co.toLowerCase() !== "unknown";
        await supabase.from("results").update({
          listing_broker: isKnown ? out.listing_broker : null,
          listing_broker_co: hasCo ? out.listing_broker_co : null,
          listing_broker_phone: isKnown ? out.listing_broker_phone : null,
          listing_broker_email: isKnown ? out.listing_broker_email : null,
          broker_confidence: isKnown ? "high" : null,
          broker_enriched: isKnown || hasCo ? 1 : 0,
          listing_url: out.listing_url || null,
        }).eq("id", s.result_id);
      }

      results.push(out);
    });

    await Promise.all(scrapePromises);
    console.log(`Scraped ${results.filter(r => r.listing_broker).length} brokers, ${results.filter(r => r.listing_url).length} listing URLs from ${sites.length} sites (SerpAPI: ${hasSerpApi ? "yes" : "no"})`);

    res.json({ results });
  } catch (e) {
    console.error("Enrich-brokers error:", e);
    res.status(500).json({ error: e.message });
  }
}

// Fallback direct Google search (same as original site-screener, may be blocked)
async function directGoogleSearch(address) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`"${address}" site:loopnet.com`)}`;
    const resp = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) {
      const html = await resp.text();
      const m = html.match(/https:\/\/www\.loopnet\.com\/Listing\/[^"&\s]+/);
      if (m) return { listing_url: m[0], source: "loopnet" };
    }
  } catch {}

  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`"${address}" site:crexi.com`)}`;
    const resp = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) {
      const html = await resp.text();
      const m = html.match(/https:\/\/www\.crexi\.com\/properties\/[^"&\s]+/);
      if (m) return { listing_url: m[0], source: "crexi" };
    }
  } catch {}

  return null;
}
