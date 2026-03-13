import supabase from "../../_lib/supabase.js";

export default async function handler(req, res) {
  const { brokerId } = req.query;

  if (req.method === "POST") {
    const { result_id, notes } = req.body;

    // Try insert (ignore conflict)
    const { error } = await supabase.from("broker_sites").upsert(
      { broker_id: parseInt(brokerId), result_id, notes: notes || null },
      { onConflict: "broker_id,result_id", ignoreDuplicates: true }
    );

    if (error && !error.message.includes("duplicate")) {
      return res.status(500).json({ error: error.message });
    }

    // If notes provided, append to existing
    if (notes) {
      const { data: existing } = await supabase
        .from("broker_sites")
        .select("notes")
        .eq("broker_id", brokerId)
        .eq("result_id", result_id)
        .single();

      if (existing?.notes && !existing.notes.includes(notes)) {
        await supabase.from("broker_sites")
          .update({ notes: existing.notes + "\n" + notes })
          .eq("broker_id", brokerId)
          .eq("result_id", result_id);
      }
    }

    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
