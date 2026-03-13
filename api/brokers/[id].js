import supabase from "../_lib/supabase.js";

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "GET") {
    const { data: broker, error } = await supabase
      .from("brokers").select("*").eq("id", id).single();
    if (error || !broker) return res.status(404).json({ error: "Not found" });

    // Get linked sites
    const { data: links } = await supabase
      .from("broker_sites")
      .select("notes, id, result_id, results(*)")
      .eq("broker_id", id)
      .order("results(overall_score)", { ascending: false });

    const sites = (links || []).map(l => ({
      ...l.results,
      broker_note: l.notes,
      link_id: l.id,
    }));

    return res.json({ ...broker, sites });
  }

  if (req.method === "PUT") {
    const b = req.body;
    const { error } = await supabase.from("brokers").update({
      name: b.name, company: b.company || null, email: b.email || null,
      phone: b.phone || null, markets: b.markets || null, specialty: b.specialty || null,
      status: b.status || "active", notes: b.notes || null,
      last_contact: b.last_contact || null, next_followup: b.next_followup || null,
    }).eq("id", id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  if (req.method === "DELETE") {
    await supabase.from("brokers").delete().eq("id", id);
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
