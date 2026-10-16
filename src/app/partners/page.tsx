import { Text } from "@/i18n/Text";
import Link from "next/link";
import { partnerStatus } from "@/lib/partners";
import { anchorWalletAddress } from "@/lib/avalanche";
import { readDb } from "@/lib/store";
import { Card } from "@/components/ui";
import { getTranslations } from "@/i18n/server";
import { SLOT, withSlot } from "@/i18n/slot";
import type { MessageKey } from "@/i18n";

export const metadata = { title: "Partners and data | U-Estate" };

function Live({ on, labels }: { on: boolean; labels: { live: string; off: string } }) {
  return on ? (
    <span className="rounded-full bg-teal-soft px-3 py-1 text-sm font-semibold text-teal"><span aria-hidden="true">●</span> {labels.live}</span>
  ) : (
    <span className="rounded-full bg-amber-soft px-3 py-1 text-sm font-semibold text-amber"><span aria-hidden="true">○</span> {labels.off}</span>
  );
}

// D-36: honest partner status + exactly what data goes to each partner (transparency for every party).
export default async function PartnersPage() {
  const s = partnerStatus();
  const [db, t] = await Promise.all([readDb(), getTranslations()]);
  const latest = db.anchors.at(-1);
  const wallet = anchorWalletAddress();

  const rows: { partner: string; feature: MessageKey; live: boolean; where: MessageKey; sends: MessageKey }[] = [
    { partner: "ElevenLabs", feature: "E1 · Listen to explanations (5 languages)", live: s.elevenlabsTts, where: "Listing page → Explain this price → Listen; chat answers", sends: "The explanation text only." },
    { partner: "ElevenLabs", feature: "E2 · Voice search (Scribe speech-to-text)", live: s.elevenlabsStt, where: "Home → Speak", sends: "Your voice recording for that one request. We don't store it." },
    { partner: "ElevenLabs", feature: "E3 · Live voice conversation (Agents)", live: s.elevenlabsAgent, where: "Talk to U-Estate (every page)", sends: "Your voice, your display name, the page you're on, and read-only tool results (listing facts, fees)." },
    { partner: "Tokenomist", feature: "T1 · Can my crypto fund this deposit?", live: s.tokenomist, where: "Co-buy group and offer room → Paying with crypto?", sends: "Only the token name you type. Never your identity or amounts." },
    { partner: "Avalanche", feature: "A1 · Tamper check for the ledger", live: s.avalanche, where: "Transparency ledger → Publish / Verify", sends: "Only a SHA-256 fingerprint of the ledger. No names, no amounts, no tokens." },
    { partner: "Anthropic (Claude)", feature: "Deed check, explanations, chat, search parsing", live: s.claude, where: "Sell, listing, Ask AI, voice search", sends: "The deed photo you upload, listing facts and your questions." },
  ];
  const liveLabels = { live: t("Live"), off: t("Not connected (fallback shown)") };

  return (
    <article className="grid gap-5">
      <header>
        <h1 className="text-3xl font-bold"><Text message="Partners and your data" /></h1>
        <p className="mt-1 max-w-3xl text-ink-soft">
          {t("U-Estate is built on transparency, so we show which partner services are live on this server and exactly what we send to each one. When a partner isn't connected, the app shows a clearly labelled fallback instead of pretending.")}
        </p>
      </header>

      <section className="integration-grid">
        {rows.map(r => <article key={r.feature} className="integration-card"><div className="integration-monogram" aria-hidden="true">{r.partner === "ElevenLabs" ? "II" : r.partner.slice(0,1)}</div><h2>{r.partner}</h2><p className="mt-2 text-sm text-muted">{t(r.feature)}</p><div className="my-5"><Live on={r.live} labels={liveLabels} /></div><details><summary><Text message="integrationDetails" /></summary><p className="mt-4 text-sm">{t(r.where)}</p><h3 className="mt-4 text-sm font-semibold"><Text message="sharedData" /></h3><p className="mt-2 text-sm text-muted">{t(r.sends)}</p></details></article>)}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <h2 className="text-xl font-bold">ElevenLabs</h2>
          <p className="mt-1 text-sm">{t("Voice in Thai, Arabic, Chinese, Spanish and English, so people who struggle with property paperwork can listen and talk instead of reading.")}</p>
          <p className="mt-2 text-sm"><Link href="/assistant" className="underline">{t("Try the typed chat")}</Link> · {withSlot(t("press {voice} for voice.", { voice: SLOT }), <strong>{t("Talk to U-Estate")}</strong>)}</p>
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Tokenomist</h2>
          <p className="mt-1 text-sm">{t("Many U-topia members hold crypto. Before they sell a token for a deposit, we show upcoming token unlocks that could lower its price, and a safety buffer. Risk information, not investment advice.")}</p>
          <p className="mt-2 text-xs text-ink-soft">{t("Without a Tokenomist key, three clearly labelled SAMPLE tokens are available.")}</p>
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Avalanche</h2>
          <p className="mt-1 text-sm">{t("The ledger's fingerprint is published on the Avalanche Fuji test network, so anyone can check our records were not edited later.")}</p>
          <p className="mt-2 text-xs text-ink-soft">
            {latest ? <>{t("Last published")}: <a className="underline" href={latest.explorerUrl} target="_blank" rel="noreferrer">{t("transaction ↗")}</a></> : t("Nothing published yet.")}
            {wallet && <> · {t("Publishing address")} <span dir="ltr">{wallet.slice(0, 8)}…{wallet.slice(-4)}</span></>}
          </p>
          <p className="mt-2 text-sm"><Link href="/ledger" className="underline">{t("Open the ledger")}</Link></p>
        </Card>
      </div>
      <p className="text-sm text-ink-soft">{t("U-topia's U-Bot: slot reserved; we will connect it when the organisers share the API. Nothing is faked before then.")}</p>
    </article>
  );
}
