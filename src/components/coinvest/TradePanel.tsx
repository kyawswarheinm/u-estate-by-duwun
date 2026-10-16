"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { formatMoneyRef } from "@/i18n";
import { useI18n } from "@/i18n/provider";
import { tradeUnits, type CoinvestState } from "@/app/coinvest/actions";
import { COINVEST_ERROR } from "./messages";

const newRequest = () => crypto.randomUUID();

/**
 * Buy units from the U-Estate pool or sell them back. Numbers here are a preview: the server recomputes the price,
 * checks the balance, the units and the legal lanes, and either writes everything or nothing.
 */
export function TradePanel({ offeringId, title, status, unitPriceThb, unitParThb, poolUnits, heldUnits, totalUnits, availableThb, laneBlocked }: {
  offeringId: string;
  title: string;
  status: "funding" | "active";
  unitPriceThb: number;
  unitParThb: number;
  poolUnits: number;
  heldUnits: number;
  totalUnits: number;
  availableThb: number;
  /** Set when the legal lanes stop this member from holding units here (foreign member, house or land). */
  laneBlocked: boolean;
}) {
  const { t, locale, currency } = useI18n();
  const money = (v: number) => formatMoneyRef(v, locale, currency);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [units, setUnits] = useState(1);
  const [request, setRequest] = useState(newRequest);
  const [state, action, pending] = useActionState<CoinvestState, FormData>(tradeUnits, { ok: false });
  const [shownState, setShownState] = useState<CoinvestState | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const price = side === "buy" ? unitPriceThb : status === "funding" ? unitParThb : unitPriceThb;
  const affordable = Math.floor(availableThb / unitPriceThb);
  const max = side === "buy" ? Math.max(0, Math.min(poolUnits, affordable, 1000)) : Math.min(heldUnits, 1000);
  const safeUnits = Math.min(Math.max(1, units || 1), Math.max(1, max));
  const total = Math.round(price * safeUnits * 100) / 100;
  const after = side === "buy" ? heldUnits + safeUnits : heldUnits - safeUnits;
  const disabled = pending || max === 0 || (side === "buy" && laneBlocked);

  // A finished request gets a new id, so the next trade is a new transaction; a failed one keeps its id for a safe retry.
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    setShownState(state);
    if (state.ok) setRequest(newRequest());
  }
  useEffect(() => {
    if (!pending) dialogRef.current?.close();
  }, [pending]);

  function choose(next: "buy" | "sell") {
    setSide(next);
    setUnits(1);
    setShownState(null);
    setRequest(newRequest());
  }

  const sellLabel = status === "funding" ? t("Withdraw") : t("Sell");
  return (
    <section aria-labelledby="trade-title" className="surface-card grid gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="trade-title" className="section-title">{t("Trade units")}</h2>
        <div className="segmented" role="group" aria-label={t("Buy or sell")}>
          <button type="button" aria-pressed={side === "buy"} onClick={() => choose("buy")}>{t("Buy")}</button>
          <button type="button" aria-pressed={side === "sell"} onClick={() => choose("sell")} disabled={heldUnits === 0}>{sellLabel}</button>
        </div>
      </div>

      {laneBlocked && side === "buy" && (
        <p className="rounded-xl bg-amber-soft p-3 text-sm text-amber">{t("Foreign members cannot hold units in houses or land (Thai law). Choose a condo.")}</p>
      )}

      <form ref={formRef} action={action} className="grid gap-4" onSubmit={(e) => {
        // First submit opens the confirmation; the dialog's Confirm submits again through the hidden button.
        if ((e.nativeEvent as SubmitEvent).submitter?.hasAttribute("data-confirm")) return;
        e.preventDefault();
        if (!disabled) dialogRef.current?.showModal();
      }}>
        <input type="hidden" name="offeringId" value={offeringId} />
        <input type="hidden" name="side" value={side} />
        <input type="hidden" name="requestId" value={request} />
        <div className="grid gap-1.5">
          <label htmlFor="trade-units" className="field-label">{t("Units")}</label>
          <div className="flex items-center gap-2">
            <button type="button" className="card-icon-btn" aria-label={t("One unit fewer")} onClick={() => setUnits(Math.max(1, safeUnits - 1))} disabled={safeUnits <= 1}>−</button>
            <input id="trade-units" name="units" type="number" inputMode="numeric" min={1} max={Math.max(1, max)} step={1} value={safeUnits}
              onChange={(e) => setUnits(Number.parseInt(e.target.value, 10) || 1)} className="input w-28 text-center tabular-nums" aria-describedby="trade-limits" />
            <button type="button" className="card-icon-btn" aria-label={t("One unit more")} onClick={() => setUnits(Math.min(Math.max(1, max), safeUnits + 1))} disabled={safeUnits >= max}>+</button>
            <button type="button" className="btn btn-secondary min-h-11 px-4 text-sm" onClick={() => setUnits(Math.max(1, max))} disabled={max <= 1}>{t("Max")}</button>
          </div>
          <p id="trade-limits" className="caption">
            {side === "buy"
              ? t("Up to {count} units: what the pool holds and your test money allow.", { count: max })
              : t("You hold {count} units.", { count: heldUnits })}
          </p>
        </div>

        <dl className="grid gap-2 rounded-xl bg-ice p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-deep">{status === "funding" ? t("Funding price per unit") : t("Unit value now")}</dt><dd className="font-semibold tabular-nums">{money(price)}</dd></div>
          <div><dt className="text-deep">{side === "buy" ? t("You pay") : status === "funding" ? t("Refund") : t("You receive")}</dt><dd className="text-lg font-bold tabular-nums">{money(total)}</dd></div>
          <div><dt className="text-deep">{t("Your units after")}</dt><dd className="font-semibold tabular-nums">{after} · {Math.round((after / totalUnits) * 10000) / 100}%</dd></div>
          <div><dt className="text-deep">{t("Test money available")}</dt><dd className="font-semibold tabular-nums">{money(availableThb)}</dd></div>
        </dl>

        <button type="submit" className="btn btn-primary justify-self-start" disabled={disabled}>
          {safeUnits === 1
            ? side === "buy" ? t("Buy 1 unit") : status === "funding" ? t("Withdraw 1 unit") : t("Sell 1 unit")
            : side === "buy" ? t("Buy {count} units", { count: safeUnits }) : status === "funding" ? t("Withdraw {count} units", { count: safeUnits }) : t("Sell {count} units", { count: safeUnits })}
        </button>
        <p className="caption">{t("Test money only. Units are simulated co-ownership for this demo, not a legal title or a security.")}</p>

        <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby="trade-confirm-title" onClick={(e) => { if (e.target === e.currentTarget && !pending) dialogRef.current?.close(); }}>
          <div className="grid gap-4 p-6">
            <h3 id="trade-confirm-title" className="card-title">{side === "buy" ? t("Confirm purchase") : status === "funding" ? t("Confirm withdrawal") : t("Confirm sale")}</h3>
            <p className="text-deep"><bdi>{title}</bdi></p>
            <p className="text-lg font-semibold tabular-nums">{safeUnits} × {money(price)} = {money(total)}</p>
            <p className="caption">{t("The final amount is computed by the server at the current unit price.")}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()} disabled={pending}>{t("Cancel")}</button>
              <button type="button" className="btn btn-primary" disabled={pending} aria-busy={pending} onClick={() => formRef.current?.requestSubmit(formRef.current.querySelector<HTMLButtonElement>("[data-confirm]") ?? undefined)}>
                {pending ? t("Processing…") : t("Confirm")}
              </button>
            </div>
          </div>
        </dialog>
        <button type="submit" data-confirm hidden tabIndex={-1} aria-hidden="true" />
      </form>

      <div role="status" aria-live="polite">
        {shownState?.ok && (
          <div className="rounded-xl bg-teal-soft p-4 text-sm text-teal">
            <p className="font-semibold">
              {side === "buy" ? t("Done: you bought {count} units for {amount}.", { count: shownState.units ?? 0, amount: money(shownState.amountThb ?? 0) })
                : t("Done: {count} units returned to the pool for {amount}.", { count: shownState.units ?? 0, amount: money(shownState.amountThb ?? 0) })}
            </p>
            {shownState.funded && <p>{t("This purchase completed the funding target. The property is now funded.")}</p>}
            <p className="mt-1"><Link href="/account/wallet" className="font-semibold underline">{t("See the receipt in your wallet")}</Link> · <Link href="/ledger" className="font-semibold underline">{t("See it on the ledger")}</Link></p>
          </div>
        )}
        {shownState && !shownState.ok && shownState.code && (
          <p className="rounded-xl bg-red-soft p-4 text-sm font-semibold text-red">{t(COINVEST_ERROR[shownState.code])}</p>
        )}
      </div>
    </section>
  );
}
