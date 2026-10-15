"use client";

import { useActionState, useState } from "react";
import { joinCobuy, type FormState } from "@/app/actions";

export function JoinCobuyForm({ groupId, isCondo, isThai, remainingThb, maxRate, defaultRate }: {
  groupId: string; isCondo: boolean; isThai: boolean; remainingThb: number; maxRate: number; defaultRate: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinCobuy, null);
  const defaultLane = !isCondo && !isThai ? "lender" : "co_owner";
  const [lane, setLane] = useState<"co_owner" | "lender">(defaultLane);

  return (
    <form action={action} className="grid gap-4" noValidate={false}>
      <input type="hidden" name="groupId" value={groupId} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-semibold">How do you want to join?</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="lane" value="co_owner" checked={lane === "co_owner"} onChange={() => setLane("co_owner")} className="mt-1 size-5" />
          <span><strong>Co-owner:</strong> your name on the title, your share of rent and price changes.</span>
        </label>
        {!isCondo && (
          <label className="flex items-start gap-2">
            <input type="radio" name="lane" value="lender" checked={lane === "lender"} onChange={() => setLane("lender")} className="mt-1 size-5" />
            <span><strong>Lender:</strong> registered mortgage loan at a fixed interest rate. No share of the property or its price rise.</span>
          </label>
        )}
      </fieldset>

      <div className="grid gap-1">
        <label htmlFor="amountThb" className="font-semibold">Amount (THB, test money)</label>
        <input id="amountThb" name="amountThb" inputMode="numeric" required pattern="[0-9,]+" aria-describedby="amount-help"
          defaultValue={Math.min(remainingThb, 1_000_000)} className="rounded border border-line px-3 py-3" />
        <p id="amount-help" className="text-sm text-ink-soft">Still needed: ฿{remainingThb.toLocaleString("en-US")}</p>
      </div>

      {lane === "lender" && (
        <div className="grid gap-1">
          <label htmlFor="interestRatePct" className="font-semibold">Fixed yearly interest rate (%)</label>
          <input id="interestRatePct" name="interestRatePct" type="number" step="0.1" min="0.1" required defaultValue={defaultRate}
            aria-describedby="rate-help" className="rounded border border-line px-3 py-3" />
          <p id="rate-help" className="text-sm text-ink-soft">Thai law caps private loan interest at {maxRate}% a year. The app enforces it.</p>
        </div>
      )}

      <button type="submit" disabled={pending} className="justify-self-start rounded-lg bg-blue-ink px-5 py-3 font-semibold text-paper disabled:opacity-60">
        {pending ? "Checking rules…" : "Commit test money"}
      </button>

      <div role="status" aria-live="polite">
        {state && (
          <div className={`rounded-lg p-3 ${state.ok ? "bg-teal-soft text-teal" : "bg-red-soft text-red"}`}>
            <p className="font-semibold">{state.message}</p>
            {state.errors && state.errors.length > 0 && (
              <ul className="mt-1 list-inside list-disc">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
