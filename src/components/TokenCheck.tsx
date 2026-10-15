"use client";
import { Text } from "@/i18n/Text";

import { useState } from "react";
import type { TokenFundingResult } from "@/lib/token-risk";

type Answer = {
  token: string | { id: string; name: string; symbol: string; source: string; is_sample: boolean };
  result: TokenFundingResult;
  note?: string;
  advice: string[];
};

const LEVEL = {
  low: { icon: "✓", text: "Low unlock risk", cls: "bg-teal-soft text-teal" },
  medium: { icon: "!", text: "Medium unlock risk", cls: "bg-amber-soft text-amber" },
  high: { icon: "!!", text: "High unlock risk", cls: "bg-red-soft text-red" },
  unknown: { icon: "?", text: "Unknown: no unlock data", cls: "bg-mist text-ink" },
} as const;

const thb = (n: number) => `฿${Math.round(n).toLocaleString("en-US")}`;

// T1: "Paying with crypto? Check the token first." Data from Tokenomist; the level is computed by code.
export function TokenCheck({ defaultDepositThb, payWithinDays, context }: { defaultDepositThb: number; payWithinDays: number; context: string }) {
  const [token, setToken] = useState("");
  const [deposit, setDeposit] = useState(String(defaultDepositThb));
  const [days, setDays] = useState(String(payWithinDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/token-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, depositThb: Number(deposit.replace(/[,฿\s]/g, "")), payWithinDays: Number(days) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      setAnswer(j as Answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed.");
    } finally {
      setBusy(false);
    }
  }

  const t = answer && typeof answer.token === "object" ? answer.token : null;
  const lvl = answer ? LEVEL[answer.result.level] : null;

  return (
    <details className="rounded-lg border border-line p-3">
      <summary className="cursor-pointer font-semibold">Paying with crypto? Check the token first <span className="text-sm font-normal text-ink-soft">(data: Tokenomist)</span></summary>
      <p className="mt-2 text-sm text-ink-soft">
        If you plan to sell a token for {context}, a big token unlock before you pay can push the price down. U-Estate never accepts crypto: this only helps you plan.
      </p>
      <form onSubmit={check} className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <label htmlFor="tc-token" className="text-sm font-semibold">Token (name, symbol or ID)</label>
          <input id="tc-token" list="tc-samples" required value={token} onChange={(e) => setToken(e.target.value)} placeholder="e.g. arbitrum" className="rounded border border-line px-3 py-2" />
          <datalist id="tc-samples">
            <option value="sample-cliff">Sample token with a big unlock soon (SAMPLE)</option>
            <option value="sample-drip">Sample token with small weekly unlocks (SAMPLE)</option>
            <option value="sample-steady">Sample token, fully unlocked (SAMPLE)</option>
          </datalist>
        </div>
        <div className="grid gap-1">
          <label htmlFor="tc-amount" className="text-sm font-semibold">THB you need from it</label>
          <input id="tc-amount" inputMode="numeric" required value={deposit} onChange={(e) => setDeposit(e.target.value)} className="rounded border border-line px-3 py-2" />
        </div>
        <div className="grid gap-1">
          <label htmlFor="tc-days" className="text-sm font-semibold">Days until you pay</label>
          <input id="tc-days" type="number" min={0} max={365} required value={days} onChange={(e) => setDays(e.target.value)} className="rounded border border-line px-3 py-2" />
        </div>
        <button type="submit" disabled={busy} className="justify-self-start rounded-lg bg-ink px-4 py-2 font-semibold text-paper disabled:opacity-60 sm:col-span-3">
          {busy ? "Checking…" : "Check unlock risk"}
        </button>
      </form>

      <div role="status" aria-live="polite">
        {error && <p className="mt-2 text-sm text-red">{error}</p>}
        {answer && lvl && (
          <div className="mt-3 grid gap-2 rounded-lg bg-mist p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 font-semibold ${lvl.cls}`}><span aria-hidden="true">{lvl.icon}</span> {lvl.text}</span>
              {t && <span>{t.name} ({t.symbol})</span>}
              {t?.is_sample && <span className="rounded bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber"><Text message={"SAMPLE DATA"} /></span>}
            </p>
            <ul className="list-inside list-disc">{answer.result.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <p>
              <strong>Plan:</strong> hold at least {thb(answer.result.tokenValueToHoldThb)} worth of the token ({answer.result.bufferPct}% buffer, an assumption) or convert to THB now, so {thb(answer.result.depositThb)} is safe by {answer.result.windowEnd.slice(0, 10)}.
            </p>
            {answer.result.eventsInWindow.length > 0 && (
              <table className="w-full text-start">
                <caption className="sr-only">Unlocks before you pay</caption>
                <thead><tr><th scope="col"><Text message={"Date"} /></th><th scope="col">% of market cap</th><th scope="col">Who receives</th></tr></thead>
                <tbody>
                  {answer.result.eventsInWindow.map((e) => (
                    <tr key={e.date}><td>{e.date.slice(0, 10)}</td><td>{e.valueToMarketCapPct ?? "unknown"}{e.valueToMarketCapPct !== null && "%"}</td><td>{e.allocations.join(", ") || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {answer.note && <p className="text-ink-soft">{answer.note}</p>}
            <ul className="text-xs text-ink-soft">{answer.advice.map((a) => <li key={a}>{a}</li>)}</ul>
            <p className="text-xs text-ink-soft">Source: {t ? t.source : "—"}. Risk level computed by U-Estate rules: high if unlocks before you pay total ≥ 5% of market cap or one unlock is ≥ 3%; medium if ≥ 1%.</p>
          </div>
        )}
      </div>
    </details>
  );
}
