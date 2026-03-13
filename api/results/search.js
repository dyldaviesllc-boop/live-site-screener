import supabase from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { data, error } = await supabase
    .from("results")
    .select("id, address, market, overall_score, potential_use")
    .order("overall_score", { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}
