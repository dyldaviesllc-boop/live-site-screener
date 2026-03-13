export default function handler(req, res) {
  // In serverless, we don't have persistent rate state across invocations.
  // Return a default "healthy" state — the actual rate limiting happens
  // per-invocation via Anthropic's response headers in callClaude.
  res.json({ rem: 50, remTok: 80000, inflight: 0, queued: 0, gap: 800, throttled: false });
}
