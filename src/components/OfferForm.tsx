"use client";

import { useActionState } from "react";
import { submitOffer, type FormState } from "@/app/actions";

export function OfferForm({ roundId, listingId, requestId }: { roundId: string; listingId: string; requestId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitOffer, null);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="listingId" value={listingId} />
      <div className="grid gap-1">
        <label htmlFor="priceThb" className="font-semibold">Your offer (THB)</label>
        <input id="priceThb" name="priceThb" inputMode="numeric" required pattern="[0-9,]+" className="rounded border border-line px-3 py-3" />
      </div>
      <div className="grid gap-1">
        <label htmlFor="funding" className="font-semibold">Funding readiness</label>
        <select id="funding" name="funding" required className="rounded border border-line px-3 py-3">
          <option value="pre_approved">Bank pre-approval</option>
          <option value="proof_uploaded">Proof of funds uploaded</option>
          <option value="declared">Declared only</option>
        </select>
      </div>
      <div className="grid gap-1">
        <label htmlFor="closingDays" className="font-semibold">Days to closing</label>
        <input id="closingDays" name="closingDays" type="number" min={7} max={180} required defaultValue={45} className="rounded border border-line px-3 py-3" />
      </div>
      <div className="grid gap-1">
        <label htmlFor="conditions" className="font-semibold">Conditions (separate with ;)</label>
        <input id="conditions" name="conditions" aria-describedby="cond-help" className="rounded border border-line px-3 py-3" />
        <p id="cond-help" className="text-sm text-ink-soft">e.g. Subject to inspection; subject to bank loan</p>
      </div>
      <button type="submit" disabled={pending} className="justify-self-start rounded-lg bg-blue-ink px-5 py-3 font-semibold text-paper disabled:opacity-60">
        {pending ? "Submitting…" : "Submit sealed offer"}
      </button>
      <div role="status" aria-live="polite">
        {state && (
          <div className={`rounded-lg p-3 ${state.ok ? "bg-teal-soft text-teal" : "bg-red-soft text-red"}`}>
            <p className="font-semibold">{state.message}</p>
            {state.errors && <ul className="list-inside list-disc">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
        )}
      </div>
    </form>
  );
}
