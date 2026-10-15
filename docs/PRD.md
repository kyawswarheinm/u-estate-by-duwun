# PRD: U-Estate (live-demo MVP)

**Version:** 1.1, Thu 15 Oct 2026 (23:15: partner features E1–E3, T1, A1 and typed chat added; see [PARTNERS.md](PARTNERS.md)). **Deadline:** submission Fri 16 Oct 13:30 ICT; live finalist demo 20:00.
**Authority:** [DECISIONS.md](DECISIONS.md) > this PRD > other docs.

## 1. Vision

**A transparent, AI-guided Thai property marketplace.** Every party sees the same facts and fees:
- verified listings
- honest price ranges with sources
- downside risks shown before you commit
- offers compared by published rules
- legal co-buying for U-topia community members

**Tagline:** *Transparent property, for every party.*

## 2. Goals and success metrics (for the demo)

| ID | Goal | Measure |
|---|---|---|
| G1 | Everything shown live really works | 100% of demo-script steps run on the deployed app with real DB writes |
| G2 | Practical and legal | Every money or ownership step obeys rules R1–R12 (§7); no blockchain; test money labelled |
| G3 | AI does real work | 3 AI engines live; the Model Card shows measured metrics; AI never invents numbers |
| G4 | Usable by non-experts | Key flows work in EN/TH/AR/ZH-Hant/ES, on mobile width, and pass keyboard checks |
| G5 | Ecosystem fit | Co-buy members-only, U-topia member fee, U-Bot slot; **all three event partners do real work**: ElevenLabs voice (E1–E3), Tokenomist unlock check (T1), Avalanche ledger fingerprint (A1) |

## 3. Personas (seeded demo accounts in [DEMO_SCRIPT.md](DEMO_SCRIPT.md))

| Persona | Role(s) | Notes |
|---|---|---|
| Khun Malee | Seller, landlord | Thai; lists a condo and a house |
| Somchai | Buyer, co-buyer | Thai, U-topia member |
| Ploy | Co-buyer | Thai, U-topia member |
| Daniel | Co-buyer / lender | Australian, U-topia member |
| Aiko | Co-buyer | Japanese, U-topia member |
| Narin | Buyer, tenant | Thai, not a member |
| Layla | Buyer | Emirati, Arabic UI, U-topia member |
| Reviewer | Admin | Human review of flagged deeds and listings |

## 4. Scope

**P0 (must work live):** AUTH, LIST, DETAIL, VAL, RISK, DEED, OFFER, COBUY, MSG, ASSIST, LEDGER, I18N, **PARTNER** (E1, E2, E3, T1, A1: built in the prototype; they need keys to be live).
**P1 (if time allows):** MATCH quiz, VIEW (viewing requests), SAVE (saved + dashboard), RENT application, MARKET overview page, U-Bot drop-in. (The VOICE overlay is now P0 as E3.)
**Out (labelled "phase 2" where shown):**
- real payments or escrow
- real KYC
- Land Office lookups
- secondary trading
- licensed fund
- Thai-majority company lane
- crypto payments, tokens, NFTs, smart contracts or user wallets (the only chain use is the A1 fingerprint, D-33)

## 5. Functional requirements

Format: `ID: requirement → acceptance criteria`.

### Accounts (AUTH)

- **FR-AUTH-01:** Email + password sign-up and sign-in (Supabase Auth). → A new user can register, sign in and sign out. The session persists across reloads.
- **FR-AUTH-02:** Profile with name, nationality, `is_thai`, `utopia_member`, preferred locale and roles. → Editable on the profile page; used by the rules.
- **FR-AUTH-03:** Demo mode (`DEMO_MODE=true`): a "Sign in as…" panel lists the seeded accounts. → One click signs in as a persona. Hidden when demo mode is off.
- **FR-AUTH-04:** `utopia_member` can only be set by an admin (or seed). → Users can't make themselves members.
  - *Prototype exception (D-41):* a clearly labelled, demo-only "Link my U-topia membership" button for new accounts while `DEMO_MODE` is on.
- **FR-AUTH-05 (built in prototype, D-39):**
  - `/signup` takes name, any made-up email ("Any non-real email to demo, e.g. anythings@example.com"), a password of at least 8 characters, nationality and language.
  - Real inbox domains are refused. The password is stored only as a salted hash.
  - `/signin` signs back in with the same email and password. Wrong details show one generic message.
  - → Sign up as anythings@example.com, sign out, then sign in again: the same account and its listings are there.
- **FR-AUTH-06:** Guests can browse everything. Offers, co-buy, selling, deed checks and account pages ask them to sign in, then return them to the page they were on.

### Account (ACCOUNT), built in prototype

- **FR-ACCOUNT-01:** `/account` overview: properties listed, test money available, co-buy groups joined, and "Your properties".
- **FR-ACCOUNT-02:** **My properties** (`/account/properties`) shows each own listing with:
  - status and deed-check badge
  - offer room and offer count
  - co-buy status
  - actions: View, Check deed, Open offer room / Offers
- **FR-ACCOUNT-03:** **Account settings**:
  - display name, nationality (fixed for personas), preferred language
  - email (read-only)
  - change password: current + new + repeat; other sessions are signed out
  - U-topia membership status
  - sign out
- **FR-WALLET-01:** **Wallet** (`/account/wallet`, D-40):
  - available, committed and total test money
  - activity: grants, top-ups, and co-buy commitments linked to their groups
  - "Add test money" button
  - settings: payout preference and maximum single commitment
  - → A co-buy commit fails with a clear message when it exceeds the balance or the limit.
- **FR-SELL-01:** `/sell` (signed in): list a property for sale or rent.
  - Fields: type, title, district, province, size, price, year, deed type, optional appraisal, co-buy toggle.
  - Condo co-buy also asks for the building's floor areas, for the 49% quota.
  - The listing goes live immediately as "Not checked yet", and the owner sees an owner bar on the listing page.

### Listings (LIST)

- **FR-LIST-01:** Browse listings in cards (design: PropertyCard). Each card shows photo, price, size, price/m², fair-value badge (Good value / Fair / Overpriced / **Scam alert**), risk level and a transit line. → Filters for district, type, budget and sale/rent work.
- **FR-LIST-02:** A seller creates a listing: property type, location, size, floor, build year, asking price, sale/rent, photos (Storage), co-buy toggle. → It appears in browse; the owner can edit; status `active`.
- **FR-LIST-03:** States: loading, empty and error states as designed.

### Listing detail (DETAIL)

- **FR-DETAIL-01:** Gallery, facts, description with **AI translation banner** (show original), amenities, neighbourhood card, international-buyer guide for condos (quota status).
- **FR-DETAIL-02:** Sticky action panel: asking price (+ converted currency, "for reference"), fair-value badge, **Make an offer**, **Join a co-buy group** (D-24), Save, Ask AI.
- **FR-DETAIL-03:** "Who pays what" fee table (R1) with the typical-agent comparison.

### Valuation (VAL), predictive AI

- **FR-VAL-01:** Fair-value card: asking vs likely value vs difference, plus a low/likely/high range bar. → The numbers come from the valuation engine ([AI_SPEC.md](AI_SPEC.md) §2); data source and date shown.
- **FR-VAL-02:** Price forecast card with 1Y/3Y/5Y tabs showing central value and range. → Labelled "based on past index movement, not a guarantee".
- **FR-VAL-03:** "Why this price?" factors with real model contributions (e.g. near rail +x%).
- **FR-VAL-04:** Model Card page showing measured metrics (median error, % within ±10%, range coverage), dataset size and date, and a synthetic-data label when applicable (D-25).

### Risk (RISK), market-risk AI

- **FR-RISK-01:** Risk card with categories Financial / Neighbourhood / Building / Environmental: severity, evidence and "what to check next". "Data unavailable" is shown when unknown, never guessed.
- **FR-RISK-02:** **Downside stress test**: sliders or presets for price −10/−20/−30%, rent −x%, vacant months, interest +x pp. Shows equity, monthly cash flow and loss for a buyer or co-buy group, plus a plain-language AI explanation.
- **FR-RISK-03:** **Scam & manipulation detection.** Flags:
  - price far below fair value
  - duplicate photos
  - deed/owner mismatch
  - newly created seller with multiple high-value listings
  - off-platform payment requests in chat

  → A "Scam alert" badge with reasons appears on the card and detail page; the listing goes to the reviewer queue.
- **FR-RISK-04 (P1):** District market overview: median price/m², listing count, index trend and an AI summary.

### Deed check (DEED)

- **FR-DEED-01:** The seller uploads a deed photo (private Storage) → AI extraction → code checks → badge "Deed checked (sample)" / "Needs human review" with reasons. → Works on the 4 sample deeds; always says "confirm at the Land Office".
- **FR-DEED-02:** Reviewer queue lists flagged deeds and listings; the reviewer marks them reviewed with a note.

### FairOffer (OFFER)

- **FR-OFFER-01:** The seller publishes comparison weights **before** offers open (locked after publishing). Mode: sealed (MVP).
- **FR-OFFER-02:** Buyers submit or update one sealed offer each (price, funding readiness, closing days, conditions). Other buyers and the seller can't see amounts before close.
- **FR-OFFER-03:** The seller closes the round → code ranks by the weights → AI summary ("strongest offer may not be the highest") → accept / decline / counter (counter is P1). Accept writes to the ledger and notifies the others.

### Co-buy (COBUY)

- **FR-COBUY-01:** Members start or join a group on co-buy-enabled listings; commit test money; progress bar; quota meter for condos; FET notice; loan schedule for lenders; agreement summary (R9).
- **FR-COBUY-02:** All rules R2–R7 enforced server-side, with clear error messages.
- **FR-COBUY-03:** Fully funded → registered co-owner shares and loans written to the ledger (simulated registration).

### Messaging (MSG)

- **FR-MSG-01:** A buyer or tenant starts a conversation from a listing with the seller or landlord. → Messages arrive in real time (Supabase Realtime).
- **FR-MSG-02:** Each message stores the original text and language; the recipient sees an AI translation in their locale with "See original" and "AI translation: may contain errors".
- **FR-MSG-03:** Scam-phrase guard: messages asking for off-platform payment, deposits to personal accounts, or ID photos trigger a warning banner for the recipient (rules first, AI second).
- **FR-MSG-04:** Unread count in the header; conversation list page.

### Assistant (ASSIST)

- **FR-ASSIST-01:** "Ask U-Estate AI" panel on the detail page, plus a global assistant page. Answers questions using tools over our DB (search, listing facts, fees, risks, stress test). Every answer that uses numbers cites them as shown in the app.
- **FR-ASSIST-02:** It answers in the user's locale (any of the 5) and refuses financial or legal advice beyond general information.
- **FR-ASSIST-03 (P1):** Smart Match quiz (3 questions) → ranked matches with a one-line reason each.
- **FR-ASSIST-04:** Live voice conversation = E3 below (replaces the P1 voice overlay).
- **FR-ASSIST-05:** Typed real-time chat at `/assistant`: answers stream as they are written, show which tools were used, and use the same tools as the voice agent (D-36). → Built in the prototype (`/api/assistant`).

### Partner features (PARTNER), full spec in [PARTNERS.md](PARTNERS.md)

- **FR-VOICE-01 (E1):** Every AI explanation and chat answer can be heard in en/th/ar/zh-Hant/es (ElevenLabs Eleven v3), with a labelled browser-voice fallback. → Thai explanation plays with the ElevenLabs voice when the key is set.
- **FR-VOICE-02 (E2):** Voice search on Home: speak → Scribe transcript → filters (AI or keyword rules) → listings filtered by code → spoken answer written by code. → "หาบ้านไม่เกิน 6 ล้าน" returns the Bang Yai house and speaks it in Thai.
- **FR-VOICE-03 (E3):** *Talk to U-Estate* on every page: a live, interruptible voice conversation (ElevenLabs Agents) that searches, explains facts and fees, checks token unlocks and opens pages, while the session survives navigation. Read-only tools only. → One call per language; each tool used at least once without invented numbers.
- **FR-TOKEN-01 (T1):** "Paying with crypto?" check on the co-buy join card and the offer room: token + THB amount + days → risk level (R13), unlock table, safety buffer, "we never accept crypto". → `sample-cliff`, ฿400,000, 30 days shows **High** with the 4.2% unlock.
- **FR-ANCHOR-01 (A1):** The ledger shows a fingerprint per entry and a *Tamper check on Avalanche* panel: publish the head fingerprint to Fuji, link to the explorer, verify (recompute + read back). → Verify shows ✓ after publishing; editing an old entry makes it ✗ (unit-tested).
- **FR-PARTNERS-01:** `/partners` shows each partner's live/fallback status and exactly what data is sent to it (D-37).

### Ledger (LEDGER)

- **FR-LEDGER-01:** Public transparency ledger page: append-only entries (document check, offer submitted/accepted, commitments, co-owner shares, loans), each labelled simulated/test money.

### Internationalisation (I18N)

- **FR-I18N-01:** Locale switcher with EN/TH/AR/ZH-Hant/ES; `<html lang dir>`; Arabic is fully RTL.
- **FR-I18N-02:** Currency display switcher (THB base; USD/EUR/CNY/AED/JPY "≈ for reference"); m²/sq ft.
- **FR-I18N-03:** All UI strings come from dictionaries; machine-translated strings are marked for review.

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | Pages render in < 2 s on venue Wi-Fi; AI answers start streaming in < 3 s |
| NFR-02 | Mobile (≥ 360 px) and desktop layouts as designed; tap targets ≥ 44 px |
| NFR-03 | WCAG basics: labels, focus visible, colour + icon/text for status, `aria-live` for async results |
| NFR-04 | Security: RLS on every table; secrets only on the server; private Storage bucket for deeds; rate-limit AI and partner routes; the voice agent gets a one-conversation token, never the API key |
| NFR-05 | Honesty: every AI number has a source and date; "estimate / not financial advice" labels; synthetic and test data labelled |
| NFR-06 | Resilience for the live demo: cached fallbacks for AI outputs and a pre-recorded backup video |

## 7. Business rules (implemented in `src/lib/rules.ts`, never by AI)

| Rule | Description |
|---|---|
| R1 | Fees: 1.5% / 0.75% member sale; rental 50% / 25% of one month; buyer and tenant ฿0 |
| R2 | Co-buy members only |
| R3 | Group of 2–10; no over-commit |
| R4 | Foreigners can't co-own land, only lend |
| R5 | Condo foreign quota ≤ 49% of floor area |
| R6 | FET notice for foreign condo co-owners |
| R7 | Lender rate 0 < r ≤ 15%, no equity or price-rise share |
| R8 | Ledger is append-only, registered rights only, simulated flag |
| R9 | Governance text |
| R10 | FairOffer: weights locked, sealed, code ranks, seller decides |
| R11 | Scam rules (thresholds in [AI_SPEC.md](AI_SPEC.md) §4.2) |
| R12 | Stress-test maths (in [AI_SPEC.md](AI_SPEC.md) §4.1) |
| R13 | Token-unlock risk: window = today → payment + 7 days; high ≥ 5% of market cap in the window or one unlock ≥ 3%; medium ≥ 1%; unknown without forward data; buffer 15/30/50% ([PARTNERS.md](PARTNERS.md) §3) |
| R14 | Ledger fingerprint: sha256 hash chain; only the head hash goes on-chain (Fuji); sealed offer amounts never appear on the public ledger |

## 8. Edge cases to handle

- A listing has no previous sale or comparables → the valuation shows "Not enough data", no badge.
- A seller tries to bid on their own listing → rejected.
- Two users commit at the same moment over the target → a DB transaction or constraint rejects the second.
- A user switches locale mid-conversation → messages re-render in the new locale; originals are unchanged.
- An Arabic user views Thai numbers → numbers stay in Western digits; layout is RTL.
- The AI API is down → template text plus a "AI unavailable" note; rules still work.
- A deed image isn't a deed → "unknown" type → needs review.
- The microphone is blocked → the voice features explain why; typing works everywhere.
- A token isn't tracked, or the data plan has no future unlocks → level **Unknown** with the reason, never "Low".
- The Avalanche wallet has no test AVAX → the fingerprint is still shown; the message says to use the faucet.
