import { buildSysPrompt, callClaude, validateAndCapRates, matchAddress } from "./_lib/validate.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { sites, addresses, criteria } = req.body;
  const siteList = sites || (addresses || []).map(a => typeof a === "string" ? { address: a } : a);
  if (!siteList?.length) return res.status(400).json({ error: "No addresses" });

  try {
    const siteLines = siteList.map(s => {
      let line = s.address;
      const meta = [];
      if (s.building_sf) meta.push(`${Number(s.building_sf).toLocaleString()} SF building`);
      if (s.acreage) meta.push(`${s.acreage} ac`);
      if (meta.length) line += ` [${meta.join(", ")}]`;
      return line;
    });

    const raw = await callClaude(
      buildSysPrompt(criteria),
      `Screen ${siteList.length} sites:\n${siteLines.join("\n")}`,
      { maxTokens: Math.min(3200, 400 * siteList.length) },
    );

    const results = validateAndCapRates(raw).map(r => {
      const src = matchAddress(r.address, siteList);
      if (src) {
        if (src.building_sf) r.building_sf = src.building_sf;
        else if (r.building_sf && r.building_sf > 500_000) r.building_sf = null;
        if (src.acreage) r.acreage = src.acreage;
        else if (r.acreage && r.acreage > 200) r.acreage = null;
      } else {
        if (r.building_sf && r.building_sf > 500_000) r.building_sf = null;
        if (r.acreage && r.acreage > 200) r.acreage = null;
      }
      return r;
    });

    res.json({ results });
  } catch (e) {
    console.error("Screen error:", e);
    res.status(500).json({ error: e.message });
  }
}
