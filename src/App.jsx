import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl, useMap } from "react-leaflet";

const BATCH_SIZE = 10;

const DEFAULT_CRITERIA = {
  cc_rate_min:       { op: ">=", value: 2.00,    enabled: true,  label: "Climate Controlled Rate",     unit: "$/SF/mo",  step: 0.05 },
  cc_rate_max:       { op: "<",  value: 4.00,    enabled: false, label: "CC Rate Ceiling",             unit: "$/SF/mo",  step: 0.05 },
  noncc_rate_min:    { op: ">=", value: 0.75,    enabled: false, label: "Non-Climate Rate",            unit: "$/SF/mo",  step: 0.05 },
  noncc_rate_max:    { op: "<",  value: 3.00,    enabled: false, label: "Non-Climate Rate Ceiling",    unit: "$/SF/mo",  step: 0.05 },
  occupancy_min:     { op: ">",  value: 80,      enabled: false, label: "Market Occupancy",            unit: "%",        step: 1 },
  sf_per_capita_max: { op: "<=", value: 9.5,     enabled: true,  label: "SF Per Capita (Supply)",      unit: "SF",       step: 0.5 },
  pop_3mi_min:       { op: ">=", value: 50000,   enabled: true,  label: "Population (trade area)",     unit: "",         step: 5000 },
  hhi_min:           { op: ">=", value: 75000,   enabled: true,  label: "Average HH Income (trade area)", unit: "$",     step: 5000 },
  min_acreage_ss:    { op: ">=", value: 1.5,     enabled: true,  label: "Min Acreage (Self-Storage)",  unit: "ac",       step: 0.25 },
  max_price_per_acre:{ op: "<",  value: 1500000, enabled: false, label: "Max Price Per Acre",          unit: "$",        step: 50000 },
};

// ── Theme ────────────────────────────────────────────────────────────────────
// Structural colors use CSS custom properties so dark mode works everywhere.
// Accent colors stay as raw hex since they're consistent across themes.
const C = {
  bg: "var(--bg)", sf: "var(--sf)", card: "var(--card)", brd: "var(--brd)", brdL: "var(--brdL)",
  tx: "var(--tx)", txM: "var(--txM)", txD: "var(--txD)",
  blue: "#60a5fa", grn: "#34d399", yel: "#fbbf24", org: "#fb923c",
  red: "#f87171", pur: "#a78bfa", cyn: "#22d3ee", pnk: "#f472b6",
};
const G = {
  glass: "var(--glass)", glassBrd: "var(--glassBrd)",
  blur: "var(--blur)", blurSm: "var(--blurSm)",
  shadow: "var(--shadow)", shadowSm: "var(--shadowSm)",
};
const sCol = s => s >= 8 ? C.grn : s >= 6 ? C.yel : s >= 4 ? C.org : C.red;

// Pre-computed color maps (avoid object allocation per row render)
const USE_COLORS = {
  "Self-Storage": { bg: `${C.blue}0a`, c: C.blue },
  "Either": { bg: `${C.grn}0a`, c: C.grn },
  "Unlikely": { bg: `${C.red}08`, c: C.red },
  _def: { bg: `${C.red}08`, c: C.red },
};
const TYPE_COLORS = {
  Land: { bg: `${C.yel}0a`, c: C.yel },
  Industrial: { bg: `${C.org}0a`, c: C.org },
  Office: { bg: `${C.cyn}0a`, c: C.cyn },
  "Retail/Big Box": { bg: `${C.pnk}0a`, c: C.pnk },
  "Highway Frontage": { bg: `${C.blue}0a`, c: C.blue },
  Commercial: { bg: `${C.pur}0a`, c: C.pur },
  _def: { bg: "rgba(148,163,184,0.04)", c: C.txD },
};
const CAT_COLORS = {
  conversion: { bg: `${C.org}0a`, c: C.org },
  land: { bg: `${C.grn}0a`, c: C.grn },
  _def: { bg: "rgba(148,163,184,0.04)", c: C.txD },
};

// ── Tiny UI components ───────────────────────────────────────────────────────

const Bar = ({ v, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 72 }}>
    <div style={{ flex: 1, height: 4, background: `${color}08`, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${v * 10}%`, height: "100%", background: color, opacity: 0.7, borderRadius: 2, transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)" }} />
    </div>
    <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: "'JetBrains Mono', monospace", minWidth: 14, textAlign: "right" }}>{v}</span>
  </div>
);

const Tag = ({ children, bg, c }) => (
  <span style={{ display: "inline-block", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: bg, color: c, letterSpacing: ".02em" }}>{children}</span>
);

const ExtLink = ({ href, children, c }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" style={{
    display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px",
    borderRadius: 4, fontSize: 10, fontWeight: 600, color: c,
    background: `${c}0a`, border: `1px solid ${c}18`, textDecoration: "none", whiteSpace: "nowrap",
  }}>{children} ↗</a>
);

const SiteLinks = ({ address }) => (
  <div style={{ display: "flex", gap: 3 }}>
    <ExtLink href={`https://www.google.com/maps/search/${encodeURIComponent(address)}`} c={C.blue}>Maps</ExtLink>
    <ExtLink href={`https://www.google.com/search?q=${encodeURIComponent(address)}`} c={C.grn}>Search</ExtLink>
  </div>
);
const BrokerVerifyLinks = ({ address, broker }) => {
  const q = encodeURIComponent(address);
  const omq = encodeURIComponent(`"${address}" "offering memorandum" OR "OM" filetype:pdf OR site:crexi.com OR site:loopnet.com OR site:ten-x.com`);
  const verifyQ = encodeURIComponent(address + " commercial real estate for sale OR for lease site:loopnet.com OR site:crexi.com OR site:costar.com");
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      <ExtLink href={`https://www.google.com/search?q=${verifyQ}`} c={C.txD}>Verify</ExtLink>
      <ExtLink href={`https://www.google.com/search?q=${omq}`} c={C.org}>OM</ExtLink>
    </div>
  );
};

const Btn = ({ onClick, disabled, primary, children, style: sx }) => (
  <button onClick={onClick} disabled={disabled} className={primary && !disabled ? "brut-btn" : ""}
    style={{ padding: "9px 22px", borderRadius: 10, border: primary ? "none" : `1px solid ${G.glassBrd}`, fontFamily: "inherit",
      background: primary ? (disabled ? C.brd : "linear-gradient(135deg,#1e3a5f,#2d4a7c)") : G.glass,
      backdropFilter: primary ? "none" : G.blurSm, WebkitBackdropFilter: primary ? "none" : G.blurSm,
      color: primary ? (disabled ? C.txD : "#fff") : C.tx, fontSize: 12.5, fontWeight: 600, cursor: disabled ? "default" : "pointer", letterSpacing: "-0.01em",
      boxShadow: primary && !disabled ? "3px 3px 0 rgba(0,0,0,0.15), 0 2px 8px rgba(30,58,95,0.2)" : G.shadowSm, ...sx }} >
    {children}
  </button>
);

const GlassCard = ({ children, style: sx, accent }) => (
  <div className="glass-card" style={{ background: G.glass, backdropFilter: G.blur, WebkitBackdropFilter: G.blur, borderRadius: 18, border: `1px solid ${G.glassBrd}`, padding: 22, boxShadow: G.shadow, ...(accent ? { borderLeft: `4px solid ${accent}` } : {}), ...sx }}>{children}</div>
);

const CornerFrame = ({ children, color = "rgba(30,58,95,0.18)" }) => (
  <div style={{ position: "relative", padding: 4 }}>
    <div style={{ position: "absolute", top: 0, left: 0, width: 14, height: 14, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
    <div style={{ position: "absolute", top: 0, right: 0, width: 14, height: 14, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
    <div style={{ position: "absolute", bottom: 0, left: 0, width: 14, height: 14, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
    <div style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
    {children}
  </div>
);

const StatBox = ({ l, v, c }) => (
  <div style={{ padding: "0 20px" }}>
    <div style={{ fontSize: 22, fontWeight: 700, color: c, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" }}>{v}</div>
    <div style={{ fontSize: 10, color: C.txD, marginTop: 2, letterSpacing: "0.02em" }}>{l}</div>
  </div>
);

const Modal = ({ onClose, width, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", animation: "modalBgIn 0.2s ease" }}
    onClick={onClose}>
    <div style={{ background: "var(--modalBg)", backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)", border: `1px solid ${G.glassBrd}`, borderRadius: 20, padding: 28, width: width || 480, maxHeight: "80vh", overflow: "auto", boxShadow: "var(--modalSh)", animation: "modalIn 0.3s cubic-bezier(0.16,1,0.3,1)" }}
      onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

const DataGrid = ({ items, cols }) => (
  <div style={{ display: "grid", gridTemplateColumns: cols || "1fr 1fr", gap: "5px 14px", fontSize: 11 }}>
    {items.map(([l, v, hl]) => (
      <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: C.txD }}>{l}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, color: hl || C.tx }}>{v}</span>
      </div>
    ))}
  </div>
);

const EmptyState = ({ text, children }) => (
  <div style={{ textAlign: "center", padding: "40px 20px 50px", color: C.txD }}>
    <div style={{ width: 120, height: 120, margin: "0 auto 20px", opacity: 0.12, backgroundImage: "url(/storage-hero.png)", backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center" }} />
    <div style={{ fontSize: 13, marginBottom: 14 }}>{text}</div>
    {children}
  </div>
);

const StatRow = ({ items }) => (
  <div style={{ display: "flex", alignItems: "center", marginBottom: 20, padding: "16px 0", borderBottom: `3px solid ${G.glassBrd}` }}>
    {items.map(([l, v, c], i) => (
      <div key={l} style={{ display: "flex", alignItems: "center" }}>
        {i > 0 && <div style={{ width: 1, height: 28, background: C.brd, marginRight: 4 }} />}
        <StatBox l={l} v={v} c={c} />
      </div>
    ))}
  </div>
);

const StepNav = ({ left, right, rightLabel, onClick }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 28, paddingTop: 18, borderTop: `1px solid ${G.glassBrd}` }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{left}</div>
    {rightLabel && (
      <button onClick={onClick} className="brut-btn" style={{ padding: "11px 28px", borderRadius: 11, border: "none", background: "linear-gradient(135deg,#1e3a5f,#2d4a7c)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.01em", boxShadow: "3px 3px 0 rgba(0,0,0,0.15), 0 4px 12px rgba(30,58,95,0.2)" }}>
        {rightLabel} →
      </button>
    )}
    {right && !rightLabel && right}
  </div>
);

// ── Map auto-fit helper ──────────────────────────────────────────────────────
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13, { animate: true });
    } else {
      const bounds = points.map(p => [p.lat, p.lng]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
    }
  }, [points.length, map]);
  return null;
}

// ── Site Line Parser (CoStar tab-delimited, pipe-delimited, or plain address) ─
function parseSiteLine(line) {
  const tabs = line.split("\t");
  if (tabs.length >= 2) {
    return {
      address: tabs[0].trim(),
      building_sf: parseFloat(tabs[1]?.replace(/[^0-9.]/g, "")) || null,
      acreage: parseFloat(tabs[2]?.replace(/[^0-9.]/g, "")) || null,
    };
  }
  const pipes = line.split("|");
  if (pipes.length >= 2) {
    const addr = pipes[0].trim();
    let bsf = null, ac = null;
    for (let i = 1; i < pipes.length; i++) {
      const p = pipes[i].trim().toLowerCase();
      if (p.includes("sf") || p.includes("sqft")) bsf = parseFloat(p.replace(/[^0-9.]/g, "")) || null;
      else if (p.includes("ac")) ac = parseFloat(p.replace(/[^0-9.]/g, "")) || null;
      else { const n = parseFloat(p.replace(/[^0-9.]/g, "")); if (n > 500) bsf = n; else if (n > 0) ac = n; }
    }
    return { address: addr, building_sf: bsf, acreage: ac };
  }
  return { address: line.trim(), building_sf: null, acreage: null };
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("input");
  const [lightMode, setLightMode] = useState(() => {
    try { const v = localStorage.getItem("ss-theme"); return v === "dark" ? false : true; } catch { return true; }
  });
  const toggleTheme = useCallback(() => {
    setLightMode(p => { const next = !p; try { localStorage.setItem("ss-theme", next ? "light" : "dark"); } catch {} return next; });
  }, []);
  const [addrs, setAddrs] = useState("");
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState({ d: 0, t: 0 });
  const [sortK, setSortK] = useState("overall_score");
  const [sortD, setSortD] = useState("desc");
  const [fMkt, setFMkt] = useState("All");
  const [fUse, setFUse] = useState("All");
  const [fMin, setFMin] = useState(0);
  const [expAddr, setExpAddr] = useState(null);
  const stopRef = useRef(false);
  const [errMsg, setErrMsg] = useState("");
  const [rateStatus, setRateStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);

  // Feasibility state
  const [feasSelected, setFeasSelected] = useState(new Set());
  const [feasResults, setFeasResults] = useState({}); // keyed by result index
  const [feasBusy, setFeasBusy] = useState(false);
  const [feasProg, setFeasProg] = useState({ d: 0, t: 0 });
  const [feasSortK, setFeasSortK] = useState("overall_score");
  const [feasSortD, setFeasSortD] = useState("desc");
  const [feasFPass, setFeasFPass] = useState("all");
  const [feasFRisk, setFeasFRisk] = useState("all");
  const [feasFMkt, setFeasFMkt] = useState("All");
  const [feasFMin, setFeasFMin] = useState(0);
  const [feasExpAddr, setFeasExpAddr] = useState(null);

  // Broker CRM state
  const [brokers, setBrokers] = useState([]);
  const [editBroker, setEditBroker] = useState(null);
  const [brokerDetail, setBrokerDetail] = useState(null);
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [linkingSiteFor, setLinkingSiteFor] = useState(null);
  const [availableSites, setAvailableSites] = useState([]);

  // Broker enrichment
  const [enrichProg, setEnrichProg] = useState({ d: 0, t: 0, active: false });

  // Page dimming
  const [dim, setDim] = useState(0);
  const [dimHover, setDimHover] = useState(false);

  // Map state
  const [geoCache, setGeoCache] = useState({});
  const [geoProgress, setGeoProgress] = useState({ done: 0, total: 0, active: false });
  const [mapSelection, setMapSelection] = useState(null);          // Set<address> or null (show all)
  const [feasMapSelected, setFeasMapSelected] = useState(new Set()); // Set<_idx> for feas→map pipeline

  // ── Data loading ─────────────────────────────────────────────────────────

  useEffect(() => { loadSessions(); loadBrokers(); }, []);

  const loadSessions = async () => {
    try { const r = await fetch("/api/sessions"); if (r.ok) setSessions(await r.json()); } catch {}
  };
  const loadBrokers = async () => {
    try { const r = await fetch("/api/brokers"); if (r.ok) setBrokers(await r.json()); } catch {}
  };
  const loadBrokerDetail = async (id) => {
    try { const r = await fetch(`/api/brokers/${id}`); if (r.ok) setBrokerDetail(await r.json()); } catch {}
  };

  // ── Screening logic ────────────────────────────────────────────────────────

  const sites = useMemo(() => {
    const raw = addrs.split("\n").map(l => l.trim()).filter(l => l.length > 5);
    const unique = [...new Set(raw)];
    return unique.map(parseSiteLine).filter(s => s.address.length > 5);
  }, [addrs]);
  const runBatch = useCallback(async (batch, attempt = 0) => {
    try {
      const r = await fetch("/api/screen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sites: batch, criteria }),
      });
      const d = await r.json();
      if (d.error) {
        if (attempt < 2 && (d.error.includes("rate") || d.error.includes("overloaded") || d.error.includes("529"))) {
          setErrMsg(`Rate limited — waiting ${15 + attempt * 15}s...`);
          await new Promise(ok => setTimeout(ok, (15 + attempt * 15) * 1000));
          setErrMsg("");
          return runBatch(batch, attempt + 1);
        }
        throw new Error(d.error);
      }
      return d.results;
    } catch (e) {
      if (attempt < 2 && (e.message.includes("fetch") || e.message.includes("Failed") || e.message.includes("network"))) {
        setErrMsg(`Network error — retrying in ${5 + attempt * 5}s...`);
        await new Promise(ok => setTimeout(ok, (5 + attempt * 5) * 1000));
        setErrMsg("");
        return runBatch(batch, attempt + 1);
      }
      setErrMsg(e.message);
      return batch.map(s => ({
        address: s.address, building_sf: s.building_sf, acreage: s.acreage,
        overall_score: 0, location_score: 0, market_score: 0, site_potential: 0,
        competition_risk: 0, rate_environment: 0, potential_use: "Unknown", inferred_type: "Other",
        property_category: null, est_cc_rate_psf_mo: null, est_noncc_rate_psf_mo: null,
        est_occupancy: null, est_sf_per_capita: null, est_pop_trade_area: null, est_hhi: null,
        trade_area_miles: 3, nearby_comps: "Error", criteria_pass: 0, criteria_fail: 0,
        criteria_flags: [], key_insight: "Error: " + e.message, market: "Unknown",
      }));
    }
  }, [criteria]);

  const resetViewState = () => {
    setFeasSelected(new Set()); setFeasResults({});
    setFeasExpAddr(null); setFeasSortK("overall_score"); setFeasSortD("desc");
    setFeasFPass("all"); setFeasFRisk("all"); setFeasFMkt("All"); setFeasFMin(0);
    setMapSelection(null); setFeasMapSelected(new Set());
    setGeoCache({});
  };

  const run = async () => {
    if (!sites.length) return;
    setBusy(true); stopRef.current = false; setResults([]); setProg({ d: 0, t: sites.length });
    setExpAddr(null); setErrMsg(""); setActiveSessionId(null); setRateStatus(null);
    resetViewState();

    const batches = [];
    for (let i = 0; i < sites.length; i += BATCH_SIZE) batches.push(sites.slice(i, i + BATCH_SIZE));

    const allRef = [];
    let nextIdx = 0, lastRender = 0;
    const flush = () => { lastRender = Date.now(); setResults([...allRef]); setProg({ d: allRef.length, t: sites.length }); };

    const ratePoller = setInterval(async () => {
      try { const r = await fetch("/api/rate-status"); if (r.ok) setRateStatus(await r.json()); } catch {}
    }, 15000);

    // Single worker — sequential to avoid rate limits
    while (nextIdx < batches.length && !stopRef.current) {
      const res = await runBatch(batches[nextIdx++]);
      allRef.push(...res);
      if (Date.now() - lastRender > 400) flush();
    }

    clearInterval(ratePoller);
    setRateStatus(null);
    flush();
    setBusy(false);
    if (allRef.length > 0) { setTab("results"); saveSession(allRef); }
  };

  const saveSession = async (resultData) => {
    const name = `${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} — ${resultData.length} sites`;
    try {
      const r = await fetch("/api/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, criteria, results: resultData }),
      });
      if (r.ok) {
        const data = await r.json();
        setActiveSessionId(data.id);
        if (data.resultIds) {
          const withIds = resultData.map((r, i) => ({ ...r, id: data.resultIds[i] }));
          setResults(withIds);
          // Auto-trigger broker enrichment after IDs are assigned
          setTimeout(() => enrichBrokers(withIds), 300);
        }
        loadSessions();
      }
    } catch (e) { console.error("Save error:", e); }
  };

  // ── Broker enrichment (dedicated API call per 2 addresses) ─────────────────
  const enrichBrokers = useCallback(async (resultData) => {
    const toEnrich = resultData
      .map((r, i) => ({ ...r, _idx: i }))
      .filter(r => r.id && (!r.listing_broker || r.listing_broker === "Unknown" || !r.broker_enriched));
    if (!toEnrich.length) return;
    setEnrichProg({ d: 0, t: toEnrich.length, active: true });
    const ENRICH_BATCH = 5;
    for (let i = 0; i < toEnrich.length; i += ENRICH_BATCH) {
      const batch = toEnrich.slice(i, i + ENRICH_BATCH);
      try {
        const r = await fetch("/api/enrich-brokers", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sites: batch.map(s => ({
              address: s.address, inferred_type: s.inferred_type,
              market: s.market, result_id: s.id,
            })),
          }),
        });
        const d = await r.json();
        if (d.results) {
          setResults(prev => {
            const next = [...prev];
            for (const enriched of d.results) {
              const idx = batch.find(b => b.id === enriched.result_id)?._idx;
              if (idx != null && next[idx]) {
                next[idx] = {
                  ...next[idx],
                  listing_broker: enriched.listing_broker || next[idx].listing_broker,
                  listing_broker_co: enriched.listing_broker_co || next[idx].listing_broker_co,
                  listing_broker_phone: enriched.listing_broker_phone || next[idx].listing_broker_phone,
                  listing_broker_email: enriched.listing_broker_email || next[idx].listing_broker_email,
                  broker_confidence: enriched.confidence,
                  broker_enriched: true,
                };
              }
            }
            return next;
          });
        }
      } catch (e) { console.error("Enrich error:", e); }
      setEnrichProg(p => ({ ...p, d: Math.min(i + ENRICH_BATCH, toEnrich.length) }));
    }
    setEnrichProg(p => ({ ...p, active: false }));
    loadBrokers();
  }, []);

  const loadSession = async (id) => {
    try {
      const r = await fetch(`/api/sessions/${id}`);
      if (!r.ok) return;
      const data = await r.json();
      const parsed = data.results.map(r => ({
        ...r, criteria_flags: typeof r.criteria_flags === "string" ? (() => { try { return JSON.parse(r.criteria_flags); } catch { return []; } })() : (r.criteria_flags || []),
      }));
      setResults(parsed);
      setActiveSessionId(id);
      if (data.criteria_json) try { setCriteria(JSON.parse(data.criteria_json)); } catch {}
      // Load feasibility data if it exists (normalize DB integers to booleans)
      if (data.feasibility?.length) {
        const fm = {};
        for (const f of data.feasibility) {
          const idx = parsed.findIndex(r => r.id === f.result_id);
          if (idx >= 0) fm[idx] = {
            ...f,
            ss_permitted: !!f.ss_permitted,
            ss_conditional: !!f.ss_conditional,
            ss_variance: !!f.ss_variance,
            meets_90k: !!f.meets_90k,
          };
        }
        setFeasResults(fm);
      } else {
        setFeasResults({});
      }
      resetViewState();
      setTab("results");
      setExpAddr(null); setFMkt("All"); setFUse("All"); setFMin(0);
      // Auto-enrich brokers for loaded sessions that haven't been enriched
      if (parsed.some(r => !r.listing_broker || r.listing_broker === "Unknown" || !r.broker_enriched)) {
        setTimeout(() => enrichBrokers(parsed), 500);
      }
    } catch (e) { console.error("Load error:", e); }
  };

  const deleteSession = async (id, e) => {
    e.stopPropagation();
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (activeSessionId === id) { setResults([]); setActiveSessionId(null); }
      loadSessions();
    } catch {}
  };

  const rescreenSession = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      const r = await fetch(`/api/sessions/${id}`);
      if (!r.ok) return;
      const data = await r.json();
      const addresses = data.results.map(r => r.address).filter(Boolean);
      if (addresses.length) {
        setAddrs(addresses.join("\n"));
        setTab("input");
      }
    } catch (err) { console.error("Re-screen error:", err); }
  };

  // Re-screen from current results
  const rescreenCurrent = () => {
    const addresses = results.map(r => r.address).filter(Boolean);
    if (addresses.length) {
      setAddrs(addresses.join("\n"));
      setTab("input");
    }
  };

  // ── Feasibility analysis ─────────────────────────────────────────────────

  const runFeasibility = async () => {
    const indices = [...feasSelected];
    if (!indices.length) return;
    setFeasBusy(true); stopRef.current = false; setFeasProg({ d: 0, t: indices.length }); setErrMsg("");

    const FEAS_BATCH = 3;
    const batches = [];
    for (let i = 0; i < indices.length; i += FEAS_BATCH) batches.push(indices.slice(i, i + FEAS_BATCH));

    const newResults = { ...feasResults };
    let done = 0;
    const missed = [];

    for (const batch of batches) {
      if (stopRef.current) break;
      const feasSites = batch.map(i => ({
        address: results[i].address,
        building_sf: results[i].building_sf || null,
        acreage: results[i].acreage || null,
      }));
      let d = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetch("/api/feasibility", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sites: feasSites }),
          });
          const json = await r.json();
          if (json.error) {
            setErrMsg(`Feasibility error (attempt ${attempt + 1}): ${json.error.substring(0, 120)}`);
            if (attempt < 1) { await new Promise(ok => setTimeout(ok, 10000)); continue; }
          } else { d = json; break; }
        } catch (e) {
          setErrMsg(`Feasibility network error: ${e.message}`);
          if (attempt < 1) await new Promise(ok => setTimeout(ok, 10000));
        }
      }
      if (d?.results) {
        for (let j = 0; j < batch.length; j++) {
          const fData = d.results[j] || d.results.find(f =>
            f.address && results[batch[j]].address &&
            f.address.toLowerCase().replace(/[.,]/g, "") === results[batch[j]].address.toLowerCase().replace(/[.,]/g, "")
          );
          if (fData) {
            newResults[batch[j]] = { ...fData, result_id: results[batch[j]].id };
            done++;
          } else {
            missed.push(results[batch[j]].address);
          }
        }
      }
      setFeasProg({ d: done, t: indices.length });
      setFeasResults({ ...newResults });
    }

    if (missed.length) {
      setErrMsg(`Feasibility data missing for ${missed.length} site(s): ${missed.slice(0, 3).join("; ")}${missed.length > 3 ? "..." : ""}`);
    }

    // Persist to DB
    const toSave = Object.values(newResults).filter(f => f.result_id);
    if (toSave.length) {
      try {
        await fetch("/api/feasibility/save", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: toSave }),
        });
      } catch {}
    }

    setFeasBusy(false);
    setTab("feasibility");
  };

  // ── Broker CRM ─────────────────────────────────────────────────────────────

  const saveBroker = async (data) => {
    const url = data.id ? `/api/brokers/${data.id}` : "/api/brokers";
    try {
      const r = await fetch(url, {
        method: data.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (r.ok) { setEditBroker(null); loadBrokers(); if (data.id) loadBrokerDetail(data.id); }
    } catch {}
  };
  const deleteBroker = async (id) => {
    try { await fetch(`/api/brokers/${id}`, { method: "DELETE" }); setBrokerDetail(null); loadBrokers(); } catch {}
  };
  const linkSiteToBroker = async (brokerId, resultId) => {
    try {
      await fetch(`/api/brokers/${brokerId}/sites`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: resultId }),
      });
      loadBrokerDetail(brokerId); setLinkingSiteFor(null);
    } catch {}
  };
  const unlinkSite = async (brokerId, resultId) => {
    try { await fetch(`/api/brokers/${brokerId}/sites/${resultId}`, { method: "DELETE" }); loadBrokerDetail(brokerId); } catch {}
  };
  const loadAvailableSites = async () => {
    try { const r = await fetch("/api/results/search"); if (r.ok) setAvailableSites(await r.json()); } catch {}
  };

  const addBrokerToCRM = async (brokerData, resultId) => {
    const individualName = (brokerData.listing_broker && brokerData.listing_broker !== "Unknown") ? brokerData.listing_broker : null;
    if (!individualName) return null; // Only add individual brokers to CRM
    const res = await fetch("/api/brokers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: individualName, company: brokerData.listing_broker_co || null, email: brokerData.listing_broker_email || null, phone: brokerData.listing_broker_phone || null, markets: brokerData.market || null, status: "active" }),
    });
    const { id } = await res.json();
    if (resultId) await fetch(`/api/brokers/${id}/sites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ result_id: resultId }) });
    loadBrokers();
    return id;
  };

  // ── Derived state (must be above geocoding which depends on filtered) ────

  // Memoized broker name set for O(1) CRM lookups instead of O(n) .some() on every render
  const brokerNameSet = useMemo(() => new Set(brokers.map(b => b.name?.toLowerCase()).filter(Boolean)), [brokers]);

  const doSort = f => { if (sortK === f) setSortD(d => d === "desc" ? "asc" : "desc"); else { setSortK(f); setSortD("desc"); } };
  const doFeasSort = f => { if (feasSortK === f) setFeasSortD(d => d === "desc" ? "asc" : "desc"); else { setFeasSortK(f); setFeasSortD("desc"); } };

  const sorted = useMemo(() =>
    [...results].sort((a, b) => {
      const av = a[sortK] ?? 0, bv = b[sortK] ?? 0;
      return typeof av === "number" ? (sortD === "desc" ? bv - av : av - bv) : (sortD === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv)));
    }), [results, sortK, sortD]);

  const filtered = useMemo(() =>
    sorted.filter(r => (fMkt === "All" || r.market === fMkt) && (fUse === "All" || r.potential_use === fUse) && r.overall_score >= fMin),
    [sorted, fMkt, fUse, fMin]);

  // Memoized map legend counts — avoids 3 separate .filter() calls per render
  const legendCounts = useMemo(() => {
    const counts = { top: 0, mid: 0, low: 0 };
    for (const r of filtered) {
      if (!geoCache[r.address]?.lat || (mapSelection && !mapSelection.has(r.address))) continue;
      if (r.overall_score >= 7) counts.top++;
      else if (r.overall_score >= 5) counts.mid++;
      else counts.low++;
    }
    return counts;
  }, [filtered, geoCache, mapSelection]);

  // ── Geocoding (for Map tab) — only geocodes filtered sites ────────────

  // Cache of market name → {lat,lng} center for viewbox biasing (persisted in localStorage)
  const marketGeoRef = useRef(() => {
    try { return JSON.parse(localStorage.getItem("ss_market_geo") || "{}"); } catch { return {}; }
  });
  // Lazily initialize ref on first access
  if (typeof marketGeoRef.current === "function") marketGeoRef.current = marketGeoRef.current();

  const geocodeAddresses = useCallback(async () => {
    // Only geocode what's actually shown — respect mapSelection (e.g. feasibility sites only)
    const visible = mapSelection ? filtered.filter(r => mapSelection.has(r.address)) : filtered;
    const toGeo = visible.filter(r => r.address && !(r.address in geoCache));
    if (!toGeo.length) return;
    setGeoProgress({ done: 0, total: toGeo.length, active: true });

    // Pre-geocode unique markets to get center points for viewbox biasing
    const markets = [...new Set(toGeo.map(r => r.market).filter(Boolean))];
    for (const mkt of markets) {
      if (marketGeoRef.current[mkt]) continue;
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(mkt)}`, { headers: { "User-Agent": "SiteScreener/1.0" } });
        const data = await resp.json();
        if (data.length) marketGeoRef.current[mkt] = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        await new Promise(ok => setTimeout(ok, 1100));
      } catch { /* skip */ }
    }
    // Persist market centers to localStorage for next session
    try { localStorage.setItem("ss_market_geo", JSON.stringify(marketGeoRef.current)); } catch {}

    const cache = { ...geoCache };
    let lastFlush = 0;
    for (let i = 0; i < toGeo.length; i++) {
      try {
        const addr = toGeo[i].address;
        const hasState = /,\s*[A-Z]{2}\b/.test(addr) || /\b\d{5}\b/.test(addr);
        const geoQuery = hasState ? addr : `${addr}, ${toGeo[i].market || "USA"}`;
        // Build viewbox from market center (~50mi radius) to bias results toward the correct metro
        const mktCenter = toGeo[i].market && marketGeoRef.current[toGeo[i].market];
        const vb = mktCenter ? `&viewbox=${mktCenter.lng - 0.8},${mktCenter.lat + 0.6},${mktCenter.lng + 0.8},${mktCenter.lat - 0.6}&bounded=1` : "";
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us${vb}&q=${encodeURIComponent(geoQuery)}`, { headers: { "User-Agent": "SiteScreener/1.0" } });
        const data = await resp.json();
        if (data.length) {
          cache[toGeo[i].address] = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        } else if (vb) {
          // Fallback: retry without viewbox in case address is just outside the box
          const resp2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(geoQuery)}`, { headers: { "User-Agent": "SiteScreener/1.0" } });
          const data2 = await resp2.json();
          cache[toGeo[i].address] = data2.length ? { lat: parseFloat(data2[0].lat), lng: parseFloat(data2[0].lon) } : null;
          await new Promise(ok => setTimeout(ok, 1100));
        } else {
          cache[toGeo[i].address] = null;
        }
      } catch { cache[toGeo[i].address] = null; }
      setGeoProgress({ done: i + 1, total: toGeo.length, active: i + 1 < toGeo.length });
      if (i === toGeo.length - 1 || i - lastFlush >= 3) { setGeoCache({ ...cache }); lastFlush = i; }
      if (i < toGeo.length - 1) await new Promise(ok => setTimeout(ok, 1100));
    }
    setGeoProgress(p => ({ ...p, active: false }));
  }, [filtered, geoCache, mapSelection]);

  useEffect(() => {
    if (tab === "map" && filtered.length > 0 && !geoProgress.active) {
      const visible = mapSelection ? filtered.filter(r => mapSelection.has(r.address)) : filtered;
      const needs = visible.some(r => r.address && !(r.address in geoCache));
      if (needs) geocodeAddresses();
    }
  }, [tab, filtered, mapSelection]);

  const markerColor = s => s >= 7 ? C.grn : s >= 5 ? C.yel : C.red;

  // ── Derived state (continued) ───────────────────────────────────────────

  const mkts = useMemo(() => [...new Set(results.map(r => r.market))].sort(), [results]);
  const avg = useMemo(() => results.length ? (results.reduce((s, r) => s + r.overall_score, 0) / results.length).toFixed(1) : "—", [results]);
  const top = useMemo(() => results.filter(r => r.overall_score >= 7).length, [results]);
  const actCrit = useMemo(() => Object.values(criteria).filter(c => c.enabled).length, [criteria]);

  const exportCSV = () => {
    const h = ["#","Address","Overall","Location","Market Str","Site Pot","Competition","Rates","Use","Type","Metro","CC $/SF/mo","NonCC $/SF/mo","Occ%","SF/Cap","Pop Trade Area","Avg HHI","Trade Mi","Nearby Comps","Listing Broker","Brokerage","Pass","Fail","Flags","Insight","Google Maps","Google Search"];
    const rows = filtered.map((r, i) => [i + 1, `"${r.address}"`, r.overall_score, r.location_score, r.market_score, r.site_potential, r.competition_risk, r.rate_environment, r.potential_use, r.inferred_type, `"${r.market}"`, r.est_cc_rate_psf_mo ?? "", r.est_noncc_rate_psf_mo ?? "", r.est_occupancy ?? "", r.est_sf_per_capita ?? "", r.est_pop_trade_area ?? "", r.est_hhi ?? "", r.trade_area_miles ?? "", `"${(r.nearby_comps || "").replace(/"/g, "'")}"`, `"${(r.listing_broker || "").replace(/"/g, "'")}"`, `"${(r.listing_broker_co || "").replace(/"/g, "'")}"`, r.criteria_pass, r.criteria_fail, `"${(r.criteria_flags || []).join("; ")}"`, `"${(r.key_insight || "").replace(/"/g, "'")}"`, `"https://www.google.com/maps/search/${encodeURIComponent(r.address)}"`, `"https://www.google.com/search?q=${encodeURIComponent(r.address)}"`]);
    const csv = [h.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `1784_screener_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const exportFeasCSV = () => {
    const h = ["#","Address","Market","Score","CC $/SF/mo","NonCC $/SF/mo","Occ%","Zoning Code","Zoning Status","Risk","Parcel Ac","Achievable GSF","Meets 90K","Pass Both","Zoning Path","Dev Notes","Google Maps"];
    const rows = feasFiltered.map((item, i) => { const r = item._r, f = item._f; return [i + 1, `"${r.address}"`, `"${r.market}"`, r.overall_score, r.est_cc_rate_psf_mo ?? "", r.est_noncc_rate_psf_mo ?? "", r.est_occupancy ?? "", `"${f.zoning_code || ""}"`, item.zoningLabel, f.zoning_risk || "", f.parcel_acres ?? "", f.achievable_gsf ?? "", f.meets_90k ? "YES" : "NO", item.passBoth ? "YES" : "NO", `"${(f.zoning_path || "").replace(/"/g, "'")}"`, `"${(f.development_notes || "").replace(/"/g, "'")}"`, `"https://www.google.com/maps/search/${encodeURIComponent(r.address)}"`]; });
    const csv = [h.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `1784_feasibility_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const upd = (k, f, v) => setCriteria(p => ({ ...p, [k]: { ...p[k], [f]: v } }));

  const statusColor = s => s === "active" ? { bg: `${C.grn}0a`, c: C.grn } : s === "cold" ? { bg: `${C.blue}0a`, c: C.blue } : { bg: `${C.yel}0a`, c: C.yel };
  const filteredBrokers = useMemo(() => brokers.filter(b => brokerFilter === "all" || b.status === brokerFilter), [brokers, brokerFilter]);
  const daysAgo = d => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;
  const useColor = u => USE_COLORS[u] || USE_COLORS._def;
  const typeColor = t => TYPE_COLORS[t] || TYPE_COLORS._def;
  const riskColor = r => r === "low" ? C.grn : r === "medium" ? C.yel : C.red;

  // Toggle feasibility selection for a result
  const toggleFeas = (origIdx) => {
    setFeasSelected(prev => {
      const next = new Set(prev);
      next.has(origIdx) ? next.delete(origIdx) : next.add(origIdx);
      return next;
    });
  };
  const toggleFeasMap = (idx) => {
    setFeasMapSelected(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  };

  // Get original index in results array — O(1) via WeakMap
  const origIndexMap = useMemo(() => { const m = new WeakMap(); results.forEach((r, i) => m.set(r, i)); return m; }, [results]);
  const origIndex = (r) => origIndexMap.get(r) ?? -1;

  // ── Broker Assign (inline dropdown for Results/Feasibility tabs) ──────────

  const BrokerAssign = ({ resultId, popupMode, label }) => {
    const [open, setOpen] = useState(false);
    const [done, setDone] = useState(null); // broker name after assign
    const btnLabel = label || "Assign Broker";

    if (!resultId) return <span style={{ fontSize: 10, color: C.txD, fontStyle: "italic" }}>Save to assign</span>;

    if (brokers.length === 0) return (
      <button onClick={(e) => { e.stopPropagation(); setTab("brokers"); }}
        style={{ padding: "2px 8px", borderRadius: 4, border: `1px solid ${C.brd}`, background: "transparent", color: C.txD, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>+ Add Broker</button>
    );

    if (done) return <Tag bg={`${C.pur}0a`} c={C.pur}>✓ {done}</Tag>;

    const handleLink = async (b, e) => {
      e.stopPropagation();
      const notes = popupMode ? `Saved from map — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : undefined;
      try {
        await fetch(`/api/brokers/${b.id}/sites`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result_id: resultId, notes }),
        });
        setDone(b.name);
      } catch {}
      setOpen(false);
    };

    return (
      <div style={{ position: "relative", display: popupMode ? "block" : "inline-block" }}>
        <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          style={{ padding: popupMode ? "5px 10px" : "2px 8px", borderRadius: popupMode ? 5 : 4, border: `1px solid ${C.pur}40`, background: `${C.pur}10`, color: C.pur, fontSize: popupMode ? 11 : 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, width: popupMode ? "100%" : "auto" }}>
          {btnLabel}
        </button>
        {open && (
          <div onClick={e => e.stopPropagation()} style={{ position: popupMode ? "relative" : "absolute", top: popupMode ? 0 : "100%", left: 0, zIndex: 50, marginTop: 4, background: C.card, border: `1px solid ${C.brd}`, borderRadius: 8, padding: 4, minWidth: 200, boxShadow: popupMode ? "none" : G.shadow }}>
            {brokers.map(b => (
              <div key={b.id} onClick={(e) => handleLink(b, e)}
                style={{ padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = `${C.pur}0a`}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontWeight: 500, color: C.tx }}>{b.name}</span>
                <span style={{ color: C.txD, fontSize: 10 }}>{b.company || ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Map favorite button — saves broker to CRM on click ────────────────────

  const MapFavoriteBtn = ({ result: r }) => {
    const [saved, setSaved] = useState(false);
    if (!r.id) return null;
    const bName = r.listing_broker && r.listing_broker !== "Unknown" ? r.listing_broker : null;
    if (!bName) return null; // Only show CRM button for individual brokers
    const bCo = r.listing_broker_co && r.listing_broker_co !== "Unknown" ? r.listing_broker_co : null;

    const inCRM = brokerNameSet.has(bName.toLowerCase());

    const handleFavorite = async () => {
      try {
        await addBrokerToCRM(r, r.id);
        setSaved(true);
      } catch {}
    };

    const label = `${bName}${bCo ? ` · ${bCo}` : ""}`;

    if (inCRM || saved) return (
      <button disabled style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.grn}40`, background: `${C.grn}10`, color: C.grn, fontSize: 11, cursor: "default", fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 }}>
        ★ {label} — Saved to CRM
      </button>
    );

    return (
      <button onClick={handleFavorite}
        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.yel}50`, background: `${C.yel}12`, color: "#92400e", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, transition: "all 0.15s" }}>
        ☆ Save {label} to CRM
      </button>
    );
  };

  // ── Criteria sub-components ────────────────────────────────────────────────

  const CriteriaRow = ({ k, accent }) => {
    const c = criteria[k];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 12px", borderRadius: 10, background: c.enabled ? `${accent}06` : "transparent", transition: "background 0.2s ease" }}>
        <input type="checkbox" checked={c.enabled} onChange={e => upd(k, "enabled", e.target.checked)} style={{ accentColor: accent, cursor: "pointer" }} />
        <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: c.enabled ? C.tx : C.txD }}>{c.label}</div>
        <select value={c.op} disabled={!c.enabled} onChange={e => upd(k, "op", e.target.value)}
          style={{ width: 50, padding: "4px 2px", borderRadius: 6, fontSize: 13, fontWeight: 700, background: "var(--inputBg)", color: c.enabled ? C.yel : C.txD, border: "none", textAlign: "center", fontFamily: "'JetBrains Mono', monospace", WebkitAppearance: "none", MozAppearance: "none", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath fill='%2394a3b8' d='M0 0l4 5 4-5z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 4px center", paddingRight: 14, cursor: "pointer" }}>
          <option value=">">{">"}</option><option value="<">{"<"}</option><option value=">=">{">="}</option><option value="<=">{"<="}</option>
        </select>
        <input type="number" value={c.value} disabled={!c.enabled} step={c.step}
          onChange={e => upd(k, "value", parseFloat(e.target.value) || 0)}
          style={{ width: 95, padding: "5px 8px", borderRadius: 8, fontSize: 13, background: "var(--inputBg)", color: c.enabled ? C.tx : C.txD, border: "none", fontFamily: "inherit", textAlign: "right" }} />
        <span style={{ fontSize: 10, color: C.txD, minWidth: 54 }}>{c.unit}</span>
      </div>
    );
  };

  const CriteriaGroup = ({ title, icon, accent, keys, note }) => (
    <GlassCard accent={accent}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: note ? 6 : 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 700, color: "#fff",
          fontFamily: "inherit",
          flexShrink: 0,
        }}>{icon}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, letterSpacing: ".02em" }}>{title}</div>
      </div>
      {note && <div style={{ fontSize: 10, color: C.txD, marginBottom: 10, lineHeight: 1.5, paddingLeft: 44 }}>{note}</div>}
      {keys.map(k => <CriteriaRow key={k} k={k} accent={accent} />)}
    </GlassCard>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const validFeas = useMemo(() => Object.entries(feasResults).filter(([idx]) => results[idx]), [feasResults, results]);
  const hasFeas = validFeas.length > 0;

  // Feasibility table: merge, sort, filter
  const feasMerged = useMemo(() => validFeas.map(([idx, f]) => {
    const r = results[idx];
    const zoningOk = f.ss_permitted || f.ss_conditional;
    const zoningLabel = f.ss_permitted ? "PERMITTED" : f.ss_conditional ? "CONDITIONAL" : f.ss_variance ? "VARIANCE" : "NO";
    return { _idx: parseInt(idx), _f: f, _r: r, address: r.address, market: r.market, overall_score: r.overall_score, est_cc_rate_psf_mo: r.est_cc_rate_psf_mo, achievable_gsf: f.achievable_gsf || 0, zoning_risk: f.zoning_risk, zoningOk, zoningLabel, passBoth: zoningOk && f.meets_90k, meets_90k: f.meets_90k };
  }), [validFeas, results]);

  const feasSorted = useMemo(() => [...feasMerged].sort((a, b) => {
    const key = feasSortK;
    let av, bv;
    if (key === "passBoth" || key === "meets_90k") { av = a[key] ? 1 : 0; bv = b[key] ? 1 : 0; }
    else if (key === "zoningLabel") { const o = { PERMITTED: 3, CONDITIONAL: 2, VARIANCE: 1, NO: 0 }; av = o[a.zoningLabel] ?? -1; bv = o[b.zoningLabel] ?? -1; }
    else if (key === "zoning_risk") { const o = { low: 0, medium: 1, high: 2 }; av = o[a.zoning_risk] ?? 1; bv = o[b.zoning_risk] ?? 1; }
    else { av = a[key] ?? 0; bv = b[key] ?? 0; }
    return typeof av === "number" && typeof bv === "number" ? (feasSortD === "desc" ? bv - av : av - bv) : (feasSortD === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv)));
  }), [feasMerged, feasSortK, feasSortD]);

  const feasFiltered = useMemo(() => feasSorted.filter(item => {
    if (feasFMkt !== "All" && item.market !== feasFMkt) return false;
    if (item.overall_score < feasFMin) return false;
    if (feasFPass === "both" && !item.passBoth) return false;
    if (feasFPass === "zoning" && !item.zoningOk) return false;
    if (feasFPass === "gsf" && !item.meets_90k) return false;
    if (feasFPass === "neither" && (item.zoningOk || item.meets_90k)) return false;
    if (feasFRisk !== "all" && item.zoning_risk !== feasFRisk) return false;
    return true;
  }), [feasSorted, feasFMkt, feasFMin, feasFPass, feasFRisk]);

  const feasMkts = useMemo(() => [...new Set(feasMerged.map(item => item.market))].sort(), [feasMerged]);
  const geoCount = filtered.filter(r => geoCache[r.address]?.lat).length;
  const tabList = [
    ["input", "Input"],
    ["criteria", "Criteria"],
    ["results", `Results${results.length ? ` (${results.length})` : ""}`],
    ["feasibility", `Feasibility${hasFeas ? ` (${validFeas.length})` : ""}`],
    ["map", `Map${geoCount ? ` (${geoCount})` : ""}`],
    ["brokers", `Brokers${brokers.length ? ` (${brokers.length})` : ""}`],
    ["history", `History${sessions.length ? ` (${sessions.length})` : ""}`],
  ];

  // Professional background
  useEffect(() => {
    const existing = document.getElementById("matrix-bg");
    if (existing) existing.remove();
    const bg = document.createElement("div");
    bg.id = "matrix-bg";
    bg.style.cssText = lightMode
      ? "position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:linear-gradient(135deg,#e4ecf7 0%,#d8dff2 18%,#ecdce8 38%,#e6d5ce 55%,#d4e3f0 75%,#dde6f4 100%)"
      : "position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:linear-gradient(135deg,#0f172a 0%,#1a1040 30%,#0f2027 60%,#1e293b 100%)";
    // Vivid gradient orbs for depth (glassmorphism needs strong background interest)
    const orb1 = document.createElement("div");
    orb1.style.cssText = lightMode
      ? "position:absolute;top:-12%;right:-8%;width:55vw;height:55vw;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,0.18) 0%,rgba(139,92,246,0.06) 40%,transparent 70%);pointer-events:none"
      : "position:absolute;top:-12%;right:-8%;width:55vw;height:55vw;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,0.18) 0%,transparent 70%);pointer-events:none";
    bg.appendChild(orb1);
    const orb2 = document.createElement("div");
    orb2.style.cssText = lightMode
      ? "position:absolute;bottom:-18%;left:-12%;width:65vw;height:65vw;border-radius:50%;background:radial-gradient(circle,rgba(251,146,60,0.14) 0%,rgba(236,172,136,0.06) 40%,transparent 70%);pointer-events:none"
      : "position:absolute;bottom:-18%;left:-12%;width:65vw;height:65vw;border-radius:50%;background:radial-gradient(circle,rgba(236,172,136,0.10) 0%,transparent 70%);pointer-events:none";
    bg.appendChild(orb2);
    const orb3 = document.createElement("div");
    orb3.style.cssText = lightMode
      ? "position:absolute;top:35%;left:25%;width:45vw;height:45vw;border-radius:50%;background:radial-gradient(circle,rgba(96,165,250,0.14) 0%,rgba(34,211,238,0.04) 45%,transparent 70%);pointer-events:none"
      : "position:absolute;top:35%;left:25%;width:45vw;height:45vw;border-radius:50%;background:radial-gradient(circle,rgba(56,189,248,0.08) 0%,transparent 70%);pointer-events:none";
    bg.appendChild(orb3);
    document.body.insertBefore(bg, document.body.firstChild);
    return () => { bg.remove(); };
  }, [lightMode]);

  return (
    <div style={{ minHeight: "100vh", background: "transparent", color: C.tx, fontFamily: "'Inter', 'DM Sans', system-ui, -apple-system, sans-serif", position: "relative", zIndex: 1 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        :root {
          ${lightMode ? `
          --bg: #f8fafc; --sf: #f1f5f9; --card: #ffffff; --brd: #e2e8f0; --brdL: #cbd5e1;
          --tx: #0f172a; --txM: #475569; --txD: #94a3b8;
          --glass: rgba(255,255,255,0.62); --glassBrd: rgba(255,255,255,0.45);
          --blur: blur(44px) saturate(180%); --blurSm: blur(24px) saturate(160%);
          --shadow: 0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.4) inset;
          --shadowSm: 0 4px 16px rgba(0,0,0,0.05), 0 0 0 1px rgba(255,255,255,0.35) inset;
          --hdrBg: rgba(255,255,255,0.55); --hdrBrd: rgba(255,255,255,0.6); --hdrSh: 0 4px 24px rgba(0,0,0,0.04);
          --tabBg: rgba(255,255,255,0.45); --tabAct: rgba(255,255,255,0.92);
          --inputBg: #f1f5f9; --textaBg: rgba(255,255,255,0.65);
          --rowBg: rgba(255,255,255,0.4); --rowBgAlt: rgba(255,255,255,0.3);
          --rowHov: rgba(30,64,175,0.03); --rowSticky: rgba(255,255,255,0.5);
          --footBg: rgba(255,255,255,0.35); --filterPill: rgba(255,255,255,0.3);
          --filterPillAct: rgba(255,255,255,0.8); --dimBg: rgba(255,255,255,0.65); --dimBrd: rgba(255,255,255,0.5);
          --modalBg: rgba(255,255,255,0.75); --modalSh: 0 24px 80px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.4) inset;
          --popupBg: rgba(255,255,255,0.78); --popupBrd: rgba(255,255,255,0.4);
          --ctrlBg: rgba(255,255,255,0.65); --ctrlBrd: rgba(255,255,255,0.35);
          --bodyBg: #dde5f2;
          ` : `
          --bg: #0f172a; --sf: #1e293b; --card: #1e293b; --brd: #334155; --brdL: #475569;
          --tx: #f1f5f9; --txM: #94a3b8; --txD: #64748b;
          --glass: rgba(30,41,59,0.72); --glassBrd: rgba(255,255,255,0.08);
          --blur: blur(44px) saturate(180%); --blurSm: blur(24px) saturate(160%);
          --shadow: 0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05) inset;
          --shadowSm: 0 4px 16px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.04) inset;
          --hdrBg: rgba(15,23,42,0.65); --hdrBrd: rgba(255,255,255,0.08); --hdrSh: 0 4px 24px rgba(0,0,0,0.2);
          --tabBg: rgba(255,255,255,0.06); --tabAct: rgba(255,255,255,0.14);
          --inputBg: #1e293b; --textaBg: rgba(30,41,59,0.6);
          --rowBg: rgba(15,23,42,0.4); --rowBgAlt: rgba(15,23,42,0.3);
          --rowHov: rgba(59,130,246,0.06); --rowSticky: rgba(15,23,42,0.5);
          --footBg: rgba(15,23,42,0.35); --filterPill: rgba(255,255,255,0.06);
          --filterPillAct: rgba(255,255,255,0.12); --dimBg: rgba(30,41,59,0.75); --dimBrd: rgba(255,255,255,0.08);
          --modalBg: rgba(30,41,59,0.85); --modalSh: 0 24px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06) inset;
          --popupBg: rgba(30,41,59,0.88); --popupBrd: rgba(255,255,255,0.1);
          --ctrlBg: rgba(30,41,59,0.75); --ctrlBrd: rgba(255,255,255,0.1);
          --bodyBg: #0f172a;
          `}
        }
        .sr-row { transition: background 0.3s cubic-bezier(0.16,1,0.3,1); }
        .sr-row:hover { background: var(--rowHov) !important; }
        .glass-card { transition: box-shadow 0.4s cubic-bezier(0.16,1,0.3,1), transform 0.4s cubic-bezier(0.16,1,0.3,1), background 0.3s ease; }
        .glass-card:hover { box-shadow: var(--shadow); transform: translateY(-1px); }
        .brut-btn { transition: all 0.2s cubic-bezier(0.16,1,0.3,1); }
        .brut-btn:hover { box-shadow: 4px 4px 0 rgba(0,0,0,0.18); transform: translate(-1px,-1px); }
        .brut-btn:active { box-shadow: 1px 1px 0 rgba(0,0,0,0.12); transform: translate(1px,1px); }
        button { transition: all 0.2s cubic-bezier(0.16,1,0.3,1); }
        button:active { transform: scale(0.97); }
        select, input[type="number"], input[type="text"], input[type="email"], input[type="date"], textarea { transition: border-color 0.3s ease, box-shadow 0.3s ease; }
        select:focus, input:focus, textarea:focus { outline: none; border-color: #60a5fa !important; box-shadow: 0 0 0 4px rgba(96,165,250,0.1) !important; }
        ::-webkit-scrollbar { width: 0px; height: 0px; }
        * { scrollbar-width: none; }
        body { background: var(--bodyBg) !important; margin: 0; }
        * { box-sizing: border-box; }
        .tab-content { animation: tabIn 0.4s cubic-bezier(0.16,1,0.3,1); }
        .leaflet-popup-content-wrapper { background: var(--popupBg) !important; backdrop-filter: blur(40px) saturate(180%) !important; -webkit-backdrop-filter: blur(40px) saturate(180%) !important; color: var(--tx) !important; border-radius: 16px !important; border: 1px solid var(--popupBrd) !important; box-shadow: var(--shadow) !important; }
        .leaflet-popup-tip { background: var(--popupBg) !important; box-shadow: none !important; }
        .leaflet-popup-close-button { color: var(--txD) !important; font-size: 18px !important; transition: color 0.2s; }
        .leaflet-popup-close-button:hover { color: var(--tx) !important; }
        .leaflet-popup-content { margin: 16px 20px !important; }
        .leaflet-container { font-family: 'Inter', system-ui, sans-serif !important; }
        .leaflet-control-layers { background: var(--ctrlBg) !important; backdrop-filter: blur(40px) saturate(180%) !important; -webkit-backdrop-filter: blur(40px) saturate(180%) !important; border: 1px solid var(--ctrlBrd) !important; border-radius: 12px !important; box-shadow: var(--shadowSm) !important; padding: 8px 12px !important; font-family: 'Inter', system-ui, sans-serif !important; font-size: 11px !important; }
        .leaflet-control-layers-toggle { width: 32px !important; height: 32px !important; border-radius: 8px !important; background-color: var(--ctrlBg) !important; backdrop-filter: blur(40px) !important; -webkit-backdrop-filter: blur(40px) !important; border: 1px solid var(--ctrlBrd) !important; }
        .leaflet-control-layers-separator { border-top-color: var(--ctrlBrd) !important; }
        .leaflet-control-layers label { font-size: 11px !important; color: var(--tx) !important; }
        .site-marker { filter: drop-shadow(0 1px 3px rgba(0,0,0,0.2)); transition: filter 0.2s ease; }
        .site-marker:hover { filter: drop-shadow(0 3px 12px rgba(0,0,0,0.35)) brightness(1.15); }
        @keyframes tabIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalBgIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes markerPulse { 0%, 100% { opacity: 0.12; } 50% { opacity: 0.3; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        table tbody tr { animation: fadeIn 0.2s ease forwards; }
        table tbody tr:nth-child(n+4) { animation-delay: 0.05s; }
        table tbody tr:nth-child(n+8) { animation-delay: 0.1s; }
      `}</style>

      {/* Header */}
      <div style={{ background: "var(--hdrBg)", backdropFilter: "blur(48px) saturate(200%)", WebkitBackdropFilter: "blur(48px) saturate(200%)", borderBottom: "1px solid var(--hdrBrd)", boxShadow: "var(--hdrSh)", padding: "0 36px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 68 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "linear-gradient(135deg,#1e3a5f,#3b5998)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: "#fff", letterSpacing: "-0.02em", fontFamily: "inherit", boxShadow: "0 4px 12px rgba(30,58,95,0.35)" }}>1784</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.025em", color: C.tx, lineHeight: 1.2 }}>Site Screener</div>
              <div style={{ fontSize: 10.5, fontWeight: 500, color: C.txM, letterSpacing: "0.01em", marginTop: 1 }}>Storage Development Feasibility</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2, background: "var(--tabBg)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderRadius: 14, padding: 4, border: "1px solid var(--hdrBrd)", boxShadow: G.shadowSm }}>
            {tabList.map(([id, lbl]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: "8px 18px", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                background: tab === id ? "var(--tabAct)" : "transparent",
                color: tab === id ? C.tx : C.txM,
                fontSize: 12.5, fontWeight: tab === id ? 650 : 500, letterSpacing: "-0.01em",
                boxShadow: tab === id ? "0 2px 10px rgba(0,0,0,0.07), 0 0 0 1px rgba(255,255,255,0.55) inset" : "none",
                transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)",
              }}>{lbl}</button>
            ))}
          </div>
          <button onClick={toggleTheme} title={lightMode ? "Switch to dark mode" : "Switch to light mode"} style={{
            width: 36, height: 36, borderRadius: 10, border: "1px solid var(--hdrBrd)", background: "var(--tabBg)",
            backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            boxShadow: G.shadowSm, transition: "all 0.25s ease", marginLeft: 8,
          }}>{lightMode ? "\u{1F319}" : "\u2600\uFE0F"}</button>
        </div>
      </div>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 32px 40px", position: "relative", zIndex: 1 }}>

        {/* Error banner */}
        {errMsg && (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: `${C.red}08`, border: `1px solid ${C.red}18`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", animation: "tabIn 0.3s ease" }}>
            <span style={{ fontSize: 12, color: C.red }}>{errMsg}</span>
            <button onClick={() => setErrMsg("")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 14, padding: "2px 6px", borderRadius: 4 }}>✕</button>
          </div>
        )}

        {/* ═══ INPUT TAB ═══ */}
        {tab === "input" && (
          <div className="tab-content" style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 580px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.txM, marginBottom: 12, letterSpacing: ".06em", textTransform: "uppercase" }}>
                Paste Addresses — one per line
              </div>
              <textarea value={addrs} onChange={e => setAddrs(e.target.value)} rows={22}
                style={{ width: "100%", padding: 18, borderRadius: 14, border: "1px solid var(--hdrBrd)", background: "var(--textaBg)", backdropFilter: G.blurSm, WebkitBackdropFilter: G.blurSm, color: C.tx, fontSize: 12, lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace", resize: "vertical", outline: "none", boxSizing: "border-box", boxShadow: G.shadowSm }}
                placeholder={"Paste addresses here — one per line:\n\n5050 Azle Ave, Fort Worth, TX 76106\n1427 E 1st St, Santa Ana, CA 92701\n\nOr paste from CoStar (tab-separated):\nAddress  Building SF  Acreage\n\nOr use pipes:\n1234 Main St, City, ST | 45000 SF | 2.1 ac\n\nProcesses in batches of " + BATCH_SIZE + "."} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                {!busy ? (
                  <>
                    <Btn onClick={run} disabled={!sites.length} primary>Screen {sites.length || 0} Sites</Btn>
                    {(addrs.trim() || results.length > 0) && (
                      <button onClick={() => { setAddrs(""); setResults([]); setActiveSessionId(null); setExpAddr(null); setErrMsg(""); setProg({ d: 0, t: 0 }); resetViewState(); setTab("input"); }}
                        style={{ padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.txD}40`, background: "transparent", color: C.txD, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                        Clear
                      </button>
                    )}
                  </>
                ) : (
                  <button onClick={() => { stopRef.current = true; setBusy(false); }} style={{ padding: "8px 20px", borderRadius: 6, border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Stop</button>
                )}
                {busy && <span style={{ fontSize: 12, color: C.txM }}>Screening {prog.d}/{prog.t}...</span>}
                <span style={{ fontSize: 11, color: C.txD, marginLeft: "auto" }}>{sites.length} addresses{sites.filter(s => s.building_sf).length > 0 ? ` | ${sites.filter(s => s.building_sf).length} with building data` : ""} | {actCrit} criteria</span>
              </div>
              {busy && (
                <>
                  <div style={{ marginTop: 8, height: 3, background: C.brd, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "linear-gradient(90deg,#2563eb,#7c3aed)", width: `${prog.t ? (prog.d / prog.t) * 100 : 0}%`, transition: "width .3s" }} />
                  </div>
                  {rateStatus && (
                    <div style={{ marginTop: 6, display: "flex", gap: 12, fontSize: 10, color: C.txD }}>
                      <span>API: {rateStatus.rem} req left</span>
                      <span>{(rateStatus.remTok / 1000).toFixed(0)}k tok</span>
                      {rateStatus.throttled && <span style={{ color: C.yel, fontWeight: 600 }}>Throttling</span>}
                    </div>
                  )}
                </>
              )}
              {results.length > 0 && !busy && tab === "input" && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: `${C.grn}0c`, border: `1px solid ${C.grn}30`, borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: C.grn, fontWeight: 600 }}>{results.length} sites screened</span>
                  <span style={{ fontSize: 11, color: C.txM, marginLeft: 8 }}>— switch to Results tab</span>
                </div>
              )}
              <StepNav rightLabel="Set Criteria" onClick={() => setTab("criteria")} />
            </div>
            <div style={{ flex: "0 0 280px" }}>
              {/* Hero accent from Nano Banana AI */}
              <div style={{ marginBottom: -40, borderRadius: 14, overflow: "hidden", position: "relative" }}>
                <div style={{ height: 110, backgroundImage: "url(/storage-hero.png)", backgroundSize: "cover", backgroundPosition: "center 35%", opacity: 0.15 }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 30%, #ffffff 100%)" }} />
              </div>
              <GlassCard accent="#1e3a5f" style={{ marginBottom: 16, padding: 20, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "#1e3a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="11" rx="1" stroke="#fff" strokeWidth="1.5" fill="none"/><rect x="3" y="6" width="3" height="4" rx="0.5" fill="#fff" opacity="0.7"/><rect x="7" y="6" width="3" height="4" rx="0.5" fill="#fff" opacity="0.5"/><path d="M1 4 L8 1 L15 4" stroke="#fff" strokeWidth="1.5" fill="none"/></svg>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1e3a5f", letterSpacing: ".04em" }}>1784 BUY BOX</div>
                </div>
                {[["Self-Storage", "1.5-5 ac, ground-up"], ["Conversions", "Big box, retail, restaurant"], ["Industrial", "Warehouses to convert/demo"], ["Exposure", "High visibility, barrier locations"]].map(([t, d], i, arr) => (
                  <div key={t} style={{ marginBottom: i < arr.length - 1 ? 10 : 0, paddingBottom: i < arr.length - 1 ? 10 : 0, borderBottom: i < arr.length - 1 ? `1px solid ${G.glassBrd}` : "none" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1e3a5f" }}>{t}</div>
                    <div style={{ fontSize: 10, color: C.txD, marginTop: 1 }}>{d}</div>
                  </div>
                ))}
              </GlassCard>
              <GlassCard accent={C.yel} style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "#d97706", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#fff" strokeWidth="1.5" fill="none"/><text x="8" y="11" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">$</text></svg>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", letterSpacing: ".04em" }}>RATE METHODOLOGY</span>
                </div>
                <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.6 }}>
                  Rates are <strong style={{ color: C.tx }}>T12 achieved $/SF/mo</strong> for 10x10 CC — not promo street rates. Based on Extra Space, Public Storage T12 in-place rents (15-27% above street).
                  <br/><strong style={{ color: C.yel }}>$2.00/SF/mo CC</strong> = feasibility floor. Scores capped if below.
                  <br/><span style={{ color: C.txD }}>National avg T12: ~$1.70/SF/mo.</span>
                </div>
              </GlassCard>
            </div>
          </div>
        )}

        {/* ═══ CRITERIA TAB ═══ */}
        {tab === "criteria" && (
          <div className="tab-content" style={{ position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -40, right: -40, width: 280, height: 280, opacity: 0.045, backgroundImage: "url(/geo-grid.png)", backgroundSize: "contain", backgroundRepeat: "no-repeat", pointerEvents: "none", zIndex: 0 }} />
            <div style={{ marginBottom: 20, position: "relative", zIndex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.04em" }}>Screening Criteria</div>
              <div style={{ fontSize: 13, color: C.txM, marginTop: 4 }}>All storage rates are <strong style={{ color: C.tx }}>per SF per month</strong>.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 14 }}>
              <CriteriaGroup title="SELF-STORAGE RATES" icon="$" accent={C.blue} keys={["cc_rate_min", "cc_rate_max", "noncc_rate_min", "noncc_rate_max"]}
                note="$/SF/month — T12 achieved/in-place rates (not promo). CC min reflects construction cost feasibility." />
              <CriteriaGroup title="MARKET & COMPETITION" icon="M" accent={C.grn} keys={["occupancy_min", "sf_per_capita_max"]}
                note="SF/capita < 8 generally indicates undersupply." />
              <CriteriaGroup title="DEMOGRAPHICS" icon="D" accent={C.pur} keys={["pop_3mi_min", "hhi_min"]}
                note="Trade area population and income." />
              <CriteriaGroup title="SITE REQUIREMENTS" icon="S" accent={C.org} keys={["min_acreage_ss", "max_price_per_acre"]} />
            </div>
            <StepNav
              left={<><Btn onClick={() => setTab("input")}>← Input</Btn><span style={{ fontSize: 11, color: C.txD }}>{actCrit} criteria active</span><Btn onClick={() => setCriteria(DEFAULT_CRITERIA)}>Reset Defaults</Btn></>}
              rightLabel={sites.length ? `Screen ${sites.length} Sites` : "View Results"}
              onClick={() => sites.length ? (setTab("input"), setTimeout(run, 100)) : setTab("results")}
            />
          </div>
        )}

        {/* ═══ RESULTS TAB ═══ */}
        {tab === "results" && (
          <div className="tab-content">
            {results.length === 0 ? (
              <EmptyState text="No results yet. Paste addresses in Input tab or load from History.">
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <Btn onClick={() => setTab("input")} primary>Go to Input</Btn>
                  {sessions.length > 0 && <Btn onClick={() => setTab("history")}>View History</Btn>}
                </div>
              </EmptyState>
            ) : (<>
              <StatRow items={[["Sites", results.length, C.blue], ["Avg Score", avg, sCol(parseFloat(avg) || 0)], ["Top Tier (7+)", top, C.grn], ["Markets", mkts.length, C.pur], ...(feasSelected.size > 0 ? [["Selected", feasSelected.size, C.cyn]] : [])]} />

              {/* Filters + actions */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap", padding: "0 2px" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.txD, letterSpacing: ".07em" }}>FILTER</span>
                <select value={fMkt} onChange={e => setFMkt(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: "var(--inputBg)", color: C.tx, border: "none", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                  <option value="All">All Markets</option>
                  {mkts.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={fUse} onChange={e => setFUse(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: "var(--inputBg)", color: C.tx, border: "none", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                  <option value="All">All Uses</option>
                  {["Self-Storage", "Either", "Unlikely"].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <label style={{ fontSize: 10, color: C.txM, display: "flex", alignItems: "center", gap: 4 }}>
                  Min Score
                  <input type="range" min={0} max={9} value={fMin} onChange={e => setFMin(+e.target.value)} style={{ width: 70, accentColor: C.blue }} />
                  <span style={{ fontFamily: "inherit", color: C.blue, fontWeight: 600 }}>{fMin}</span>
                </label>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {feasBusy && (
                    <button onClick={() => { stopRef.current = true; }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Stop</button>
                  )}
                  {feasSelected.size > 0 && (
                    <Btn onClick={runFeasibility} primary disabled={feasBusy} style={{ padding: "4px 10px" }}>
                      {feasBusy ? `Analyzing ${feasProg.d}/${feasProg.t}...` : `Analyze ${feasSelected.size} Sites`}
                    </Btn>
                  )}
                  <Btn onClick={exportCSV} style={{ padding: "4px 10px" }}>Export CSV</Btn>
                  <Btn onClick={rescreenCurrent} style={{ padding: "4px 10px" }}>Re-screen</Btn>
                  <Btn onClick={() => setTab("input")} style={{ padding: "4px 10px" }}>+ Screen More</Btn>
                  {enrichProg.active && (
                    <span style={{ fontSize: 11, color: C.pur, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.pur, animation: "pulse 1.5s infinite" }} />
                      Verifying brokers... {enrichProg.d}/{enrichProg.t}
                    </span>
                  )}
                </div>
              </div>

              {/* Table */}
              <div style={{ borderRadius: 16, overflow: "hidden", boxShadow: G.shadow, background: G.glass, backdropFilter: G.blur, WebkitBackdropFilter: G.blur, border: `1px solid ${G.glassBrd}` }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--rowBg)" }}>
                        <th style={{ padding: "10px 6px", textAlign: "center", fontSize: 10, fontWeight: 600, color: C.txD, borderBottom: `1px solid ${G.glassBrd}`, minWidth: 28 }}>
                          {(() => {
                            const allChecked = filtered.length > 0 && filtered.every(r => feasSelected.has(origIndex(r)));
                            const someChecked = !allChecked && filtered.some(r => feasSelected.has(origIndex(r)));
                            return (
                              <input type="checkbox"
                                ref={el => { if (el) el.indeterminate = someChecked; }}
                                checked={allChecked}
                                onChange={e => {
                                  if (e.target.checked) setFeasSelected(new Set([...feasSelected, ...filtered.map(r => origIndex(r))]));
                                  else setFeasSelected(new Set([...feasSelected].filter(i => !filtered.some(r => origIndex(r) === i))));
                                }}
                                style={{ accentColor: C.cyn, cursor: "pointer" }} />
                            );
                          })()}
                        </th>
                        {[
                          { k: "_r", l: "#", w: 32 }, { k: "address", l: "Address", w: 210 }, { k: "market", l: "Market", w: 105 },
                          { k: "potential_use", l: "Use", w: 90 }, { k: "inferred_type", l: "Type", w: 90 },
                          ...(filtered.some(r => r.building_sf) ? [{ k: "building_sf", l: "Bldg SF", w: 75 }] : []),
                          { k: "est_cc_rate_psf_mo", l: "CC $/SF/mo", w: 80 },
                          { k: "overall_score", l: "Score", w: 52 }, { k: "location_score", l: "Loc", w: 66 },
                          { k: "rate_environment", l: "Rates", w: 66 }, { k: "competition_risk", l: "Comp", w: 66 },
                          { k: "criteria_pass", l: "Pass", w: 32 }, { k: "criteria_fail", l: "Fail", w: 32 },
                          { k: "_links", l: "Links", w: 200 },
                        ].map(h => (
                          <th key={h.k} onClick={() => !h.k.startsWith("_") && doSort(h.k)}
                            style={{ padding: "10px 6px", textAlign: "left", fontSize: 10, fontWeight: 600, color: sortK === h.k ? C.blue : C.txD, letterSpacing: ".04em", cursor: h.k.startsWith("_") ? "default" : "pointer", borderBottom: `2px solid ${G.glassBrd}`, whiteSpace: "nowrap", minWidth: h.w, userSelect: "none" }}>
                            {h.l}{sortK === h.k && <span style={{ marginLeft: 2 }}>{sortD === "desc" ? " ↓" : " ↑"}</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => {
                        const uc = useColor(r.potential_use), tc = typeColor(r.inferred_type);
                        const isExp = expAddr === r.address;
                        const ccRate = r.est_cc_rate_psf_mo;
                        const ccOk = ccRate != null && ccRate >= (criteria.cc_rate_min.enabled ? criteria.cc_rate_min.value : 0);
                        const oi = origIndex(r);
                        const hasFeasData = !!feasResults[oi];
                        return [
                          <tr key={`r${i}`} className="sr-row" onClick={() => setExpAddr(isExp ? null : r.address)}
                            style={{ background: isExp ? `${C.blue}06` : hasFeasData ? `${C.cyn}04` : "transparent", cursor: "pointer", borderBottom: `1px solid ${G.glassBrd}` }}>
                            <td style={{ padding: "7px 6px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={feasSelected.has(oi)} onChange={() => toggleFeas(oi)} style={{ accentColor: C.cyn, cursor: "pointer" }} />
                            </td>
                            <td style={{ padding: "7px 6px", fontFamily: "inherit", color: C.txD, fontSize: 11 }}>{i + 1}</td>
                            <td style={{ padding: "7px 6px", fontWeight: 500, maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.address}</td>
                            <td style={{ padding: "7px 6px", color: C.txM, fontSize: 11 }}>{r.market}</td>
                            <td style={{ padding: "7px 6px" }}><Tag bg={uc.bg} c={uc.c}>{r.potential_use}</Tag></td>
                            <td style={{ padding: "7px 6px" }}>
                              <Tag bg={tc.bg} c={tc.c}>{r.inferred_type}</Tag>
                              {r.property_category === "conversion" && <Tag bg={CAT_COLORS.conversion.bg} c={CAT_COLORS.conversion.c} style={{ marginLeft: 3, fontSize: 9 }}>Conv</Tag>}
                            </td>
                            {filtered.some(r => r.building_sf) && (
                              <td style={{ padding: "7px 6px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.txM }}>{r.building_sf ? `${Number(r.building_sf).toLocaleString()}` : "—"}</td>
                            )}
                            <td style={{ padding: "7px 6px" }}>
                              {ccRate != null ? (
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 12, color: ccOk ? C.grn : C.red }}>${ccRate.toFixed(2)}</span>
                              ) : <span style={{ color: C.txD, fontSize: 10 }}>—</span>}
                            </td>
                            <td style={{ padding: "7px 6px" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 20, borderRadius: 4, fontWeight: 700, fontSize: 12, background: `${sCol(r.overall_score)}10`, color: sCol(r.overall_score), fontFamily: "'JetBrains Mono', monospace" }}>{r.overall_score}</span>
                            </td>
                            <td style={{ padding: "7px 6px" }}><Bar v={r.location_score} color={sCol(r.location_score)} /></td>
                            <td style={{ padding: "7px 6px" }}><Bar v={r.rate_environment} color={sCol(r.rate_environment)} /></td>
                            <td style={{ padding: "7px 6px" }}><Bar v={r.competition_risk} color={sCol(r.competition_risk)} /></td>
                            <td style={{ padding: "7px 6px", textAlign: "center" }}><span style={{ color: C.grn, fontWeight: 600, fontFamily: "inherit", fontSize: 11 }}>{r.criteria_pass ?? "—"}</span></td>
                            <td style={{ padding: "7px 6px", textAlign: "center" }}><span style={{ color: r.criteria_fail > 0 ? C.red : C.txD, fontWeight: 600, fontFamily: "inherit", fontSize: 11 }}>{r.criteria_fail ?? "—"}</span></td>
                            <td style={{ padding: "7px 6px" }} onClick={e => e.stopPropagation()}>
                              <SiteLinks address={r.address} />
                            </td>
                          </tr>,
                          isExp && (
                            <tr key={`d${i}`} style={{ background: "var(--rowBgAlt)" }}>
                              <td colSpan={filtered.some(r => r.building_sf) ? 15 : 14} style={{ padding: "16px 20px 18px", borderBottom: `1px solid ${G.glassBrd}` }}>
                                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                                  <div style={{ flex: "1 1 300px" }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: C.txM, marginBottom: 5, letterSpacing: ".04em" }}>KEY INSIGHT</div>
                                    <div style={{ fontSize: 12, lineHeight: 1.5 }}>{r.key_insight}</div>
                                    {(r.building_sf || r.acreage || r.property_category) && (
                                      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                        {r.property_category && <Tag bg={(CAT_COLORS[r.property_category] || CAT_COLORS._def).bg} c={(CAT_COLORS[r.property_category] || CAT_COLORS._def).c}>{r.property_category}</Tag>}
                                        {r.building_sf && <Tag bg={`${C.org}0a`} c={C.org}>{Number(r.building_sf).toLocaleString()} SF bldg</Tag>}
                                        {r.acreage && <Tag bg={`${C.yel}0a`} c={C.yel}>{r.acreage} ac</Tag>}
                                      </div>
                                    )}
                                    {r.nearby_comps && r.nearby_comps !== "Error" && (
                                      <div style={{ marginTop: 8 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: C.cyn, marginBottom: 3 }}>NEARBY COMPS</div>
                                        <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.4 }}>{r.nearby_comps}</div>
                                      </div>
                                    )}
                                    {r.criteria_flags?.length > 0 && (
                                      <div style={{ marginTop: 8 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: C.red, marginBottom: 4 }}>CRITERIA FLAGS</div>
                                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                          {r.criteria_flags.map((f, j) => <Tag key={j} bg={`${C.red}0a`} c={C.red}>{f}</Tag>)}
                                        </div>
                                      </div>
                                    )}
                                    {/* Actions row */}
                                    <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                      {hasFeasData && (
                                        <button onClick={(e) => { e.stopPropagation(); setTab("feasibility"); }}
                                          style={{ padding: "5px 12px", borderRadius: 5, border: `1px solid ${C.cyn}40`, background: `${C.cyn}10`, color: C.cyn, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                                          View Feasibility →
                                        </button>
                                      )}
                                      <button onClick={(e) => { e.stopPropagation(); setTab("map"); }}
                                        style={{ padding: "5px 12px", borderRadius: 5, border: `1px solid ${C.pur}40`, background: `${C.pur}10`, color: C.pur, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                                        View on Map
                                      </button>
                                      {((r.listing_broker && r.listing_broker !== "Unknown") || (r.broker_enriched && r.listing_broker_co)) && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                                          <Tag bg={`${C.pur}0a`} c={C.pur}>
                                            {r.listing_broker && r.listing_broker !== "Unknown" ? r.listing_broker : ""}{r.listing_broker_co && r.listing_broker_co !== "Unknown" ? `${r.listing_broker && r.listing_broker !== "Unknown" ? " · " : ""}${r.listing_broker_co}` : ""}
                                          </Tag>
                                          {r.broker_confidence && (
                                            <Tag bg={r.broker_confidence === "high" ? `${C.grn}0a` : r.broker_confidence === "medium" ? `${C.yel}0a` : `${C.red}0a`}
                                                 c={r.broker_confidence === "high" ? C.grn : r.broker_confidence === "medium" ? C.yel : C.red}>
                                              {r.broker_confidence}
                                            </Tag>
                                          )}
                                          {(() => {
                                            const bName = r.listing_broker && r.listing_broker !== "Unknown" ? r.listing_broker : null;
                                            if (!bName) return null;
                                            const inCRM = brokerNameSet.has(bName.toLowerCase());
                                            return inCRM ? (
                                              <Tag bg={`${C.grn}0a`} c={C.grn}>✓ In CRM</Tag>
                                            ) : (
                                              <button onClick={async (e) => {
                                                e.stopPropagation();
                                                try { await addBrokerToCRM(r, r.id); } catch {}
                                              }}
                                                style={{ padding: "2px 8px", borderRadius: 4, border: `1px solid ${C.grn}40`, background: `${C.grn}10`, color: C.grn, fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                                                + Add to CRM
                                              </button>
                                            );
                                          })()}
                                          <BrokerVerifyLinks address={r.address} broker={r.listing_broker} />
                                          {r.listing_broker_phone && <ExtLink href={`tel:${r.listing_broker_phone}`} c={C.txD}>{r.listing_broker_phone}</ExtLink>}
                                          {r.listing_broker_email && <ExtLink href={`mailto:${r.listing_broker_email}`} c={C.txD}>{r.listing_broker_email}</ExtLink>}
                                        </div>
                                      )}
                                      <button onClick={(e) => { e.stopPropagation(); enrichBrokers([r]); }}
                                        style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, color: C.pur, background: `${C.pur}08`, border: `1px solid ${C.pur}18`, cursor: "pointer", fontFamily: "inherit" }}>
                                        {r.broker_enriched ? "Re-verify" : "Verify Broker"}
                                      </button>
                                    </div>
                                  </div>
                                  <div style={{ flex: "0 0 250px" }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: C.txM, marginBottom: 5, letterSpacing: ".04em" }}>MARKET DATA (T12 Achieved)</div>
                                    <DataGrid items={[
                                        ["CC Rate", r.est_cc_rate_psf_mo != null ? `$${r.est_cc_rate_psf_mo.toFixed(2)}/SF/mo` : "—", r.est_cc_rate_psf_mo >= 2.0 ? C.grn : C.red],
                                        ["Non-CC Rate", r.est_noncc_rate_psf_mo != null ? `$${r.est_noncc_rate_psf_mo.toFixed(2)}/SF/mo` : "—"],
                                        ["Rate Status", r.est_cc_rate_psf_mo >= 2.0 ? "✓ Above $2 floor" : r.est_cc_rate_psf_mo >= 1.5 ? "⚠ Below $2 (capped 5)" : "⚠ Below $1.50 (capped 4)", r.est_cc_rate_psf_mo >= 2.0 ? C.grn : C.yel],
                                        ["Occupancy", r.est_occupancy != null ? `${r.est_occupancy}%` : "—", r.est_occupancy >= 88 ? C.grn : null],
                                        ["SF/Capita", r.est_sf_per_capita ?? "—"],
                                        ["Trade Area", r.trade_area_miles ? `${r.trade_area_miles} mi` : "3 mi"],
                                        ["Population", r.est_pop_trade_area != null ? r.est_pop_trade_area.toLocaleString() : "—"],
                                        ["Avg HHI", r.est_hhi != null ? `$${r.est_hhi.toLocaleString()}` : "—"],
                                      ]} />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
                {filtered.length === 0 && results.length > 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: C.txD, fontSize: 12 }}>No sites match current filters.</div>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: C.txD, textAlign: "right" }}>
                {filtered.length} of {results.length} sites | Click row to expand | Check boxes to select for feasibility analysis
              </div>
              <StepNav
                left={feasSelected.size > 0 ? <span style={{ fontSize: 11, color: C.cyn, fontWeight: 600 }}>{feasSelected.size} sites selected</span> : null}
                rightLabel={feasSelected.size > 0 ? `Analyze ${feasSelected.size} → Feasibility` : "View Feasibility"}
                onClick={() => feasSelected.size > 0 ? runFeasibility() : setTab("feasibility")}
              />
            </>)}
          </div>
        )}

        {/* ═══ FEASIBILITY TAB ═══ */}
        {tab === "feasibility" && (
          <div className="tab-content">
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.04em" }}>Zoning & Development Feasibility</div>
              <div style={{ fontSize: 13, color: C.txM, marginTop: 4 }}>
                Zoning entitlement path + development buildout analysis. Min 90,000 GSF on 3 stories above ground.
              </div>
              <div style={{ fontSize: 11, color: C.org, marginTop: 6, fontWeight: 500 }}>
                Zoning codes are AI-estimated and must be verified via municipal GIS.
              </div>
            </div>

            {validFeas.length === 0 ? (
              <EmptyState text='No feasibility analyses yet. Select sites in the Results tab and click "Analyze."'>
                <Btn onClick={() => setTab("results")} primary>Go to Results</Btn>
              </EmptyState>
            ) : (<>
              <StatRow items={[
                ["Showing", `${feasFiltered.length} / ${feasMerged.length}`, C.blue],
                ["Zoning OK", feasMerged.filter(m => m.zoningOk).length, C.grn],
                ["Meets 90k", feasMerged.filter(m => m.meets_90k).length, C.cyn],
                ["Both Pass", feasMerged.filter(m => m.passBoth).length, C.pur],
              ]} />

              {/* Filter bar */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap", padding: "0 2px" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.txD, letterSpacing: ".07em" }}>FILTER</span>
                <select value={feasFMkt} onChange={e => setFeasFMkt(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: "var(--inputBg)", color: C.tx, border: "none", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                  <option value="All">All Markets</option>
                  {feasMkts.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={feasFPass} onChange={e => setFeasFPass(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: "var(--inputBg)", color: C.tx, border: "none", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                  <option value="all">All Status</option>
                  <option value="both">Pass Both</option>
                  <option value="zoning">Zoning OK</option>
                  <option value="gsf">Meets 90K</option>
                  <option value="neither">Neither</option>
                </select>
                <select value={feasFRisk} onChange={e => setFeasFRisk(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, background: "var(--inputBg)", color: C.tx, border: "none", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                  <option value="all">All Risk</option>
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="high">High Risk</option>
                </select>
                <label style={{ fontSize: 10, color: C.txM, display: "flex", alignItems: "center", gap: 4 }}>
                  Min Score
                  <input type="range" min={0} max={9} value={feasFMin} onChange={e => setFeasFMin(+e.target.value)} style={{ width: 70, accentColor: C.blue }} />
                  <span style={{ fontFamily: "inherit", color: C.blue, fontWeight: 600 }}>{feasFMin}</span>
                </label>
                {feasMapSelected.size > 0 && <span style={{ fontSize: 10, color: C.pur, fontWeight: 600 }}>{feasMapSelected.size} for map</span>}
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {feasMapSelected.size > 0 && (
                    <Btn onClick={() => {
                      const sel = new Set();
                      for (const idx of feasMapSelected) { if (results[idx]) sel.add(results[idx].address); }
                      setMapSelection(sel);
                      setTab("map");
                    }} primary style={{ padding: "4px 10px" }}>View {feasMapSelected.size} on Map →</Btn>
                  )}
                  <Btn onClick={exportFeasCSV} style={{ padding: "4px 10px" }}>Export CSV</Btn>
                  <Btn onClick={() => setTab("results")} style={{ padding: "4px 10px" }}>← Results</Btn>
                </div>
              </div>

              {/* Sortable Table */}
              <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: G.shadow, background: G.glass, backdropFilter: G.blur, WebkitBackdropFilter: G.blur, border: `1px solid ${G.glassBrd}` }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "var(--rowBg)" }}>
                        <th style={{ padding: "10px 6px", textAlign: "center", fontSize: 10, fontWeight: 600, color: C.txD, borderBottom: `1px solid ${G.glassBrd}`, minWidth: 28 }}>
                          {(() => {
                            const pbItems = feasFiltered.filter(item => item.passBoth);
                            const allChecked = pbItems.length > 0 && pbItems.every(item => feasMapSelected.has(item._idx));
                            const someChecked = !allChecked && pbItems.some(item => feasMapSelected.has(item._idx));
                            return (
                              <input type="checkbox"
                                ref={el => { if (el) el.indeterminate = someChecked; }}
                                checked={allChecked}
                                onChange={e => {
                                  if (e.target.checked) setFeasMapSelected(new Set([...feasMapSelected, ...pbItems.map(item => item._idx)]));
                                  else setFeasMapSelected(new Set([...feasMapSelected].filter(i => !pbItems.some(item => item._idx === i))));
                                }}
                                title="Select pass-both sites for Map"
                                style={{ accentColor: C.pur, cursor: "pointer" }} />
                            );
                          })()}
                        </th>
                        {[
                          { k: "_n", l: "#", w: 32 },
                          { k: "address", l: "Address", w: 210 },
                          { k: "market", l: "Market", w: 105 },
                          { k: "overall_score", l: "Score", w: 52 },
                          { k: "est_cc_rate_psf_mo", l: "CC $/SF/mo", w: 80 },
                          { k: "zoningLabel", l: "Zoning", w: 90 },
                          { k: "zoning_risk", l: "Risk", w: 70 },
                          { k: "achievable_gsf", l: "Achievable GSF", w: 100 },
                          { k: "passBoth", l: "Pass Both", w: 72 },
                          { k: "_links", l: "Links", w: 130 },
                        ].map(h => (
                          <th key={h.k} onClick={() => !h.k.startsWith("_") && doFeasSort(h.k)}
                            style={{ padding: "10px 6px", textAlign: "left", fontSize: 10, fontWeight: 600, color: feasSortK === h.k ? C.blue : C.txD, letterSpacing: ".04em", cursor: h.k.startsWith("_") ? "default" : "pointer", borderBottom: `2px solid ${G.glassBrd}`, whiteSpace: "nowrap", minWidth: h.w, userSelect: "none" }}>
                            {h.l}{feasSortK === h.k && <span style={{ marginLeft: 2 }}>{feasSortD === "desc" ? " ↓" : " ↑"}</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {feasFiltered.map((item, i) => {
                        const r = item._r, f = item._f;
                        const isExp = feasExpAddr === r.address;
                        const ccRate = r.est_cc_rate_psf_mo;
                        const ccOk = ccRate != null && ccRate >= 2.0;
                        return [
                          <tr key={`fr${i}`} className="sr-row" onClick={() => setFeasExpAddr(isExp ? null : r.address)}
                            style={{ background: isExp ? `${C.blue}06` : item.passBoth ? `${C.grn}04` : "transparent", cursor: "pointer", borderBottom: `1px solid ${G.glassBrd}` }}>
                            <td style={{ padding: "7px 6px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                              {item.passBoth ? (
                                <input type="checkbox" checked={feasMapSelected.has(item._idx)} onChange={() => toggleFeasMap(item._idx)} style={{ accentColor: C.pur, cursor: "pointer" }} />
                              ) : <span style={{ color: C.txD, fontSize: 10 }}>—</span>}
                            </td>
                            <td style={{ padding: "7px 6px", fontFamily: "inherit", color: C.txD, fontSize: 11 }}>{i + 1}</td>
                            <td style={{ padding: "7px 6px", fontWeight: 500, maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.address}</td>
                            <td style={{ padding: "7px 6px", color: C.txM, fontSize: 11 }}>{r.market}</td>
                            <td style={{ padding: "7px 6px" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 20, borderRadius: 4, fontWeight: 700, fontSize: 12, background: `${sCol(r.overall_score)}10`, color: sCol(r.overall_score), fontFamily: "'JetBrains Mono', monospace" }}>{r.overall_score}</span>
                            </td>
                            <td style={{ padding: "7px 6px" }}>
                              {ccRate != null ? (
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 12, color: ccOk ? C.grn : C.red }}>${ccRate.toFixed(2)}</span>
                              ) : <span style={{ color: C.txD, fontSize: 10 }}>—</span>}
                            </td>
                            <td style={{ padding: "7px 6px" }}>
                              <Tag bg={item.zoningOk ? `${C.grn}0a` : `${C.red}0a`} c={item.zoningOk ? C.grn : C.red}>
                                {item.zoningLabel}
                              </Tag>
                            </td>
                            <td style={{ padding: "7px 6px" }}>
                              <Tag bg={`${riskColor(f.zoning_risk)}0a`} c={riskColor(f.zoning_risk)}>{f.zoning_risk}</Tag>
                            </td>
                            <td style={{ padding: "7px 6px" }}>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 11, color: item.achievable_gsf >= 90000 ? C.grn : C.red }}>
                                {item.achievable_gsf ? item.achievable_gsf.toLocaleString() : "—"}
                              </span>
                            </td>
                            <td style={{ padding: "7px 6px" }}>
                              <Tag bg={item.passBoth ? `${C.pur}0d` : `${C.txD}08`} c={item.passBoth ? C.pur : C.txD}>
                                {item.passBoth ? "PASS" : "—"}
                              </Tag>
                            </td>
                            <td style={{ padding: "7px 6px" }} onClick={e => e.stopPropagation()}>
                              <SiteLinks address={r.address} />
                            </td>
                          </tr>,

                          /* ── Expanded detail row ── */
                          isExp && (
                            <tr key={`fd${i}`} style={{ background: "var(--rowBgAlt)" }}>
                              <td colSpan={11} style={{ padding: "16px 20px 18px", borderBottom: `1px solid ${G.glassBrd}` }}>
                                {f.address_flagged && (
                                  <div style={{ background: `${C.org}18`, border: `1px solid ${C.org}30`, borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 11, color: C.org, fontWeight: 600 }}>
                                    No exact street address — zoning cannot be verified. Provide a street number for accurate analysis.
                                  </div>
                                )}
                                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                                  {/* Left: Zoning + Rates */}
                                  <div style={{ flex: "1 1 340px" }}>
                                    {/* Zoning detail */}
                                    <div style={{ marginBottom: 12 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: C.txM, letterSpacing: ".04em" }}>ZONING</div>
                                        {!f.address_flagged && <Tag bg={`${C.org}0a`} c={C.org}>ESTIMATED</Tag>}
                                        <Tag bg={item.zoningOk ? `${C.grn}0a` : `${C.red}0a`} c={item.zoningOk ? C.grn : C.red}>
                                          {f.ss_permitted ? "PERMITTED" : f.ss_conditional ? "CONDITIONAL" : f.ss_variance ? "VARIANCE REQ" : "NOT PERMITTED"}
                                        </Tag>
                                        <Tag bg={`${riskColor(f.zoning_risk)}0a`} c={riskColor(f.zoning_risk)}>{f.zoning_risk} risk</Tag>
                                        <ExtLink href={`https://www.google.com/search?q=${encodeURIComponent(r.address + " zoning GIS parcel")}`} c={C.txD}>Verify GIS</ExtLink>
                                      </div>
                                      <div style={{ fontSize: 11, color: C.txM }}>
                                        <strong style={{ color: C.tx }}>{f.zoning_code}</strong> — {f.zoning_desc}
                                      </div>
                                      <div style={{ fontSize: 11, color: C.txM, marginTop: 3 }}>{f.zoning_path}</div>
                                    </div>

                                    {/* Rate chips */}
                                    <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                                      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderRadius: 6, background: ccOk ? `${C.grn}0c` : `${C.red}0c`, border: `1px solid ${ccOk ? C.grn : C.red}20` }}>
                                        <span style={{ fontSize: 10, color: C.txD }}>CC T12</span>
                                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: ccOk ? C.grn : C.red }}>
                                          {ccRate != null ? `$${ccRate.toFixed(2)}` : "—"}
                                        </span>
                                        <span style={{ fontSize: 9, color: C.txD }}>/SF/mo</span>
                                      </div>
                                      {r.est_noncc_rate_psf_mo != null && (
                                        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderRadius: 6, background: `${C.txD}0c`, border: `1px solid ${C.brd}` }}>
                                          <span style={{ fontSize: 10, color: C.txD }}>Non-CC</span>
                                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 12, color: C.tx }}>${r.est_noncc_rate_psf_mo.toFixed(2)}</span>
                                        </div>
                                      )}
                                      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderRadius: 6, background: `${C.txD}0c`, border: `1px solid ${C.brd}` }}>
                                        <span style={{ fontSize: 10, color: C.txD }}>Occ</span>
                                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 12, color: r.est_occupancy >= 88 ? C.grn : C.txM }}>{r.est_occupancy != null ? `${r.est_occupancy}%` : "—"}</span>
                                      </div>
                                      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderRadius: 6, background: `${C.txD}0c`, border: `1px solid ${C.brd}` }}>
                                        <span style={{ fontSize: 10, color: C.txD }}>SF/Cap</span>
                                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 12, color: C.txM }}>{r.est_sf_per_capita ?? "—"}</span>
                                      </div>
                                      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "5px 10px", borderRadius: 6, background: `${C.txD}0c`, border: `1px solid ${C.brd}` }}>
                                        <span style={{ fontSize: 10, color: C.txD }}>Pop</span>
                                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 12, color: C.txM }}>{r.est_pop_trade_area ? (r.est_pop_trade_area / 1000).toFixed(0) + "K" : "—"}</span>
                                      </div>
                                    </div>

                                    {/* Key insight */}
                                    {r.key_insight && (
                                      <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: C.txM, marginBottom: 3, letterSpacing: ".04em" }}>KEY INSIGHT</div>
                                        <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.5 }}>{r.key_insight}</div>
                                      </div>
                                    )}

                                    {/* Nearby comps */}
                                    {r.nearby_competitors && (
                                      <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: C.txM, marginBottom: 3, letterSpacing: ".04em" }}>NEARBY COMPS</div>
                                        <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.5 }}>{r.nearby_competitors}</div>
                                      </div>
                                    )}

                                    {/* Action buttons */}
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                                      <button onClick={() => { setExpAddr(r.address); setTab("results"); }}
                                        style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${C.blue}30`, background: `${C.blue}0c`, color: C.blue, fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                                        View in Results →
                                      </button>
                                      <button onClick={() => setTab("map")}
                                        style={{ padding: "3px 10px", borderRadius: 5, border: `1px solid ${C.pur}30`, background: `${C.pur}0c`, color: C.pur, fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                                        View on Map
                                      </button>
                                      {((r.listing_broker && r.listing_broker !== "Unknown") || (r.broker_enriched && r.listing_broker_co)) && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                                          <Tag bg={`${C.pur}0a`} c={C.pur}>
                                            {r.listing_broker && r.listing_broker !== "Unknown" ? r.listing_broker : ""}{r.listing_broker_co && r.listing_broker_co !== "Unknown" ? `${r.listing_broker && r.listing_broker !== "Unknown" ? " · " : ""}${r.listing_broker_co}` : ""}
                                          </Tag>
                                          {r.broker_confidence && (
                                            <Tag bg={r.broker_confidence === "high" ? `${C.grn}0a` : r.broker_confidence === "medium" ? `${C.yel}0a` : `${C.red}0a`}
                                                 c={r.broker_confidence === "high" ? C.grn : r.broker_confidence === "medium" ? C.yel : C.red}>
                                              {r.broker_confidence}
                                            </Tag>
                                          )}
                                          {(() => {
                                            const bName = r.listing_broker && r.listing_broker !== "Unknown" ? r.listing_broker : null;
                                            if (!bName) return null;
                                            const inCRM = brokerNameSet.has(bName.toLowerCase());
                                            return inCRM ? (
                                              <Tag bg={`${C.grn}0a`} c={C.grn}>✓ In CRM</Tag>
                                            ) : (
                                              <button onClick={async (e) => {
                                                e.stopPropagation();
                                                try { await addBrokerToCRM(r, r.id); } catch {}
                                              }}
                                                style={{ padding: "2px 8px", borderRadius: 4, border: `1px solid ${C.grn}40`, background: `${C.grn}10`, color: C.grn, fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                                                + Add to CRM
                                              </button>
                                            );
                                          })()}
                                          <BrokerVerifyLinks address={r.address} broker={r.listing_broker} />
                                          {r.listing_broker_phone && <ExtLink href={`tel:${r.listing_broker_phone}`} c={C.txD}>{r.listing_broker_phone}</ExtLink>}
                                          {r.listing_broker_email && <ExtLink href={`mailto:${r.listing_broker_email}`} c={C.txD}>{r.listing_broker_email}</ExtLink>}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Right: Development */}
                                  <div style={{ flex: "0 0 340px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: C.txM, letterSpacing: ".04em" }}>DEVELOPMENT</div>
                                      <Tag bg={f.meets_90k ? `${C.grn}0a` : `${C.red}0a`} c={f.meets_90k ? C.grn : C.red}>
                                        {f.meets_90k ? "MEETS 90K GSF" : "UNDER 90K GSF"}
                                      </Tag>
                                    </div>
                                    <DataGrid cols="1fr 1fr" items={[
                                      ["Parcel", f.parcel_acres ? `${f.parcel_acres} ac (${(f.parcel_sf || 0).toLocaleString()} SF)` : "—"],
                                      ["FAR", f.far_limit ?? "—"],
                                      ["Lot Coverage", f.lot_coverage_pct ? `${(f.lot_coverage_pct * 100).toFixed(0)}%` : "—"],
                                      ["Setbacks", f.front_setback_ft ? `F:${f.front_setback_ft}' S:${f.side_setback_ft}' R:${f.rear_setback_ft}'` : "—"],
                                      ["Max Height", f.max_height_ft ? `${f.max_height_ft}' / ${f.max_stories} stories` : "—"],
                                      ["Buildable SF", f.buildable_sf ? f.buildable_sf.toLocaleString() : "—"],
                                      ["Achievable GSF", f.achievable_gsf ? `${f.achievable_gsf.toLocaleString()} SF` : "—", f.achievable_gsf >= 90000 ? C.grn : C.red],
                                      ["Stories", f.stories_proposed ?? 3],
                                      ...(f.existing_building_sf ? [["Existing Bldg", `${Number(f.existing_building_sf).toLocaleString()} SF`]] : []),
                                      ...(f.conversion_complexity ? [["Conversion", f.conversion_complexity, f.conversion_complexity === "low" ? C.grn : f.conversion_complexity === "medium" ? C.yel : C.red]] : []),
                                    ]} />
                                    {f.conversion_notes && (
                                      <div style={{ fontSize: 10, color: C.org, marginTop: 6, fontStyle: "italic" }}>{f.conversion_notes}</div>
                                    )}
                                    {f.development_notes && (
                                      <div style={{ fontSize: 10, color: C.txM, marginTop: 6, fontStyle: "italic" }}>{f.development_notes}</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer */}
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px" }}>
                <span style={{ fontSize: 10, color: C.txD }}>{feasFiltered.length} of {feasMerged.length} sites | Click row to expand | Zoning codes are AI-estimated</span>
              </div>
              <StepNav
                left={feasMapSelected.size > 0 ? <span style={{ fontSize: 11, color: C.pur, fontWeight: 600 }}>{feasMapSelected.size} sites selected for map</span> : null}
                rightLabel={feasMapSelected.size > 0 ? `View ${feasMapSelected.size} on Map` : "View on Map"}
                onClick={() => {
                  if (feasMapSelected.size > 0) {
                    const sel = new Set();
                    for (const idx of feasMapSelected) { if (results[idx]) sel.add(results[idx].address); }
                    setMapSelection(sel);
                  } else { setMapSelection(null); }
                  setTab("map");
                }}
              />
            </>)}
          </div>
        )}

        {/* ═══ MAP TAB ═══ */}
        {tab === "map" && (
          <div className="tab-content">
            {geoProgress.active && (
              <div style={{ marginBottom: 14, padding: "12px 18px", background: G.glass, backdropFilter: G.blurSm, WebkitBackdropFilter: G.blurSm, borderRadius: 12, boxShadow: G.shadowSm, border: `1px solid ${G.glassBrd}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue, animation: "markerPulse 1.5s ease-in-out infinite" }} />
                  <span style={{ fontSize: 12, color: C.txM, fontWeight: 500 }}>Geocoding sites... {geoProgress.done}/{geoProgress.total}</span>
                </div>
                <div style={{ height: 3, background: C.brd, borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
                  <div style={{ height: "100%", background: "linear-gradient(90deg,#2563eb,#7c3aed)", width: `${geoProgress.total ? (geoProgress.done / geoProgress.total) * 100 : 0}%`, transition: "width .3s" }} />
                </div>
              </div>
            )}

            {mapSelection && (
              <div style={{ marginBottom: 14, padding: "12px 18px", background: "rgba(109,40,217,0.06)", backdropFilter: G.blurSm, WebkitBackdropFilter: G.blurSm, borderRadius: 12, border: `1px solid rgba(109,40,217,0.12)`, display: "flex", alignItems: "center", justifyContent: "space-between", animation: "tabIn 0.3s ease" }}>
                <span style={{ fontSize: 12, color: C.pur, fontWeight: 600 }}>Showing {mapSelection.size} selected feasibility sites</span>
                <Btn onClick={() => setMapSelection(null)} style={{ padding: "5px 14px" }}>Show All Sites</Btn>
              </div>
            )}

            {filtered.length === 0 ? (
              <EmptyState text="No results to map. Screen sites first or adjust filters.">
                <Btn onClick={() => setTab("input")} primary>Go to Input</Btn>
              </EmptyState>
            ) : (
              <div role="region" aria-label={`Site map showing ${mapSelection ? mapSelection.size : geoCount} of ${filtered.length} filtered locations`}
                style={{ position: "relative", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.06)", height: 640, background: "#f1f5f9" }}>
                <MapContainer
                  center={(() => {
                    const pts = filtered.filter(r => geoCache[r.address]?.lat && (!mapSelection || mapSelection.has(r.address))).map(r => geoCache[r.address]);
                    if (!pts.length) return [39.8, -98.5];
                    return [pts.reduce((s, p) => s + p.lat, 0) / pts.length, pts.reduce((s, p) => s + p.lng, 0) / pts.length];
                  })()}
                  zoom={4}
                  style={{ height: "100%", width: "100%" }}
                  zoomControl={false}
                >
                  <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="Map">
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
                      />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Satellite">
                      <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution="&copy; Esri, Maxar, Earthstar Geographics"
                        maxZoom={19}
                      />
                    </LayersControl.BaseLayer>
                  </LayersControl>
                  <FitBounds points={filtered.filter(r => geoCache[r.address]?.lat && (!mapSelection || mapSelection.has(r.address))).map(r => geoCache[r.address])} />
                  {filtered.filter(r => geoCache[r.address]?.lat && (!mapSelection || mapSelection.has(r.address))).map((r, i) => {
                    const pos = geoCache[r.address];
                    const color = markerColor(r.overall_score);
                    const score = r.overall_score;
                    const rad = score >= 7 ? 9 : score >= 5 ? 7 : 5;
                    const oi = origIndex(r);
                    const hasFeasData = !!feasResults[oi];
                    return [
                      /* Glow halo */
                      <CircleMarker key={`g${i}`} center={[pos.lat, pos.lng]} radius={rad + 8}
                        pathOptions={{ color: "transparent", fillColor: color, fillOpacity: 0.12, weight: 0, interactive: false }}
                      />,
                      /* Main marker */
                      <CircleMarker key={`m${i}`} center={[pos.lat, pos.lng]} radius={rad}
                        className="site-marker"
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 2, opacity: 0.9 }}>
                        <Popup>
                          <div style={{ fontFamily: "'Inter','DM Sans',sans-serif", minWidth: 240 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 22, borderRadius: 5, fontWeight: 800, fontSize: 13, background: `${color}18`, color, fontFamily: "inherit" }}>{score}</span>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 12, color: "#0f172a", lineHeight: 1.3 }}>{r.address}</div>
                                <div style={{ fontSize: 10, color: "#64748b" }}>{r.market}</div>
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", fontSize: 11, padding: "6px 0", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
                              <span style={{ color: "#64748b" }}>Use</span><span style={{ color: "#0f172a", fontWeight: 500 }}>{r.potential_use}</span>
                              <span style={{ color: "#64748b" }}>Type</span><span style={{ color: "#0f172a", fontWeight: 500 }}>{r.inferred_type}</span>
                              {r.est_cc_rate_psf_mo != null && (<><span style={{ color: "#64748b" }}>CC Rate</span><span style={{ fontWeight: 600, color: r.est_cc_rate_psf_mo >= 2.0 ? "#059669" : "#dc2626" }}>${r.est_cc_rate_psf_mo.toFixed(2)}/SF/mo</span></>)}
                              {r.est_occupancy != null && (<><span style={{ color: "#64748b" }}>Occupancy</span><span style={{ color: "#0f172a", fontWeight: 500 }}>{r.est_occupancy}%</span></>)}
                              {((r.listing_broker && r.listing_broker !== "Unknown") || (r.broker_enriched && r.listing_broker_co && r.listing_broker_co !== "Unknown")) && (
                                <><span style={{ color: "#64748b" }}>Broker</span><span style={{ color: "#6d28d9", fontWeight: 500 }}>{r.listing_broker && r.listing_broker !== "Unknown" ? r.listing_broker : ""}{r.listing_broker_co && r.listing_broker_co !== "Unknown" ? `${r.listing_broker && r.listing_broker !== "Unknown" ? " · " : ""}${r.listing_broker_co}` : ""}</span></>
                              )}
                            </div>
                            {r.key_insight && (
                              <div style={{ fontSize: 10, color: "#64748b", marginTop: 6, fontStyle: "italic", lineHeight: 1.4 }}>{r.key_insight}</div>
                            )}
                            {/* Navigation links */}
                            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                              <button onClick={() => { setExpAddr(r.address); setTab("results"); }}
                                aria-label={`View ${r.address} in Results tab`}
                                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.45)", color: "#1e40af", fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, transition: "all 0.15s" }}>
                                Results →
                              </button>
                              {hasFeasData && (
                                <button onClick={() => setTab("feasibility")}
                                  aria-label={`View ${r.address} feasibility analysis`}
                                  style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.45)", color: "#0891b2", fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, transition: "all 0.15s" }}>
                                  Feasibility →
                                </button>
                              )}
                            </div>
                            {/* Favorite — save broker to CRM */}
                            <MapFavoriteBtn result={r} />
                            {/* Assign existing CRM broker */}
                            <div style={{ marginTop: 4 }}>
                              <BrokerAssign resultId={r.id} popupMode label="Assign to Broker" />
                            </div>
                          </div>
                        </Popup>
                      </CircleMarker>,
                    ];
                  })}
                </MapContainer>

                {/* Legend overlay */}
                <div aria-label="Map legend" style={{ position: "absolute", bottom: 16, left: 16, zIndex: 1000, background: "rgba(255,255,255,0.65)", backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)", borderRadius: 14, padding: "14px 18px", boxShadow: G.shadow, border: `1px solid ${G.glassBrd}`, pointerEvents: "auto", minWidth: 140 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.txD, letterSpacing: ".08em", marginBottom: 8 }}>SITE SCORES</div>
                  {[{ label: "Top Tier (7+)", color: C.grn, count: legendCounts.top },
                    { label: "Mid Tier (5-6)", color: C.yel, count: legendCounts.mid },
                    { label: "Low Tier (<5)", color: C.red, count: legendCounts.low },
                  ].map(item => (
                    <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, boxShadow: `0 0 6px ${item.color}60`, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: C.txM, flex: 1 }}>{item.label}</span>
                      <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: item.color }}>{item.count}</span>
                    </div>
                  ))}
                </div>

                {/* Stats overlay */}
                <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 1000, background: "rgba(255,255,255,0.65)", backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)", borderRadius: 14, padding: "12px 16px", boxShadow: G.shadow, border: `1px solid ${G.glassBrd}`, pointerEvents: "auto" }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    {mapSelection ? (
                      <>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.pur, fontFamily: "'JetBrains Mono', monospace" }}>{mapSelection.size}</div>
                          <div style={{ fontSize: 8, color: C.txD, letterSpacing: ".06em" }}>SELECTED</div>
                        </div>
                        <div style={{ width: 1, height: 24, background: C.brd }} />
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.txM, fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</div>
                          <div style={{ fontSize: 8, color: C.txD, letterSpacing: ".06em" }}>FILTERED</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.blue, fontFamily: "'JetBrains Mono', monospace" }}>{geoCount}</div>
                          <div style={{ fontSize: 8, color: C.txD, letterSpacing: ".06em" }}>MAPPED</div>
                        </div>
                        <div style={{ width: 1, height: 24, background: C.brd }} />
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.txM, fontFamily: "'JetBrains Mono', monospace" }}>{filtered.length}</div>
                          <div style={{ fontSize: 8, color: C.txD, letterSpacing: ".06em" }}>FILTERED</div>
                        </div>
                        {filtered.some(r => geoCache[r.address] === null) && (<>
                          <div style={{ width: 1, height: 24, background: C.brd }} />
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: C.yel, fontFamily: "'JetBrains Mono', monospace" }}>{filtered.filter(r => geoCache[r.address] === null).length}</div>
                            <div style={{ fontSize: 8, color: C.txD, letterSpacing: ".06em" }}>FAILED</div>
                          </div>
                        </>)}
                      </>
                    )}
                  </div>
                </div>

                {/* Keyboard hint */}
                <div style={{ position: "absolute", top: 52, right: 14, zIndex: 1000, fontSize: 9, color: "#64748b", background: "rgba(255,255,255,0.55)", backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)", padding: "5px 12px", borderRadius: 8, border: `1px solid ${G.glassBrd}`, pointerEvents: "none" }}>
                  Scroll to zoom · Click markers for details
                </div>
              </div>
            )}
            <StepNav rightLabel="Manage Brokers" onClick={() => setTab("brokers")} />
          </div>
        )}

        {/* ═══ BROKERS TAB ═══ */}
        {tab === "brokers" && (
          <div className="tab-content">
            {editBroker !== null && (
              <Modal onClose={() => setEditBroker(null)}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{editBroker.id ? "Edit Broker" : "New Broker"}</div>
                  {(() => {
                    const [form, setForm] = [editBroker, setEditBroker];
                    const F = ({ label, field, type, placeholder }) => (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: C.txD, marginBottom: 3, letterSpacing: ".04em" }}>{label}</div>
                        {type === "textarea" ? (
                          <textarea value={form[field] || ""} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))} placeholder={placeholder}
                            rows={3} style={{ width: "100%", padding: 8, borderRadius: 4, border: "none", borderBottom: `2px solid ${C.brd}`, background: "transparent", color: C.tx, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", resize: "vertical", boxSizing: "border-box", outline: "none" }} />
                        ) : type === "select" ? (
                          <select value={form[field] || "active"} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                            style={{ width: "100%", padding: 8, borderRadius: 4, border: "none", borderBottom: `2px solid ${C.brd}`, background: "transparent", color: C.tx, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none" }}>
                            <option value="active">Active</option><option value="new">New</option><option value="cold">Cold</option>
                          </select>
                        ) : (
                          <input type={type || "text"} value={form[field] || ""} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))} placeholder={placeholder}
                            style={{ width: "100%", padding: 8, borderRadius: 0, border: "none", borderBottom: `2px solid ${C.brd}`, background: "transparent", color: C.tx, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box", outline: "none" }} />
                        )}
                      </div>
                    );
                    return (<>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <F label="NAME" field="name" placeholder="John Smith" />
                        <F label="COMPANY" field="company" placeholder="CBRE, Marcus & Millichap..." />
                        <F label="EMAIL" field="email" type="email" placeholder="john@company.com" />
                        <F label="PHONE" field="phone" placeholder="(555) 123-4567" />
                        <F label="MARKETS" field="markets" placeholder="DFW, Austin, San Antonio" />
                        <F label="SPECIALTY" field="specialty" placeholder="Land, Industrial, Self-Storage" />
                        <F label="STATUS" field="status" type="select" />
                        <F label="NEXT FOLLOW-UP" field="next_followup" type="date" />
                      </div>
                      <F label="LAST CONTACT" field="last_contact" type="date" />
                      <F label="NOTES" field="notes" type="textarea" placeholder="Deal history, specialties..." />
                      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                        <Btn onClick={() => { if (form.name) saveBroker(form); }} disabled={!form.name} primary>{form.id ? "Save Changes" : "Add Broker"}</Btn>
                        <Btn onClick={() => setEditBroker(null)}>Cancel</Btn>
                      </div>
                    </>);
                  })()}
              </Modal>
            )}

            {linkingSiteFor && (
              <Modal onClose={() => setLinkingSiteFor(null)} width={500}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Link Site to Broker</div>
                  <div style={{ fontSize: 11, color: C.txD, marginBottom: 14 }}>Select a screened site to associate.</div>
                  {availableSites.length === 0 ? (
                    <div style={{ color: C.txD, fontSize: 12, padding: 20, textAlign: "center" }}>No screened sites available.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {availableSites.map(s => (
                        <div key={s.id} onClick={() => linkSiteToBroker(linkingSiteFor, s.id)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.brd}`, cursor: "pointer", background: C.sf }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: sCol(s.overall_score), fontFamily: "'JetBrains Mono', monospace", minWidth: 20 }}>{s.overall_score}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{s.address}</div>
                            <div style={{ fontSize: 10, color: C.txD }}>{s.market} | {s.potential_use}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Btn onClick={() => setLinkingSiteFor(null)} style={{ marginTop: 12 }}>Close</Btn>
              </Modal>
            )}

            {brokerDetail ? (
              <div>
                <Btn onClick={() => setBrokerDetail(null)} style={{ marginBottom: 14 }}>Back to List</Btn>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  <GlassCard style={{ flex: "1 1 350px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{brokerDetail.name}</div>
                        {brokerDetail.company && <div style={{ fontSize: 12, color: C.txM, marginTop: 2 }}>{brokerDetail.company}</div>}
                      </div>
                      <Tag {...statusColor(brokerDetail.status)}>{brokerDetail.status}</Tag>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: 12, marginBottom: 14 }}>
                      {brokerDetail.email && <div><span style={{ color: C.txD }}>Email: </span><a href={`mailto:${brokerDetail.email}`} style={{ color: C.blue, textDecoration: "none" }}>{brokerDetail.email}</a></div>}
                      {brokerDetail.phone && <div><span style={{ color: C.txD }}>Phone: </span><a href={`tel:${brokerDetail.phone}`} style={{ color: C.blue, textDecoration: "none" }}>{brokerDetail.phone}</a></div>}
                      {brokerDetail.markets && <div><span style={{ color: C.txD }}>Markets: </span>{brokerDetail.markets}</div>}
                      {brokerDetail.specialty && <div><span style={{ color: C.txD }}>Specialty: </span>{brokerDetail.specialty}</div>}
                      {brokerDetail.last_contact && <div><span style={{ color: C.txD }}>Last Contact: </span>{new Date(brokerDetail.last_contact).toLocaleDateString()}</div>}
                      {brokerDetail.next_followup && <div><span style={{ color: C.txD }}>Follow-up: </span><span style={{ color: new Date(brokerDetail.next_followup) <= new Date() ? C.red : C.grn }}>{new Date(brokerDetail.next_followup).toLocaleDateString()}</span></div>}
                    </div>
                    {brokerDetail.notes && <div style={{ fontSize: 11, color: C.txM, lineHeight: 1.5, padding: "10px 12px", background: "rgba(255,255,255,0.3)", backdropFilter: G.blurSm, WebkitBackdropFilter: G.blurSm, borderRadius: 6, border: `1px solid ${G.glassBrd}` }}>{brokerDetail.notes}</div>}
                    <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                      <Btn onClick={() => setEditBroker({ ...brokerDetail })} primary>Edit</Btn>
                      <button onClick={() => { if (confirm("Delete this broker?")) deleteBroker(brokerDetail.id); }}
                        style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.red}30`, background: "transparent", color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
                    </div>
                  </GlassCard>
                  <div style={{ flex: "1 1 550px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Linked Sites ({brokerDetail.sites?.length || 0})</div>
                      <Btn onClick={() => { setLinkingSiteFor(brokerDetail.id); loadAvailableSites(); }}>+ Link Site</Btn>
                    </div>
                    {(!brokerDetail.sites || brokerDetail.sites.length === 0) ? (
                      <div style={{ padding: 30, textAlign: "center", color: C.txD, fontSize: 12, background: G.glass, backdropFilter: G.blurSm, WebkitBackdropFilter: G.blurSm, borderRadius: 8, border: `1px solid ${G.glassBrd}` }}>No sites linked yet.</div>
                    ) : (
                      <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: G.shadow, background: G.glass, backdropFilter: G.blur, WebkitBackdropFilter: G.blur, border: `1px solid ${G.glassBrd}` }}>
                        <div style={{ maxHeight: 520, overflowY: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                          <thead>
                            <tr style={{ background: "var(--rowSticky)", position: "sticky", top: 0, zIndex: 2, backdropFilter: G.blurSm, WebkitBackdropFilter: G.blurSm }}>
                              {["Score", "Address", "Market", "CC $/SF", "Use", "Type", "Notes", ""].map(h => (
                                <th key={h} style={{ padding: "10px 8px", textAlign: "left", fontSize: 9, fontWeight: 600, color: C.txD, letterSpacing: ".04em", borderBottom: `2px solid ${G.glassBrd}`, whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...brokerDetail.sites].sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0)).map((s, i) => (
                              <tr key={s.link_id || s.id} className="sr-row" style={{ background: "transparent", borderBottom: `1px solid ${G.glassBrd}` }}>
                                <td style={{ padding: "7px 8px", textAlign: "center" }}>
                                  <span style={{ display: "inline-block", width: 24, height: 20, lineHeight: "20px", borderRadius: 4, fontWeight: 800, fontSize: 12, textAlign: "center", background: `${sCol(s.overall_score)}10`, color: sCol(s.overall_score), fontFamily: "'JetBrains Mono', monospace" }}>{s.overall_score}</span>
                                </td>
                                <td style={{ padding: "7px 8px", fontWeight: 500, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.address}</td>
                                <td style={{ padding: "7px 8px", color: C.txM, fontSize: 10 }}>{s.market || "—"}</td>
                                <td style={{ padding: "7px 8px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: s.est_cc_rate_psf_mo >= 2.0 ? C.grn : s.est_cc_rate_psf_mo ? C.red : C.txD }}>{s.est_cc_rate_psf_mo ? `$${s.est_cc_rate_psf_mo.toFixed(2)}` : "—"}</td>
                                <td style={{ padding: "7px 8px" }}><Tag {...(USE_COLORS[s.potential_use] || USE_COLORS._def)}>{s.potential_use || "—"}</Tag></td>
                                <td style={{ padding: "7px 8px", color: C.txM, fontSize: 10 }}>{s.inferred_type || "—"}</td>
                                <td style={{ padding: "7px 8px", maxWidth: 180, fontSize: 10, color: C.txM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.broker_note || ""}>{s.broker_note || "—"}</td>
                                <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                                  <div style={{ display: "flex", gap: 3 }}>
                                    <SiteLinks address={s.address} />
                                    <button onClick={() => unlinkSite(brokerDetail.id, s.id)}
                                      style={{ padding: "2px 6px", borderRadius: 4, border: `1px solid ${C.red}30`, background: "transparent", color: C.red, fontSize: 9, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Unlink</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                        {/* Summary bar */}
                        <div style={{ padding: "10px 14px", background: "var(--footBg)", borderTop: `1px solid ${G.glassBrd}`, display: "flex", gap: 16, fontSize: 10, color: C.txM }}>
                          <span>Avg Score: <strong style={{ color: C.tx, fontFamily: "'JetBrains Mono', monospace" }}>{(brokerDetail.sites.reduce((s, x) => s + (x.overall_score || 0), 0) / brokerDetail.sites.length).toFixed(1)}</strong></span>
                          <span>Markets: <strong style={{ color: C.tx }}>{[...new Set(brokerDetail.sites.map(s => s.market).filter(Boolean))].length}</strong></span>
                          <span>Top Tier: <strong style={{ color: C.grn }}>{brokerDetail.sites.filter(s => s.overall_score >= 7).length}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -30, right: -30, width: 240, height: 240, opacity: 0.04, backgroundImage: "url(/storage-hero.png)", backgroundSize: "contain", backgroundRepeat: "no-repeat", pointerEvents: "none", zIndex: 0 }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, position: "relative", zIndex: 1 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.04em" }}>Broker CRM</div>
                    <div style={{ fontSize: 13, color: C.txM, marginTop: 4 }}>Track brokers, link to sites, manage follow-ups.</div>
                  </div>
                  <Btn onClick={() => setEditBroker({ name: "", company: "", email: "", phone: "", markets: "", specialty: "", status: "new", notes: "", last_contact: "", next_followup: "" })} primary>+ New Broker</Btn>
                </div>
                <StatRow items={[["Total", brokers.length, C.blue], ["Active", brokers.filter(b => b.status === "active").length, C.grn], ["Follow-up", brokers.filter(b => b.next_followup && new Date(b.next_followup) <= new Date()).length, C.red], ["Sites", brokers.reduce((s, b) => s + (b.site_count || 0), 0), C.pur]]} />
                <div style={{ display: "flex", gap: 2, marginBottom: 16, background: "var(--filterPill)", backdropFilter: G.blurSm, WebkitBackdropFilter: G.blurSm, borderRadius: 10, padding: 3, width: "fit-content", border: `1px solid ${G.glassBrd}` }}>
                  {["all", "active", "new", "cold"].map(f => (
                    <button key={f} onClick={() => setBrokerFilter(f)}
                      style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: brokerFilter === f ? "var(--filterPillAct)" : "transparent", color: brokerFilter === f ? C.tx : C.txM, fontSize: 11, fontWeight: brokerFilter === f ? 600 : 500, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize", boxShadow: brokerFilter === f ? "0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(255,255,255,0.4) inset" : "none", transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)" }}>{f}</button>
                  ))}
                </div>
                {filteredBrokers.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 50, color: C.txD, fontSize: 13 }}>{brokers.length === 0 ? "No brokers yet." : "No brokers match this filter."}</div>
                ) : (
                  <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: G.shadow, background: G.glass, backdropFilter: G.blur, WebkitBackdropFilter: G.blur, border: `1px solid ${G.glassBrd}` }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "var(--rowBg)" }}>
                          {["Name", "Company", "Markets", "Specialty", "Status", "Last Contact", "Follow-up", "Sites"].map(h => (
                            <th key={h} style={{ padding: "10px 10px", textAlign: "left", fontSize: 10, fontWeight: 600, color: C.txD, letterSpacing: ".04em", borderBottom: `2px solid ${G.glassBrd}`, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBrokers.map((b, i) => {
                          const sc = statusColor(b.status);
                          const days = daysAgo(b.last_contact);
                          const overdue = b.next_followup && new Date(b.next_followup) <= new Date();
                          return (
                            <tr key={b.id} className="sr-row" onClick={() => loadBrokerDetail(b.id)}
                              style={{ background: "transparent", cursor: "pointer", borderBottom: `1px solid ${G.glassBrd}` }}>
                              <td style={{ padding: "9px 10px", fontWeight: 600 }}>{b.name}</td>
                              <td style={{ padding: "9px 10px", color: C.txM }}>{b.company || "—"}</td>
                              <td style={{ padding: "9px 10px", color: C.txM, fontSize: 11 }}>{b.markets || "—"}</td>
                              <td style={{ padding: "9px 10px", color: C.txM, fontSize: 11 }}>{b.specialty || "—"}</td>
                              <td style={{ padding: "9px 10px" }}><Tag bg={sc.bg} c={sc.c}>{b.status}</Tag></td>
                              <td style={{ padding: "9px 10px", fontSize: 11, color: days != null && days > 30 ? C.yel : C.txM }}>{days != null ? `${days}d ago` : "—"}</td>
                              <td style={{ padding: "9px 10px", fontSize: 11, color: overdue ? C.red : C.txM, fontWeight: overdue ? 600 : 400 }}>{b.next_followup ? new Date(b.next_followup).toLocaleDateString() : "—"}</td>
                              <td style={{ padding: "9px 10px" }}><span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: b.site_count > 0 ? C.pur : C.txD }}>{b.site_count || 0}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            <StepNav rightLabel="View History" onClick={() => setTab("history")} />
          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {tab === "history" && (
          <div className="tab-content">
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.04em" }}>Screening History</div>
              <div style={{ fontSize: 13, color: C.txM, marginTop: 4 }}>Past sessions. Click to load.</div>
            </div>
            {sessions.length === 0 ? (
              <div style={{ textAlign: "center", padding: 50, color: C.txD }}>
                <div style={{ fontSize: 13 }}>No sessions yet.</div>
                <Btn onClick={() => setTab("input")} primary style={{ marginTop: 14 }}>Go to Input</Btn>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sessions.map(s => (
                  <div key={s.id} onClick={() => loadSession(s.id)}
                    className="glass-card"
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                      background: activeSessionId === s.id ? `rgba(30,64,175,0.08)` : G.glass,
                      backdropFilter: G.blurSm, WebkitBackdropFilter: G.blurSm,
                      border: `1px solid ${activeSessionId === s.id ? `rgba(30,64,175,0.2)` : G.glassBrd}`,
                      borderRadius: 14, cursor: "pointer", transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)", boxShadow: activeSessionId === s.id ? `0 2px 8px rgba(30,64,175,0.1)` : G.shadowSm }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: C.txD, marginTop: 2 }}>
                        {new Date(s.created_at + "Z").toLocaleString()} | {s.result_count ?? s.address_count} sites
                      </div>
                    </div>
                    {s.avg_score != null && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: sCol(s.avg_score), fontFamily: "'JetBrains Mono', monospace" }}>{s.avg_score}</div>
                        <div style={{ fontSize: 9, color: C.txD }}>AVG</div>
                      </div>
                    )}
                    <button onClick={(e) => rescreenSession(s.id, e)}
                      style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.cyn}40`, background: `${C.cyn}10`, color: C.cyn, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Re-screen</button>
                    <button onClick={(e) => deleteSession(s.id, e)}
                      style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.brdL}`, background: "transparent", color: C.txM, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dimming overlay */}
      {dim > 0 && (
        <div style={{
          position: "fixed", inset: 0,
          background: `rgba(0, 0, 0, ${dim / 100})`,
          pointerEvents: "none",
          zIndex: 9998,
          transition: "background 0.3s ease",
        }} />
      )}

      {/* Dimming slider control */}
      <div
        onMouseEnter={() => setDimHover(true)}
        onMouseLeave={() => setDimHover(false)}
        style={{
          position: "fixed", bottom: 20, right: 20,
          zIndex: 9999,
          background: "var(--dimBg)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderRadius: 12,
          border: "1px solid var(--dimBrd)",
          padding: "8px 14px",
          display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
          cursor: "pointer",
          transition: "all 0.2s ease",
          overflow: "hidden",
        }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.txM, letterSpacing: "0.05em", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>DIM</span>
        <div style={{
          width: dimHover ? 80 : 0,
          opacity: dimHover ? 1 : 0,
          overflow: "hidden",
          transition: "width 0.25s ease, opacity 0.2s ease",
        }}>
          <input type="range" min={0} max={70} value={dim}
            onChange={e => setDim(Number(e.target.value))}
            style={{ width: 80, accentColor: C.blue, cursor: "pointer" }}
          />
        </div>
      </div>
    </div>
  );
}
