// ── Rate Limiter ─────────────────────────────────────────────────────────────

const rl = {
  rem: 50, remTok: 80000, resetAt: 0, resetTokAt: 0,
  last: 0, gap: 800, inflight: 0, maxConc: 1, queue: [],

  update(h) {
    const rr = h.get("x-ratelimit-remaining-requests");
    const rt = h.get("x-ratelimit-remaining-tokens");
    if (rr != null) this.rem = parseInt(rr, 10);
    if (rt != null) this.remTok = parseInt(rt, 10);
    const rReq = h.get("x-ratelimit-reset-requests");
    const rTok = h.get("x-ratelimit-reset-tokens");
    if (rReq) this.resetAt = new Date(rReq).getTime();
    if (rTok) this.resetTokAt = new Date(rTok).getTime();
    this.gap = this.rem <= 3 || this.remTok <= 5000 ? 12000
      : this.rem <= 8 || this.remTok <= 12000 ? 4000
      : this.rem <= 20 ? 1200 : 600;
    console.log(`[rate] ${this.rem} req, ${this.remTok} tok → ${this.gap}ms`);
  },

  async acquire() {
    while (this.inflight >= this.maxConc)
      await new Promise(r => this.queue.push(r));
    this.inflight++;
    const elapsed = Date.now() - this.last;
    if (elapsed < this.gap)
      await new Promise(ok => setTimeout(ok, this.gap - elapsed));
    if (this.rem <= 1 && this.resetAt > Date.now())
      await new Promise(ok => setTimeout(ok, Math.min(this.resetAt - Date.now() + 500, 65000)));
    if (this.remTok <= 5000 && this.resetTokAt > Date.now())
      await new Promise(ok => setTimeout(ok, Math.min(this.resetTokAt - Date.now() + 500, 65000)));
    this.last = Date.now();
  },

  release() {
    this.inflight--;
    if (this.queue.length) this.queue.shift()();
  },
};

// ── Shared Anthropic caller ──────────────────────────────────────────────────

async function callClaude(system, userMsg, { maxTokens = 2048 } = {}, attempt = 0) {
  const API_KEY = process.env.ANTHROPIC_API_KEY;
  const MAX_RETRIES = 4;
  await rl.acquire();
  try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-beta": "prompt-caching-2024-07-31" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages: [{ role: "user", content: userMsg }] }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (attempt < MAX_RETRIES) {
      const wait = (2 ** attempt) * 3000;
      console.log(`[retry] fetch err (${attempt + 1}): ${err.message}, ${wait / 1000}s`);
      await new Promise(ok => setTimeout(ok, wait));
      return callClaude(system, userMsg, { maxTokens }, attempt + 1);
    }
    throw err;
  }
  clearTimeout(timer);
  rl.update(r.headers);

  if ((r.status === 429 || r.status === 529) && attempt < MAX_RETRIES) {
    const retryAfter = parseInt(r.headers.get("retry-after") || "0", 10);
    const wait = Math.max(retryAfter * 1000, (2 ** attempt) * 5000, 10000);
    console.log(`[retry] ${r.status} (${attempt + 1}), ${wait / 1000}s`);
    await new Promise(ok => setTimeout(ok, wait));
    return callClaude(system, userMsg, { maxTokens }, attempt + 1);
  }

  const data = await r.json();
  if (data.error) {
    console.error(`[api-error] ${r.status} ${JSON.stringify(data.error)}`);
    throw new Error(data.error.message || "API error");
  }

  const txt = (data.content || []).filter(b => b.type === "text").map(b => b.text || "").join("");
  const clean = txt.replace(/```json|```/g, "").trim();

  // Helper: fix common JSON issues (unquoted values, trailing commas)
  function repairJSON(s) {
    return s
      .replace(/:\s*([A-Za-z][A-Za-z0-9\-\/]+)\s*([,}])/g, (_, v, end) => {
        // Don't requote true/false/null
        if (/^(true|false|null)$/i.test(v)) return `: ${v.toLowerCase()}${end}`;
        return `: "${v}"${end}`;
      })
      .replace(/,\s*([}\]])/g, "$1"); // trailing commas
  }

  function tryParse(s) {
    try { return JSON.parse(s); } catch {}
    try { return JSON.parse(repairJSON(s)); } catch {}
    return null;
  }

  // 1. Try exact array match
  const match = clean.match(/\[[\s\S]*\]/);
  if (match) {
    const parsed = tryParse(match[0]);
    if (parsed) return parsed;
  }

  // 2. Try to recover truncated JSON arrays
  const arrStart = clean.indexOf("[");
  if (arrStart >= 0) {
    let partial = clean.slice(arrStart);
    const lastBrace = partial.lastIndexOf("}");
    if (lastBrace > 0) {
      partial = partial.slice(0, lastBrace + 1) + "]";
      const parsed = tryParse(partial);
      if (parsed) { console.log(`[json-recover] truncated → recovered ${parsed.length} items`); return parsed; }
    }
  }

  // 3. Last resort — try full text
  const parsed = tryParse(clean);
  if (parsed) return parsed;

  // 4. Extract individual JSON objects and rebuild array
  const objMatches = clean.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
  if (objMatches?.length) {
    const items = objMatches.map(m => tryParse(m)).filter(Boolean);
    if (items.length) { console.log(`[json-recover] extracted ${items.length} individual objects`); return items; }
  }

  // 5. Try line-by-line JSONL (some models output one JSON object per line)
  const lines = clean.split("\n").map(l => l.trim()).filter(l => l.startsWith("{"));
  if (lines.length) {
    const items = lines.map(l => tryParse(l)).filter(Boolean);
    if (items.length) { console.log(`[json-recover] JSONL → recovered ${items.length} items`); return items; }
  }

  // Log raw response for debugging
  console.error("[json-fail] raw response text:", txt.substring(0, 500));
  throw new Error("Failed to parse API response as JSON");
  } finally {
    rl.release();
  }
}

export { callClaude, rl };
