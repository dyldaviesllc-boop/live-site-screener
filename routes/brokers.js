import { Router } from "express";
import { db, brokerStmts } from "../lib/db.js";

const router = Router();

router.get("/brokers", (req, res) => res.json(brokerStmts.list.all()));

router.get("/brokers/:id", (req, res) => {
  const broker = brokerStmts.get.get(req.params.id);
  if (!broker) return res.status(404).json({ error: "Not found" });
  res.json({ ...broker, sites: brokerStmts.getSites.all(req.params.id) });
});

router.post("/brokers", (req, res) => {
  const b = req.body;
  const info = brokerStmts.insert.run(b.name, b.company||null, b.email||null, b.phone||null, b.markets||null, b.specialty||null, b.status||"active", b.notes||null, b.last_contact||null, b.next_followup||null);
  res.json({ id: info.lastInsertRowid });
});

router.put("/brokers/:id", (req, res) => {
  const b = req.body;
  brokerStmts.update.run(b.name, b.company||null, b.email||null, b.phone||null, b.markets||null, b.specialty||null, b.status||"active", b.notes||null, b.last_contact||null, b.next_followup||null, req.params.id);
  res.json({ ok: true });
});

router.delete("/brokers/:id", (req, res) => { brokerStmts.delete.run(req.params.id); res.json({ ok: true }); });

router.post("/brokers/:id/sites", (req, res) => {
  const { result_id, notes } = req.body;
  // INSERT OR IGNORE — won't overwrite existing link
  brokerStmts.linkSite.run(req.params.id, result_id, notes || null);
  // If link already existed and new notes provided, append them
  if (notes) {
    const existing = db.prepare("SELECT notes FROM broker_sites WHERE broker_id=? AND result_id=?").get(req.params.id, result_id);
    if (existing && existing.notes && !existing.notes.includes(notes)) {
      db.prepare("UPDATE broker_sites SET notes=? WHERE broker_id=? AND result_id=?").run(existing.notes + "\n" + notes, req.params.id, result_id);
    }
  }
  res.json({ ok: true });
});

// Append-only notes endpoint — never overwrites, only accumulates
router.put("/brokers/:brokerId/sites/:resultId/notes", (req, res) => {
  const { note } = req.body;
  if (!note) return res.status(400).json({ error: "note required" });
  const existing = db.prepare("SELECT notes FROM broker_sites WHERE broker_id=? AND result_id=?").get(req.params.brokerId, req.params.resultId);
  if (!existing) return res.status(404).json({ error: "link not found" });
  const updated = existing.notes ? existing.notes + "\n" + note : note;
  db.prepare("UPDATE broker_sites SET notes=? WHERE broker_id=? AND result_id=?").run(updated, req.params.brokerId, req.params.resultId);
  res.json({ ok: true, notes: updated });
});

router.delete("/brokers/:brokerId/sites/:resultId", (req, res) => { brokerStmts.unlinkSite.run(req.params.brokerId, req.params.resultId); res.json({ ok: true }); });

export default router;
