"use client";
import { Label } from "@/i18n/Text";
// Small accessible form helpers shared by sign-in, sign-up, settings, wallet and listing forms.
import type { ReactNode } from "react";

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}><Label>{label}</Label></label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="hint">{typeof hint === "string" ? <Label>{hint}</Label> : hint}</p>}
      {error && <p id={`${id}-error`} className="error-text"><Label>{error}</Label></p>}
    </div>
  );
}

/** aria props for an input inside <Field>. */
export function describe(id: string, error?: string, hint?: boolean) {
  return {
    id,
    name: id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  };
}

export function FormMessage({ state }: { state: { ok: boolean; message: string } | null }) {
  return (
    <div role="status" aria-live="polite">
      {state && (
        <p className={`rounded-[10px] px-4 py-3 text-sm font-semibold ${state.ok ? "bg-teal-soft text-teal" : "bg-red-soft text-red"}`}>
          <Label>{state.message}</Label>
        </p>
      )}
    </div>
  );
}
