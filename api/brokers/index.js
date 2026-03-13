import supabase from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Get brokers with site count
    const { data: brokers, error } = await supabase
      .from("brokers")
      .select("*, broker_sites(id)")
      .order("last_contact", { ascending: false, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    const result = brokers.map(b => ({
      ...b,
      site_count: b.broker_sites?.length || 0,
      broker_sites: undefined,
    }));
    return res.json(result);
  }

  if (req.method === "POST") {
    const b = req.body;
    const { data, error } = await supabase.from("brokers").insert({
      name: b.name, company: b.company || null, email: b.email || null,
      phone: b.phone || null, markets: b.markets || null, specialty: b.specialty || null,
      status: b.status || "active", notes: b.notes || null,
      last_contact: b.last_contact || null, next_followup: b.next_followup || null,
    }).select("id").single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ id: data.id });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
