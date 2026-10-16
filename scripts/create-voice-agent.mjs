// E3 setup: creates the U-Estate voice agent and its 10 client tools in ElevenLabs, then prints ELEVENLABS_AGENT_ID.
// Usage (key read from .env.local, never typed): node --env-file=.env.local scripts/create-voice-agent.mjs
// The API key needs the "ElevenLabs Agents" permission set to Write.
// Optional ELEVENLABS_AGENT_VOICE_ID: the agent's voice. On a free plan use a premade voice (library voices fail).
// If the API rejects a field, create the agent in the dashboard with the same text: see docs/PARTNERS.md §E3.
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("Set ELEVENLABS_API_KEY first.");
  process.exit(1);
}
const API = "https://api.elevenlabs.io/v1";

const str = (description) => ({ type: "string", description });
const num = (description) => ({ type: "number", description });
const bool = (description) => ({ type: "boolean", description });

// Names and parameters must match src/lib/assistant-tools.ts and src/components/VoiceAgentDock.tsx.
const TOOLS = [
  {
    name: "search_listings",
    description: "Search active U-Estate listings in Thailand. Use for any request to find a home. Returns at most 5 listings with IDs and links.",
    parameters: {
      type: "object",
      required: [],
      properties: {
        query: str("The user's request in their own words"),
        type: str("condo, house, land, townhouse or building"),
        kind: str("sale or rent"),
        maxPriceThb: num("Budget ceiling in Thai baht, e.g. 4000000"),
        minSizeSqm: num("Minimum size in square metres"),
        district: str("District name, e.g. Sathorn"),
        cobuy: bool("True if the user wants to buy together with others"),
      },
    },
  },
  {
    name: "get_listing_facts",
    description: "Get facts for one listing: asking price, official appraisal with source and date, estimate range, risks, fees, document check, co-buy and foreign quota.",
    parameters: { type: "object", required: ["listing_id"], properties: { listing_id: str("Listing ID such as l-condo") } },
  },
  {
    name: "compute_fees",
    description: "Compute U-Estate's fee for a sale or rental compared with a typical agent. Buyers and tenants pay 0.",
    parameters: {
      type: "object",
      required: ["price_thb", "kind", "is_member"],
      properties: { price_thb: num("Sale price, or monthly rent, in THB"), kind: str("sale or rent"), is_member: bool("True for U-topia members") },
    },
  },
  {
    name: "check_token_unlocks",
    description: "Check if selling a crypto token to pay a property deposit is risky because of upcoming token unlocks (Tokenomist data). U-Estate never accepts crypto.",
    parameters: {
      type: "object",
      required: ["token", "deposit_thb", "pay_within_days"],
      properties: {
        token: str("Token name, symbol or ID, e.g. arbitrum, or sample-cliff for the demo"),
        deposit_thb: num("THB amount the user needs from selling the token"),
        pay_within_days: num("Days until the user must pay"),
      },
    },
  },
  {
    name: "get_cobuy_rules",
    description: "Get co-buy rules: members only, legal lanes for foreigners (condo co-ownership within the 49% quota, or lender at a fixed rate up to 15%), governance.",
    parameters: { type: "object", required: [], properties: {} },
  },
  {
    name: "open_page",
    description: "Open a page in the user's browser, e.g. /listing/l-condo, /listing/l-condo/offers, /cobuy/<group id>, /ledger, /partners, /market (the market map). Use after you mention a listing or the market the user wants to see.",
    parameters: { type: "object", required: ["path"], properties: { path: str("Path starting with /") } },
  },
  // Market intelligence (D-42). Parameters mirror the zod schemas in src/lib/market-data/find.ts and analytics.ts.
  {
    name: "search_market_listings",
    description: "Search EXTERNAL listings copied from other property websites (not U-Estate listings, not checked by U-Estate). Each has its site, source link and date. Use search_listings first for U-Estate's own listings. Set kind, or sale prices and monthly rents are mixed.",
    parameters: {
      type: "object",
      required: [],
      properties: {
        type: str("condo, house, townhouse or land"),
        kind: str("sale or rent"),
        district: str("English district name, e.g. Sathorn"),
        maxPriceThb: num("Sale price ceiling, or monthly rent ceiling when kind is rent, in THB"),
        minSizeSqm: num("Minimum size in square metres"),
        near: {
          type: "object",
          description: "Only listings within radiusKm of this point",
          required: ["lat", "lng"],
          properties: { lat: num("Latitude"), lng: num("Longitude"), radiusKm: num("Radius in km, default 3, at most 50") },
        },
        limit: num("How many results, 1 to 20, default 5"),
      },
    },
  },
  {
    name: "get_market_stats",
    description: "Asking-price statistics from listing websites for a property type and district: median, 25th and 75th percentile price per m², median price, median size, number of listings. Asking prices, not sale prices.",
    parameters: {
      type: "object",
      required: ["type"],
      properties: { type: str("condo, house, townhouse or land"), kind: str("sale or rent, default sale"), district: str("District name, e.g. Sathorn. Leave out for every district") },
    },
  },
  {
    name: "get_price_forecast",
    description: "Price-index forecast for a property type: the 80% range (p10 to p90) and central value months ahead, with the model and index source. A forecast, never a guarantee.",
    parameters: { type: "object", required: ["type"], properties: { type: str("condo, house, townhouse or land"), months_ahead: num("Months ahead, 1 to 24, default 12") } },
  },
  {
    name: "compare_to_market",
    description: "Compare one U-Estate listing's asking price per m² with asking prices on listing websites in its district: the median, the difference in % and how many listings were compared.",
    parameters: { type: "object", required: ["listing_id"], properties: { listing_id: str("A U-Estate listing id or code, e.g. l-condo") } },
  },
];

const PROMPT = `You are U-Estate's voice assistant: a transparent property marketplace in Thailand where every party sees the same facts and fees.
You are talking with {{user_name}}. They are on the page {{current_page}}. Speak {{locale_name}} unless they switch language.
Rules:
- Use tools for every number (prices, fees, ranges, quotas, unlocks). Say numbers exactly as the tools return them, with their source. Never invent numbers.
- Keep each reply under 3 short sentences; this is a voice call. Offer to open the page when you mention a listing.
- Say clearly when data is SAMPLE or test money. Ownership must be confirmed at the Land Office.
- General information only, not financial, legal or investment advice.
- Foreigners: condos only, within the 49% foreign quota, funds from abroad with an FET form; on houses and land they can only lend at a fixed rate of at most 15% a year. Never suggest nominee arrangements.
- U-Estate never accepts crypto. If someone will sell crypto for a deposit, use check_token_unlocks and explain the safety buffer.
- You cannot move money, make offers or sign anything. Tell the user to use the buttons on the page.
- Never ask for passwords, bank details or ID numbers. Warn the user if anyone asks them to pay a deposit outside U-Estate.
Market questions (search_market_listings, get_market_stats, get_price_forecast, compare_to_market):
- Mention U-Estate listings first (search_listings); other websites' listings only after them, or when asked about the wider market.
- Say other websites' listings are "not checked by U-Estate", name the site and the date, and offer the source link on screen. Never call them U-Estate listings.
- Call market prices "asking prices on listing websites", never sale prices.
- Say a forecast as its range, from low to high, with the model and its source, and say it is a forecast, not a guarantee.
- When a result has is_sample true, say it is SAMPLE data. Offer to open the market map at /market.`;

async function post(path, body) {
  const r = await fetch(`${API}${path}`, { method: "POST", headers: { "xi-api-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

const toolIds = [];
for (const t of TOOLS) {
  const res = await post("/convai/tools", { tool_config: { type: "client", ...t, expects_response: true, response_timeout_secs: 20 } });
  toolIds.push(res.id);
  console.log(`tool ${t.name} → ${res.id}`);
}

const agent = {
  name: "U-Estate voice assistant (hackathon demo)",
  conversation_config: {
    agent: {
      first_message: "Hi {{user_name}}, I'm U-Estate's assistant. What kind of home are you looking for?",
      language: "en",
      prompt: { prompt: PROMPT, tool_ids: toolIds, temperature: 0.2 },
    },
    // Eleven v4 Turbo (the agents default) speaks Thai; Flash v2.5 and Multilingual v2 do not.
    tts: { model_id: "eleven_v4_turbo", ...(process.env.ELEVENLABS_AGENT_VOICE_ID ? { voice_id: process.env.ELEVENLABS_AGENT_VOICE_ID } : {}) },
  },
  platform_settings: {
    overrides: { conversation_config_override: { agent: { language: true, first_message: true } } },
  },
};

let created;
try {
  created = await post("/convai/agents/create", agent);
} catch (e) {
  console.warn(`Create with overrides failed (${e.message.split("\n")[0]}). Retrying without them; enable "Language" and "First message" overrides in the agent's Security tab.`);
  delete agent.platform_settings;
  created = await post("/convai/agents/create", agent);
}
console.log(`\nELEVENLABS_AGENT_ID=${created.agent_id}\nAdd it to .env.local, then restart npm run dev.`);
console.log("Dashboard check: Agent → Voice model supports Thai; Security → overrides for Language + First message are on.");
