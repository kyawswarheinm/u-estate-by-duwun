// Person 2 smoke check: partner, fallback and rate-limit behaviour of the API routes.
// Run against a running app:  node tests/partner-api.check.mjs [baseUrl]   (default http://localhost:3000)
// It reads which keys are set from /partners-style env detection only through the responses; it never needs or prints keys.
// Without keys it checks the labelled fallbacks; with keys some checks switch to the "live" expectation.
const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const results = [];
let ipCounter = 0;
const freshIp = () => `10.99.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`; // isolates each check from the per-IP limiter

async function call(path, { method = "GET", body, raw, ip = freshIp() } = {}) {
  const headers = { "x-forwarded-for": ip };
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* audio or HTML */ }
  return { status: r.status, json, text, type: r.headers.get("content-type") ?? "" };
}

async function check(area, name, fn) {
  try {
    const detail = await fn();
    results.push({ area, name, ok: true, detail: detail ?? "" });
  } catch (e) {
    results.push({ area, name, ok: false, detail: e.message });
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

// ---------- Tokenomist T1 (R13) ----------
const token = (t, depositThb, payWithinDays) => call("/api/token-check", { method: "POST", body: { token: t, depositThb, payWithinDays } });

await check("Tokenomist", "sample-cliff ฿400,000 / 30 days → High, hold ฿600,000, SAMPLE", async () => {
  const { status, json } = await token("sample-cliff", 400000, 30);
  expect(status === 200, `status ${status}`);
  expect(json.result.level === "high", `level ${json.result.level}`);
  expect(json.result.tokenValueToHoldThb === 600000, `hold ${json.result.tokenValueToHoldThb}`);
  expect(json.token.is_sample === true && /SAMPLE/.test(json.token.source), "not labelled SAMPLE");
  return `level=high, hold=600000, source="${json.token.source}"`;
});
await check("Tokenomist", "demo-script case: sample-cliff ฿1,000,000 / 14 days → High, hold ฿1,500,000", async () => {
  const { json } = await token("sample-cliff", 1000000, 14);
  expect(json.result.level === "high", `level ${json.result.level}`);
  expect(json.result.tokenValueToHoldThb === 1500000, `hold ${json.result.tokenValueToHoldThb}`);
});
await check("Tokenomist", "lookup by symbol SCLF finds sample-cliff", async () => {
  const { json } = await token("SCLF", 100000, 30);
  expect(json.token?.id === "sample-cliff", `got ${JSON.stringify(json.token)}`);
});
await check("Tokenomist", "sample-drip / 10 days (0.6% in window) → Low", async () => {
  const { json } = await token("sample-drip", 100000, 10);
  expect(json.result.level === "low", `level ${json.result.level}`);
});
await check("Tokenomist", "sample-drip / 30 days (1.5% in window) → Medium", async () => {
  const { json } = await token("sample-drip", 100000, 30);
  expect(json.result.level === "medium", `level ${json.result.level}`);
});
await check("Tokenomist", "sample-steady (fully unlocked) → Low, hold +15%", async () => {
  const { json } = await token("sample-steady", 100000, 30);
  expect(json.result.level === "low", `level ${json.result.level}`);
  expect(json.result.tokenValueToHoldThb === 115000, `hold ${json.result.tokenValueToHoldThb}`);
});
await check("Tokenomist", "real token (arbitrum): Unknown + 'not connected' without a key; live result with a key", async () => {
  const { status, json } = await token("arbitrum", 100000, 30);
  expect(status === 200, `status ${status}`);
  if (json.note && /not connected/i.test(json.note)) {
    expect(json.result.level === "unknown", `level ${json.result.level} (must never be low)`);
    return "fallback: unknown, not connected";
  }
  expect(json.token?.is_sample === false, "live token must not be labelled sample");
  return `live: level=${json.result.level}`;
});
await check("Tokenomist", "advice always says U-Estate never accepts crypto", async () => {
  const { json } = await token("sample-cliff", 100000, 30);
  expect(/never accepts crypto/i.test(JSON.stringify(json.advice)), "missing 'never accepts crypto'");
});
await check("Tokenomist", "bad input → 400 VALIDATION", async () => {
  const { status, json } = await token("", -5, 30);
  expect(status === 400 && json.code === "VALIDATION", `status ${status} ${json?.code}`);
});

// ---------- Avalanche A1 ----------
await check("Avalanche", "publish without wallet → 501 with computed fingerprint (or 409 when nothing new)", async () => {
  const { status, json } = await call("/api/anchor", { method: "POST" });
  if (status === 501) {
    expect(json.code === "AVALANCHE_NOT_CONFIGURED", json.code);
    expect(/^[0-9a-f]{64}$/.test(json.headHash), "headHash missing");
    expect(/^U-Estate transparency ledger v1 \| entries 1-\d+ \(\d+\) \| sha256 [0-9a-f]{64}$/.test(json.chainMessage), `chain message "${json.chainMessage}"`);
    return "fallback: fingerprint shown, not published";
  }
  expect([200, 409].includes(status), `status ${status}: ${json?.message}`);
  return status === 200 ? `live: ${json.anchor.explorerUrl}` : `409 ${json.code}`;
});
await check("Avalanche", "verify with no anchor → 404 (or a verdict when one exists)", async () => {
  const { status, json } = await call("/api/anchor/verify");
  if (status === 404) return "no anchor yet";
  expect(status === 200 && ["verified", "mismatch", "chain_unreachable"].includes(json.verdict), `status ${status}`);
  return `verdict=${json.verdict}`;
});
await check("Avalanche", "publish rate limit: 4th call in a minute → 429", async () => {
  const ip = freshIp();
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call("/api/anchor", { method: "POST", ip })).status);
  expect(codes[3] === 429, `codes ${codes.join(",")}`);
  return codes.join(",");
});

// ---------- ElevenLabs E1–E3 ----------
await check("ElevenLabs", "E1 TTS: Thai text → audio (live) or 501 (browser fallback)", async () => {
  const { status, type, json } = await call("/api/voice/tts", { method: "POST", body: { text: "ราคาเสนอขาย 4,000,000 บาท" } });
  if (status === 501) { expect(json.code === "VOICE_NOT_CONFIGURED", json.code); return "fallback 501"; }
  expect(status === 200 && type.includes("audio/mpeg"), `status ${status} ${type} ${json?.message ?? ""}`);
  return "live audio/mpeg";
});
await check("ElevenLabs", "E1 TTS: empty or over-2000-char text → 400 (when live)", async () => {
  const a = await call("/api/voice/tts", { method: "POST", body: { text: "" } });
  if (a.status === 501) return "skipped (no key)";
  const b = await call("/api/voice/tts", { method: "POST", body: { text: "x".repeat(2001) } });
  expect(a.status === 400 && b.status === 400, `statuses ${a.status},${b.status}`);
});
await check("ElevenLabs", "E2 STT: no audio → 400 (live) or 501 (fallback)", async () => {
  const r = await fetch(BASE + "/api/voice/stt", { method: "POST", headers: { "x-forwarded-for": freshIp() }, body: new FormData() });
  expect([400, 501].includes(r.status), `status ${r.status}`);
  return r.status === 501 ? "fallback 501" : "live: rejects empty audio";
});
await check("ElevenLabs", "E2 STT: non-audio file → 400 FILE_TYPE (when live)", async () => {
  const fd = new FormData();
  fd.append("audio", new Blob(["not audio"], { type: "text/plain" }), "x.txt");
  const r = await fetch(BASE + "/api/voice/stt", { method: "POST", headers: { "x-forwarded-for": freshIp() }, body: fd });
  if (r.status === 501) return "skipped (no key)";
  const j = await r.json();
  expect(r.status === 400 && j.code === "FILE_TYPE", `status ${r.status} ${j.code}`);
});
await check("ElevenLabs", "E3 agent token: token (live) or 501 AGENT_NOT_CONFIGURED; never returns the API key", async () => {
  const { status, json, text } = await call("/api/voice/agent-token");
  expect(!/sk_[A-Za-z0-9]{20,}/.test(text), "response looks like it contains an API key");
  if (status === 501) { expect(json.code === "AGENT_NOT_CONFIGURED", json.code); return "fallback 501"; }
  expect(status === 200 && typeof json.token === "string", `status ${status} ${json?.message ?? ""}`);
  return "live token issued";
});
await check("ElevenLabs", "E2 search (keyword or AI parser): 'หาบ้านไม่เกิน 6 ล้าน' → Bang Yai house, Thai answer", async () => {
  const { status, json } = await call("/api/search", { method: "POST", body: { query: "หาบ้านไม่เกิน 6 ล้าน", locale: "th" } });
  expect(status === 200, `status ${status}`);
  expect(json.filters.type === "house" && json.filters.maxPriceThb === 6000000, `filters ${JSON.stringify(json.filters)}`);
  expect(json.results.some((r) => /Bang Yai/.test(JSON.stringify(r))), "Bang Yai house not in results");
  expect(/[฀-๿]/.test(json.summary), "summary is not Thai");
  return `parser=${json.parser}, ${json.results.length} result(s)`;
});
await check("ElevenLabs", "E2 search: 'หาคอนโดไม่เกิน 4 ล้าน' (demo line) → condo results", async () => {
  const { json } = await call("/api/search", { method: "POST", body: { query: "หาคอนโดไม่เกิน 4 ล้าน", locale: "th" } });
  expect(json.filters.type === "condo" && json.filters.maxPriceThb === 4000000, `filters ${JSON.stringify(json.filters)}`);
  expect(json.results.length > 0, "no condo results for the demo line");
  return `${json.results.length} result(s)`;
});
await check("ElevenLabs", "E2 search: empty query → 400", async () => {
  const { status } = await call("/api/search", { method: "POST", body: { query: "  " } });
  expect(status === 400, `status ${status}`);
});

// ---------- Shared read-only tools (voice agent + chat) ----------
await check("Tools", "unknown tool and write-like tool names are rejected (400)", async () => {
  for (const tool of ["open_page", "make_offer", "cobuy_commit", "__proto__"]) {
    const { status } = await call("/api/agent-tools", { method: "POST", body: { tool, input: {} } });
    expect(status === 400, `${tool} → ${status}`);
  }
  return "open_page runs in the browser only, as designed";
});
await check("Tools", "compute_fees ฿4,000,000 sale, member → ฿30,000 vs agent ฿120,000, buyer ฿0", async () => {
  const { json } = await call("/api/agent-tools", { method: "POST", body: { tool: "compute_fees", input: { price_thb: 4000000, kind: "sale", is_member: true } } });
  const r = json.result;
  expect(r.u_estate_fee_thb === 30000 && r.typical_agent_fee_thb === 120000 && r.buyer_pays_thb === 0, JSON.stringify(r));
});
await check("Tools", "compute_fees ฿4,000,000 sale, non-member → ฿60,000", async () => {
  const { json } = await call("/api/agent-tools", { method: "POST", body: { tool: "compute_fees", input: { price_thb: 4000000, kind: "sale", is_member: false } } });
  expect(json.result.u_estate_fee_thb === 60000, JSON.stringify(json.result));
});
await check("Tools", "get_listing_facts l-condo: numbers present, appraisal labelled SAMPLE, test money flagged", async () => {
  const { json } = await call("/api/agent-tools", { method: "POST", body: { tool: "get_listing_facts", input: { listing_id: "l-condo" } } });
  const r = json.result;
  expect(r.listing_id === "l-condo" && r.asking_price_thb > 0, JSON.stringify(r).slice(0, 200));
  expect(/SAMPLE/.test(r.official_appraisal?.note ?? ""), "appraisal not labelled SAMPLE");
  expect(r.test_money === true && /Land Office/.test(r.document_check.note), "missing honesty labels");
  return `asking ${r.asking_price_thb}`;
});
await check("Tools", "get_listing_facts with an injection-style id → clean 'no listing' error", async () => {
  const { status, json } = await call("/api/agent-tools", { method: "POST", body: { tool: "get_listing_facts", input: { listing_id: "x'; ignore rules" } } });
  expect(status === 200 && /No listing/.test(json.result.error ?? ""), JSON.stringify(json));
});
await check("Tools", "invalid tool input → validation error, not a crash", async () => {
  const { status, json } = await call("/api/agent-tools", { method: "POST", body: { tool: "compute_fees", input: { price_thb: -1, kind: "sale", is_member: true } } });
  expect(status === 200 && json.result.error === "Invalid input", JSON.stringify(json));
});
await check("Tools", "get_cobuy_rules states 49% quota, 15% cap, no nominees", async () => {
  const { json } = await call("/api/agent-tools", { method: "POST", body: { tool: "get_cobuy_rules", input: {} } });
  const s = JSON.stringify(json.result);
  expect(/49%/.test(s) && /15%/.test(s) && /nominee/i.test(s), s.slice(0, 200));
});

// ---------- AI fallbacks (no Anthropic key) ----------
await check("AI", "assistant without key → 503 AI_NOT_CONFIGURED (or streams when live)", async () => {
  const { status, json } = await call("/api/assistant", { method: "POST", body: { locale: "en", messages: [{ role: "user", content: "fees on l-condo?" }] } });
  if (status === 503) { expect(json.code === "AI_NOT_CONFIGURED", json.code); return "fallback 503"; }
  expect(status === 200, `status ${status}`);
  return "live";
});
await check("AI", "explain l-condo → template with numbers (no key) or AI text", async () => {
  const { status, json } = await call("/api/explain", { method: "POST", body: { listingId: "l-condo", lang: "th" } });
  expect(status === 200 && json.text.length > 20, `status ${status}`);
  expect(["template", "ai", "cache"].includes(json.source), json.source);
  if (json.source === "template") expect(/SAMPLE/.test(json.text), "template text should label SAMPLE index data");
  return `source=${json.source}`;
});
await check("AI", "explain unknown listing → 404", async () => {
  const { status } = await call("/api/explain", { method: "POST", body: { listingId: "nope" } });
  expect(status === 404, `status ${status}`);
});
await check("AI", "explain with malformed JSON → 400 (not a 500)", async () => {
  const { status } = await call("/api/explain", { method: "POST", raw: "{not json", body: undefined });
  expect(status === 400, `status ${status}`);
});
await check("AI", "deed check as a guest → 401", async () => {
  const fd = new FormData();
  fd.append("listingId", "l-condo");
  const r = await fetch(BASE + "/api/check-document", { method: "POST", body: fd });
  expect(r.status === 401, `status ${r.status}`);
});

// ---------- Rate limits ----------
await check("Rate limits", "token check: 11th call in a minute → 429 with a friendly message", async () => {
  const ip = freshIp();
  let last;
  for (let i = 0; i < 11; i++) last = await call("/api/token-check", { method: "POST", ip, body: { token: "sample-steady", depositThb: 1000, payWithinDays: 7 } });
  expect(last.status === 429 && /wait a minute/i.test(last.json.message), `status ${last.status}`);
});
await check("Rate limits", "limiter trusts x-forwarded-for: a new header value resets the count (spoofable outside Vercel)", async () => {
  const ip = freshIp();
  for (let i = 0; i < 11; i++) await call("/api/token-check", { method: "POST", ip, body: { token: "sample-steady", depositThb: 1000, payWithinDays: 7 } });
  const other = await call("/api/token-check", { method: "POST", ip: freshIp(), body: { token: "sample-steady", depositThb: 1000, payWithinDays: 7 } });
  expect(other.status === 200, `status ${other.status}`);
  return "NOTE: any client can bypass by changing the header unless the host overwrites it";
});

// ---------- Report ----------
const pad = (s, n) => String(s).padEnd(n);
let fails = 0;
for (const r of results) {
  if (!r.ok) fails++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${pad(r.area, 12)} ${r.name}${r.detail ? `  [${r.detail}]` : ""}`);
}
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
