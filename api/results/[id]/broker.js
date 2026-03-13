import supabase from "../../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "PUT") return res.status(405).json({ error: "Method not allowed" });

  const { id } = req.query;
  const { listing_broker, listing_broker_co, listing_broker_phone, listing_broker_email, broker_confidence } = req.body;

  const { error } = await supabase.from("results").update({
    listing_broker: listing_broker || null,
    listing_broker_co: listing_broker_co || null,
    listing_broker_phone: listing_broker_phone || null,
    listing_broker_email: listing_broker_email || null,
    broker_confidence: broker_confidence || "manual",
    broker_enriched: true,
  }).eq("id", id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}
