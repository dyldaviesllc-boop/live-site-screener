import { readFileSync, existsSync } from "fs";
import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env ────────────────────────────────────────────────────────────────
try {
  const envFile = readFileSync(join(__dirname, ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch {}

const PORT = process.env.PORT || 3784;
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("ANTHROPIC_API_KEY not set in .env"); process.exit(1); }

// ── Live Data Integration ───────────────────────────────────────────────────
import { getAvailableSources } from "./api/_lib/live/index.js";
console.log("[live-data] Available sources:", getAvailableSources());

// ── Initialize database (runs schema + migrations on import) ────────────────
import "./lib/db.js";

// ── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "2mb" }));

// ── Auth middleware ───────────────────────────────────────────────────────
app.use("/api", (req, res, next) => {
  const authToken = process.env.AUTH_TOKEN;
  if (!authToken) return next(); // No token configured = dev mode, skip auth
  const provided = req.headers["x-auth-token"] || req.headers.authorization?.replace("Bearer ", "");
  if (provided === authToken) return next();
  res.status(401).json({ error: "Unauthorized" });
});

const distPath = join(__dirname, "dist");
if (existsSync(distPath)) app.use(express.static(distPath));

// ── Routes ───────────────────────────────────────────────────────────────────
import screenRouter from "./routes/screen.js";
import feasibilityRouter from "./routes/feasibility.js";
import brokersRouter from "./routes/brokers.js";
import sessionsRouter from "./routes/sessions.js";
import dataRouter from "./routes/data.js";

app.use("/api", screenRouter);
app.use("/api", feasibilityRouter);
app.use("/api", brokersRouter);
app.use("/api", sessionsRouter);
app.use("/api", dataRouter);

// SPA fallback
if (existsSync(distPath)) {
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(join(distPath, "index.html"));
  });
}

app.listen(PORT, () => console.log(`Site Screener → http://localhost:${PORT}`));
