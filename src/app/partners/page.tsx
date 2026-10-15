import Link from "next/link";
import { partnerStatus } from "@/lib/partners";
import { anchorWalletAddress } from "@/lib/avalanche";
import { readDb } from "@/lib/store";
import { Card } from "@/components/ui";

export const metadata = { title: "Partners and data | U-Estate" };

function Live({ on, off = "Not connected (fallback shown)" }: { on: boolean; off?: string }) {
  return on ? (
    <span className="rounded-full bg-teal-soft px-3 py-1 text-sm font-semibold text-teal"><span aria-hidden="true">●</span> Live</span>
  ) : (
    <span className="rounded-full bg-amber-soft px-3 py-1 text-sm font-semibold text-amber"><span aria-hidden="true">○</span> {off}</span>
  );
}

// D-36: honest partner status + exactly what data goes to each partner (transparency for every party).
export default async function PartnersPage() {
  const s = partnerStatus();
  const db = await readDb();
  const latest = db.anchors.at(-1);
  const wallet = anchorWalletAddress();

  const rows = [
    {
      partner: "ElevenLabs", feature: "E1 · Listen to explanations (5 languages)", live: s.elevenlabsTts, where: "Listing page → Explain this price → Listen; chat answers",
      sends: "The explanation text only.",
    },
    {
      partner: "ElevenLabs", feature: "E2 · Voice search (Scribe speech-to-text)", live: s.elevenlabsStt, where: "Home → Speak",
      sends: "Your voice recording for that one request. We don't store it.",
    },
    {
      partner: "ElevenLabs", feature: "E3 · Live voice conversation (Agents)", live: s.elevenlabsAgent, where: "Talk to U-Estate (every page)",
      sends: "Your voice, your display name, the page you're on, and read-only tool results (listing facts, fees).",
    },
    {
      partner: "Tokenomist", feature: "T1 · Can my crypto fund this deposit?", live: s.tokenomist, where: "Co-buy group and offer room → Paying with crypto?",
      sends: "Only the token name you type. Never your identity or amounts.",
    },
    {
      partner: "Avalanche", feature: "A1 · Tamper check for the ledger", live: s.avalanche, where: "Transparency ledger → Publish / Verify",
      sends: "Only a SHA-256 fingerprint of the ledger. No names, no amounts, no tokens.",
    },
    {
      partner: "Anthropic (Claude)", feature: "Deed check, explanations, chat, search parsing", live: s.claude, where: "Sell, listing, Ask AI, voice search",
      sends: "The deed photo you upload, listing facts and your questions.",
    },
  ];

  return (
    <article className="grid gap-5">
      <header>
        <h1 className="text-3xl font-bold">Partners and your data</h1>
        <p className="mt-1 max-w-3xl text-ink-soft">
          U-Estate is built on transparency, so we show which partner services are live on this server and exactly what we send to each one.
          When a partner isn&apos;t connected, the app shows a clearly labelled fallback instead of pretending.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">Partner integrations, status and data shared</caption>
          <thead><tr className="border-b border-line"><th scope="col" className="py-2">Partner</th><th scope="col">Feature</th><th scope="col">Status</th><th scope="col">Where</th><th scope="col">What we send</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.feature} className="border-b border-line align-top">
                <th scope="row" className="py-2">{r.partner}</th>
                <td>{r.feature}</td>
                <td><Live on={r.live} /></td>
                <td>{r.where}</td>
                <td>{r.sends}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <h2 className="text-xl font-bold">ElevenLabs</h2>
          <p className="mt-1 text-sm">Voice in Thai, Arabic, Chinese, Spanish and English, so people who struggle with property paperwork can listen and talk instead of reading.</p>
          <p className="mt-2 text-sm"><Link href="/assistant" className="underline">Try the typed chat</Link> · press <strong>Talk to U-Estate</strong> for voice.</p>
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Tokenomist</h2>
          <p className="mt-1 text-sm">Many U-topia members hold crypto. Before they sell a token for a deposit, we show upcoming token unlocks that could lower its price, and a safety buffer. Risk information, not investment advice.</p>
          <p className="mt-2 text-xs text-ink-soft">Without a Tokenomist key, three clearly labelled SAMPLE tokens are available.</p>
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Avalanche</h2>
          <p className="mt-1 text-sm">The ledger&apos;s fingerprint is published on the Avalanche Fuji test network, so anyone can check our records were not edited later.</p>
          <p className="mt-2 text-xs text-ink-soft">
            {latest ? <>Last published: <a className="underline" href={latest.explorerUrl} target="_blank" rel="noreferrer">transaction ↗</a></> : "Nothing published yet."}
            {wallet && <> · Publishing address {wallet.slice(0, 8)}…{wallet.slice(-4)}</>}
          </p>
          <p className="mt-2 text-sm"><Link href="/ledger" className="underline">Open the ledger</Link></p>
        </Card>
      </div>
      <p className="text-sm text-ink-soft">U-topia&apos;s U-Bot: slot reserved; we will connect it when the organisers share the API. Nothing is faked before then.</p>
    </article>
  );
}
