import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
if (!existsSync(dataDir)) mkdirSync(dataDir);

const db = new Database(join(dataDir, "screener.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, address_count INTEGER, criteria_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    overall_score REAL, location_score REAL, market_score REAL,
    site_potential REAL, competition_risk REAL, rate_environment REAL,
    potential_use TEXT, inferred_type TEXT,
    est_cc_rate_psf_mo REAL, est_noncc_rate_psf_mo REAL,
    est_occupancy REAL, est_sf_per_capita REAL,
    est_pop_trade_area INTEGER, est_hhi INTEGER,
    trade_area_miles REAL, nearby_comps TEXT,
    criteria_pass INTEGER, criteria_fail INTEGER, criteria_flags TEXT,
    key_insight TEXT, market TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS feasibility (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_id INTEGER UNIQUE REFERENCES results(id) ON DELETE CASCADE,
    zoning_code TEXT, zoning_desc TEXT,
    ss_permitted INTEGER, ss_conditional INTEGER, ss_variance INTEGER,
    zoning_path TEXT, zoning_risk TEXT,
    parcel_acres REAL, parcel_sf REAL,
    far_limit REAL, lot_coverage_pct REAL,
    front_setback_ft REAL, side_setback_ft REAL, rear_setback_ft REAL,
    max_height_ft REAL, max_stories INTEGER,
    buildable_sf REAL, achievable_gsf REAL, stories_proposed INTEGER,
    meets_90k INTEGER, development_notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS brokers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, company TEXT, email TEXT, phone TEXT,
    markets TEXT, specialty TEXT, status TEXT DEFAULT 'active',
    notes TEXT, last_contact TEXT, next_followup TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS broker_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    broker_id INTEGER REFERENCES brokers(id) ON DELETE CASCADE,
    result_id INTEGER REFERENCES results(id) ON DELETE CASCADE,
    notes TEXT, created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(broker_id, result_id)
  );
  CREATE INDEX IF NOT EXISTS idx_results_session ON results(session_id);
  CREATE INDEX IF NOT EXISTS idx_results_score ON results(overall_score DESC);
  CREATE INDEX IF NOT EXISTS idx_feas_result ON feasibility(result_id);
  CREATE INDEX IF NOT EXISTS idx_bs_broker ON broker_sites(broker_id);
  CREATE INDEX IF NOT EXISTS idx_bs_result ON broker_sites(result_id);
`);

// Migration: add listing broker columns to results
try { db.exec("ALTER TABLE results ADD COLUMN listing_broker TEXT"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN listing_broker_co TEXT"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN listing_broker_phone TEXT"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN listing_broker_email TEXT"); } catch {}

// Migration: add building/conversion columns
try { db.exec("ALTER TABLE results ADD COLUMN building_sf REAL"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN acreage REAL"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN property_category TEXT"); } catch {}
try { db.exec("ALTER TABLE feasibility ADD COLUMN existing_building_sf REAL"); } catch {}
try { db.exec("ALTER TABLE feasibility ADD COLUMN conversion_complexity TEXT"); } catch {}
try { db.exec("ALTER TABLE feasibility ADD COLUMN conversion_notes TEXT"); } catch {}

// Migration: broker enrichment columns
try { db.exec("ALTER TABLE results ADD COLUMN broker_confidence TEXT"); } catch {}
try { db.exec("ALTER TABLE results ADD COLUMN broker_enriched INTEGER DEFAULT 0"); } catch {}

// ── Prepared statements ──────────────────────────────────────────────────────

const stmts = {
  listSessions: db.prepare(`SELECT s.*, COUNT(r.id) as result_count, ROUND(AVG(r.overall_score),1) as avg_score FROM sessions s LEFT JOIN results r ON r.session_id=s.id GROUP BY s.id ORDER BY s.created_at DESC`),
  getSession: db.prepare("SELECT * FROM sessions WHERE id=?"),
  getResults: db.prepare("SELECT * FROM results WHERE session_id=? ORDER BY overall_score DESC"),
  insertSession: db.prepare("INSERT INTO sessions (name,address_count,criteria_json) VALUES (?,?,?)"),
  insertResult: db.prepare(`INSERT INTO results (session_id,address,overall_score,location_score,market_score,site_potential,competition_risk,rate_environment,potential_use,inferred_type,est_cc_rate_psf_mo,est_noncc_rate_psf_mo,est_occupancy,est_sf_per_capita,est_pop_trade_area,est_hhi,trade_area_miles,nearby_comps,criteria_pass,criteria_fail,criteria_flags,key_insight,market,listing_broker,listing_broker_co,listing_broker_phone,listing_broker_email,building_sf,acreage,property_category,broker_confidence,broker_enriched) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  deleteSession: db.prepare("DELETE FROM sessions WHERE id=?"),
};

const feasStmts = {
  upsert: db.prepare(`INSERT INTO feasibility (result_id,zoning_code,zoning_desc,ss_permitted,ss_conditional,ss_variance,zoning_path,zoning_risk,parcel_acres,parcel_sf,far_limit,lot_coverage_pct,front_setback_ft,side_setback_ft,rear_setback_ft,max_height_ft,max_stories,buildable_sf,achievable_gsf,stories_proposed,meets_90k,development_notes,existing_building_sf,conversion_complexity,conversion_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(result_id) DO UPDATE SET zoning_code=excluded.zoning_code,zoning_desc=excluded.zoning_desc,ss_permitted=excluded.ss_permitted,ss_conditional=excluded.ss_conditional,ss_variance=excluded.ss_variance,zoning_path=excluded.zoning_path,zoning_risk=excluded.zoning_risk,parcel_acres=excluded.parcel_acres,parcel_sf=excluded.parcel_sf,far_limit=excluded.far_limit,lot_coverage_pct=excluded.lot_coverage_pct,front_setback_ft=excluded.front_setback_ft,side_setback_ft=excluded.side_setback_ft,rear_setback_ft=excluded.rear_setback_ft,max_height_ft=excluded.max_height_ft,max_stories=excluded.max_stories,buildable_sf=excluded.buildable_sf,achievable_gsf=excluded.achievable_gsf,stories_proposed=excluded.stories_proposed,meets_90k=excluded.meets_90k,development_notes=excluded.development_notes,existing_building_sf=excluded.existing_building_sf,conversion_complexity=excluded.conversion_complexity,conversion_notes=excluded.conversion_notes`),
  getByResults: db.prepare("SELECT * FROM feasibility WHERE result_id IN (SELECT id FROM results WHERE session_id=?)"),
  getByResultId: db.prepare("SELECT * FROM feasibility WHERE result_id=?"),
};

const brokerStmts = {
  list: db.prepare("SELECT b.*, COUNT(bs.id) as site_count FROM brokers b LEFT JOIN broker_sites bs ON bs.broker_id=b.id GROUP BY b.id ORDER BY b.last_contact DESC NULLS LAST, b.name ASC"),
  get: db.prepare("SELECT * FROM brokers WHERE id=?"),
  insert: db.prepare("INSERT INTO brokers (name,company,email,phone,markets,specialty,status,notes,last_contact,next_followup) VALUES (?,?,?,?,?,?,?,?,?,?)"),
  update: db.prepare("UPDATE brokers SET name=?,company=?,email=?,phone=?,markets=?,specialty=?,status=?,notes=?,last_contact=?,next_followup=? WHERE id=?"),
  delete: db.prepare("DELETE FROM brokers WHERE id=?"),
  getSites: db.prepare("SELECT r.*,bs.notes as broker_note,bs.id as link_id FROM broker_sites bs JOIN results r ON r.id=bs.result_id WHERE bs.broker_id=? ORDER BY r.overall_score DESC"),
  linkSite: db.prepare("INSERT OR IGNORE INTO broker_sites (broker_id,result_id,notes) VALUES (?,?,?)"),
  unlinkSite: db.prepare("DELETE FROM broker_sites WHERE broker_id=? AND result_id=?"),
  searchResults: db.prepare("SELECT id,address,market,overall_score,potential_use FROM results ORDER BY overall_score DESC LIMIT 50"),
};

export { db, stmts, feasStmts, brokerStmts };
