import supabase from "../../../_lib/supabase.js";

export default async function handler(req, res) {
  const { brokerId, resultId } = req.query;

  if (req.method === "DELETE") {
    await supabase.from("broker_sites")
      .delete()
      .eq("broker_id", brokerId)
      .eq("result_id", resultId);
    return res.json({ ok: true });
  }

  if (req.method === "PUT") {
    // Append-only notes
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: "note required" });

    const { data: existing } = await supabase
      .from("broker_sites")
      .select("notes")
      .eq("broker_id", brokerId)
      .eq("result_id", resultId)
      .single();

    if (!existing) return res.status(404).json({ error: "link not found" });

    const updated = existing.notes ? existing.notes + "\n" + note : note;
    await supabase.from("broker_sites")
      .update({ notes: updated })
      .eq("broker_id", brokerId)
      .eq("result_id", resultId);

    return res.json({ ok: true, notes: updated });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
