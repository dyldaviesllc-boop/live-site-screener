import supabase from "../_lib/supabase.js";

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === "GET") {
    const { data: session, error: sErr } = await supabase
      .from("sessions").select("*").eq("id", id).single();
    if (sErr || !session) return res.status(404).json({ error: "Not found" });

    const { data: results } = await supabase
      .from("results").select("*").eq("session_id", id).order("overall_score", { ascending: false });

    const { data: feasibility } = await supabase
      .from("feasibility").select("*").in("result_id", (results || []).map(r => r.id));

    return res.json({ ...session, results: results || [], feasibility: feasibility || [] });
  }

  if (req.method === "DELETE") {
    await supabase.from("sessions").delete().eq("id", id);
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
