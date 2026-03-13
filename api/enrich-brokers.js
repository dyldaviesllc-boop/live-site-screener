import supabase from "./_lib/supabase.js";
import { BROKER_SYS_PROMPT, callClaude, matchAddress } from "./_lib/validate.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { sites } = req.body;
  if (!sites?.length) return res.status(400).json({ error: "No sites" });

  try {
    const siteLines = sites.map(s => {
      let line = s.address;
      const meta = [];
      if (s.inferred_type) meta.push(s.inferred_type);
      if (s.market) meta.push(`${s.market} market`);
      if (meta.length) line += ` [${meta.join(", ")}]`;
      return line;
    });

    let raw;
    try {
      raw = await callClaude(
        BROKER_SYS_PROMPT,
        `Find listing brokers for ${sites.length} properties:\n${siteLines.join("\n")}`,
        { maxTokens: Math.min(4096, 400 * sites.length) },
      );
    } catch (parseErr) {
      console.error("Broker enrich parse error (batch skipped):", parseErr.message);
      return res.json({ results: [], skipped: sites.length, parseError: true });
    }

    const results = [];
    for (const r of raw) {
      const src = matchAddress(r.address, sites);
      if (src?.result_id) {
        const isKnown = r.listing_broker && r.listing_broker.toLowerCase() !== "unknown";
        const hasCo = r.listing_broker_co && r.listing_broker_co.toLowerCase() !== "unknown";
        await supabase.from("results").update({
          listing_broker: isKnown ? r.listing_broker : null,
          listing_broker_co: hasCo ? r.listing_broker_co : null,
          listing_broker_phone: isKnown ? (r.listing_broker_phone || null) : null,
          listing_broker_email: isKnown ? (r.listing_broker_email || null) : null,
          broker_confidence: (isKnown || hasCo) ? (r.confidence || "low") : null,
          broker_enriched: isKnown || hasCo,
        }).eq("id", src.result_id);
      }
      results.push({ ...r, result_id: src?.result_id });
    }

    res.json({ results });
  } catch (e) {
    console.error("Enrich-brokers error:", e);
    res.status(500).json({ error: e.message });
  }
}
