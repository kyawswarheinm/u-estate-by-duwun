"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { formatMoneyRef } from "@/i18n";
import { useI18n } from "@/i18n/provider";
import { upgradeToPremium, type CoinvestState } from "@/app/coinvest/actions";
import { COINVEST_ERROR } from "./messages";

/** Standard → Premium with test money: confirm, then the server charges the fee once (idempotent request id). */
export function UpgradeForm({ feeThb, availableThb }: { feeThb: number; availableThb: number }) {
  const { t, locale, currency } = useI18n();
  const money = (v: number) => formatMoneyRef(v, locale, currency);
  const [request] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState<CoinvestState, FormData>(upgradeToPremium, { ok: false });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const short = availableThb < feeThb;
  useEffect(() => {
    if (!pending) dialogRef.current?.close();
  }, [pending]);

  if (state.ok) {
    return (
      <div role="status" className="grid gap-3 rounded-xl bg-teal-soft p-5 text-teal">
        <p className="text-lg font-semibold">{t("Welcome to Premium. Co-Invest is open to you.")}</p>
        <p className="text-sm">{t("{amount} test money was paid from your wallet. The receipt is in your wallet.", { amount: money(feeThb) })}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/coinvest" className="btn btn-primary">{t("Open Co-Invest")}</Link>
          <Link href="/account/wallet" className="btn btn-secondary">{t("See the receipt")}</Link>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="grid gap-3" onSubmit={(e) => {
      if ((e.nativeEvent as SubmitEvent).submitter?.hasAttribute("data-confirm")) return;
      e.preventDefault();
      if (!short) dialogRef.current?.showModal();
    }}>
      <input type="hidden" name="requestId" value={request} />
      <button type="submit" className="btn btn-primary justify-self-start" disabled={pending || short}>{t("Upgrade for {amount} test money", { amount: money(feeThb) })}</button>
      {short && <p className="text-sm font-semibold text-red">{t("Not enough test money in your wallet.")} <Link href="/account/wallet" className="underline">{t("Open wallet")}</Link></p>}
      {!state.ok && state.code && <p role="alert" className="rounded-xl bg-red-soft p-3 text-sm font-semibold text-red">{t(COINVEST_ERROR[state.code])}</p>}
      <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby="upgrade-confirm-title" onClick={(e) => { if (e.target === e.currentTarget && !pending) dialogRef.current?.close(); }}>
        <div className="grid gap-4 p-6">
          <h2 id="upgrade-confirm-title" className="card-title">{t("Confirm Premium upgrade")}</h2>
          <p className="text-deep">{t("{amount} test money will be paid from your wallet. No real money is involved.", { amount: money(feeThb) })}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()} disabled={pending}>{t("Cancel")}</button>
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => formRef.current?.requestSubmit(formRef.current.querySelector<HTMLButtonElement>("[data-confirm]") ?? undefined)}>
              {pending ? t("Processing…") : t("Confirm")}
            </button>
          </div>
        </div>
      </dialog>
      <button type="submit" data-confirm hidden tabIndex={-1} aria-hidden="true" />
    </form>
  );
}
