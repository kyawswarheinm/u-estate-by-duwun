# Person 2 test results: AI, partners and interface

**Run:** 16 Oct 2026, local dev server (JSON store), **no partner keys loaded** (ElevenLabs, Tokenomist, Avalanche and Anthropic all in fallback mode).
**Scripts:**
- `node tests/partner-api.check.mjs [baseUrl]`: API checks, **33/34**
- `python -X utf8 tests/ui_check.py <baseUrl> <outDir>`: browser checks at 1280 px and 360 px, **144/152**

## Status per test area

| Priority | Area | Status | Notes |
|---|---|---|---|
| P0 | Deed extraction | ⏳ Blocked | Needs `ANTHROPIC_API_KEY`. Without it: guest → 401 ✅ |
| P0 | Typed assistant (10 questions) | ⏳ Blocked | Needs `ANTHROPIC_API_KEY`. Without it: 503 `AI_NOT_CONFIGURED` ✅ |
| P0 | AI boundaries and failures | 🟡 Partial | Missing-key paths ✅, rate limits ✅, read-only tool layer rejects write-like tools ✅. Prompt injection, refusal and timeout need the key |
| P0 | ElevenLabs E1/E2/E3 | 🟡 Fallbacks only | All three return labelled 501 fallbacks ✅. Mic denied → "Microphone permission was not given. You can type instead." ✅. Typed Thai search finds the Bang Yai house ✅. Live tests wait for the key in the server's `.env.local` |
| P0 | Tokenomist | ✅ Samples pass | `sample-cliff` High (฿400k/30 d → hold ฿600k; ฿1M/14 d → hold ฿1.5M), `sample-drip` Low/Medium, `sample-steady` Low, a real token → **Unknown** + "not connected". UI at 360 px as Daniel shows High + SAMPLE DATA + "never accepts crypto". Live tokens need a key |
| P0 | Avalanche | 🟡 Partial | Unit tests: tamper detection, old anchors stay verifiable ✅. API: empty ledger → 409, no anchor → 404, rate limit → 429 ✅. Publish → explorer → verify needs a throwaway Fuji wallet |
| P0 | Translation and RTL | ❌ Not built | No `src/i18n/` yet (T18). `<html lang="en">` is fixed; an `ar` locale cookie does not switch to `dir="rtl"` |
| P0 | Mobile and accessibility | 🟡 Mostly pass | 9 pages: no console errors, no horizontal scroll at 360 px, landmarks, labelled inputs, named buttons, image alts, visible focus ✅. Failures below |
| P0 when built | Valuation, stress test, scam rules | ⏳ Not built | T07, T13, T14 |

## Failures to fix (by demo impact)

| # | Finding | Where | Owner |
|---|---|---|---|
| 1 | Arabic/RTL not implemented: no dictionaries, `lang`/`dir` never change | `src/app/layout.tsx`, `src/i18n/` (T18) | Core team |
| 2 | Voice dock is a plain `<section>`: **Esc does not close it** and focus is not trapped or returned (UI_SPEC §6) | `src/components/VoiceAgentDock.tsx` (T33) | Core team |
| 3 | Listing pages lack "Confirm ownership at the Land Office" (UI_SPEC §7). It appears only in tool output | `/listing/[id]` | Core team (UI) |
| 4 | `/api/explain` returns **500** on malformed JSON (`await req.json()` without a catch); should be 400 | `src/app/api/explain/route.ts:13` | Core team |
| 5 | Language `<select>` is 42 px tall at 360 px (target ≥ 44 px) on `/`, listings, `/assistant` | `LocaleSelect` / `ExplainVoice` / `VoiceSearch` | Core team |
| 6 | Rate limiter keys on `x-forwarded-for`, so a client can reset its count by changing the header unless the host overwrites it. Check on Vercel; prefer a platform-provided IP | `src/lib/ratelimit.ts` | Core team (security) |

## Still to run when access exists

- **ElevenLabs key in the server's `.env.local`:** rerun both scripts (they switch to live expectations). Then by hand: Thai TTS by ear, voice search by microphone, and the live agent in EN/TH/AR then ZH/ES (needs `ELEVENLABS_AGENT_ID` from `scripts/create-voice-agent.mjs`).
- **Anthropic key:** 4 sample deeds + a non-deed image, the 10 assistant questions, prompt-injection listing text, refusal and timeout.
- **Tokenomist key:** 3 live tokens (e.g. `arbitrum`); without forward data the level must be Unknown.
- **Fuji wallet:** publish → explorer → verify, then add a ledger entry and verify the old anchor again.
