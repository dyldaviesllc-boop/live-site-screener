import supabase from "../_lib/supabase.js";

export default async function handler(req, res) {
  const raw = req.query["...path"] || req.query.path || "";
  const brokerId = Array.isArray(raw) ? raw[0] : raw.split("/")[0];
  const sub = req.query.sub; // "sites" if routed via rewrite
  const resultId = req.query.resultId; // set by rewrite for /sites/:resultId

  // /api/brokers/:id/sites/:resultId (via rewrite)
  if (sub === "sites" && resultId) {
    if (req.method === "DELETE") {
      await supabase.from("broker_sites")
        .delete().eq("broker_id", brokerId).eq("result_id", resultId);
      return res.json({ ok: true });
    }
    if (req.method === "PUT") {
      const { note } = req.body;
      if (!note) return res.status(400).json({ error: "note required" });
      const { data: existing } = await supabase
        .from("broker_sites").select("notes")
        .eq("broker_id", brokerId).eq("result_id", resultId).single();
      if (!existing) return res.status(404).json({ error: "link not found" });
      const updated = existing.notes ? existing.notes + "\n" + note : note;
      await supabase.from("broker_sites")
        .update({ notes: updated }).eq("broker_id", brokerId).eq("result_id", resultId);
      return res.json({ ok: true, notes: updated });
    }
    return res.status(405).json({ error: "Method not allowed" });
  }

  // /api/brokers/:id/sites (via rewrite)
  if (sub === "sites") {
    if (req.method === "POST") {
      const { result_id, notes } = req.body;
      await supabase.from("broker_sites").upsert(
        { broker_id: parseInt(brokerId), result_id, notes: notes || null },
        { onConflict: "broker_id,result_id", ignoreDuplicates: true }
      );
      if (notes) {
        const { data: existing } = await supabase
          .from("broker_sites").select("notes")
          .eq("broker_id", brokerId).eq("result_id", result_id).single();
        if (existing?.notes && !existing.notes.includes(notes)) {
          await supabase.from("broker_sites")
            .update({ notes: existing.notes + "\n" + notes })
            .eq("broker_id", brokerId).eq("result_id", result_id);
        }
      }
      return res.json({ ok: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  }

  // /api/brokers/:id — direct match
  if (req.method === "GET") {
    const { data: broker, error } = await supabase
      .from("brokers").select("*").eq("id", brokerId).single();
    if (error || !broker) return res.status(404).json({ error: "Not found" });

    const { data: links } = await supabase
      .from("broker_sites")
      .select("notes, id, result_id, results(*)")
      .eq("broker_id", brokerId);

    const sites = (links || []).map(l => ({
      ...l.results,
      broker_note: l.notes,
      link_id: l.id,
    }));

    return res.json({ ...broker, sites });
  }

  if (req.method === "PUT") {
    const b = req.body;
    await supabase.from("brokers").update({
      name: b.name, company: b.company || null, email: b.email || null,
      phone: b.phone || null, markets: b.markets || null, specialty: b.specialty || null,
      status: b.status || "active", notes: b.notes || null,
      last_contact: b.last_contact || null, next_followup: b.next_followup || null,
    }).eq("id", brokerId);
    return res.json({ ok: true });
  }

  if (req.method === "DELETE") {
    await supabase.from("brokers").delete().eq("id", brokerId);
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
