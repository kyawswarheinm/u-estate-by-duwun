"use client";
import { Label, Text } from "@/i18n/Text";

import { useActionState } from "react";
import { changePassword, updateProfile, updateWalletSettings } from "@/app/account/actions";
import type { AuthState } from "@/app/auth/actions";
import { describe, Field, FormMessage } from "./FormBits";

const NATIONALITIES = ["Thai", "Australian", "Japanese", "Emirati", "Chinese", "Taiwanese", "Spanish", "British", "American", "Other"];
const LANGS = [
  { v: "en", l: "English" },
  { v: "th", l: "ภาษาไทย" },
  { v: "ar", l: "العربية" },
  { v: "zh-Hant", l: "繁體中文" },
  { v: "es", l: "Español" },
];

export function ProfileForm({ name, nationality, locale, fixedNationality }: { name: string; nationality: string; locale: string; fixedNationality: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(updateProfile, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4">
      <Field id="name" label="Display name" error={fe.name}>
        <input {...describe("name", fe.name)} required maxLength={60} defaultValue={name} autoComplete="name" className="input" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nationality" label="Nationality" hint={fixedNationality ? "Fixed for demo personas." : "Decides which co-buy options Thai law allows you."} error={fe.nationality}>
          <select {...describe("nationality", fe.nationality, true)} defaultValue={nationality} className="input">
            {NATIONALITIES.map((n) => <option key={n}>{n}</option>)}
            {!NATIONALITIES.includes(nationality) && <option>{nationality}</option>}
          </select>
        </Field>
        <Field id="locale" label="Preferred language" hint="Used for voice and AI answers." error={fe.locale}>
          <select {...describe("locale", fe.locale, true)} defaultValue={locale} className="input">
            {LANGS.map((l) => <option key={l.v} value={l.v} lang={l.v}>{l.l}</option>)}
          </select>
        </Field>
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary justify-self-start"><Label>{pending ? "Saving…" : "Save profile"}</Label></button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(changePassword, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" key={state?.ok ? "done" : "form"}>
      <Field id="current" label="Current password" error={fe.current}>
        <input {...describe("current", fe.current)} type="password" required autoComplete="current-password" className="input" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="next" label="New password" hint="At least 8 characters." error={fe.next}>
          <input {...describe("next", fe.next, true)} type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="input" />
        </Field>
        <Field id="confirm" label="Repeat new password" error={fe.confirm}>
          <input {...describe("confirm", fe.confirm)} type="password" required autoComplete="new-password" className="input" />
        </Field>
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary justify-self-start"><Label>{pending ? "Changing…" : "Change password"}</Label></button>
    </form>
  );
}

export function WalletSettingsForm({ payoutMethod, maxCommitThb }: { payoutMethod: string; maxCommitThb?: number }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(updateWalletSettings, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-semibold"><Text message="When you sell or receive loan repayments, pay me through" /></legend>
        <label className="panel flex cursor-pointer items-start gap-3 p-4 has-[:checked]:border-blue">
          <input type="radio" name="payoutMethod" value="escrow_bank_transfer" defaultChecked={payoutMethod !== "utopia_wallet"} className="mt-1 size-5" />
          <span><strong className="block"><Text message="Bank transfer through the escrow partner" /></strong><span className="text-sm text-deep"><Text message="Bank details are collected by the licensed escrow partner at closing. U-Estate never stores them." /></span></span>
        </label>
        <label className="panel flex cursor-pointer items-start gap-3 p-4 has-[:checked]:border-blue">
          <input type="radio" name="payoutMethod" value="utopia_wallet" defaultChecked={payoutMethod === "utopia_wallet"} className="mt-1 size-5" />
          <span><strong className="block"><Text message="My U-topia wallet (THB)" /></strong><span className="text-sm text-deep"><Text message="Available when U-topia connects its wallet to U-Estate. Fiat only: U-Estate never accepts or pays out crypto." /></span></span>
        </label>
        {fe.payoutMethod && <p className="error-text">{fe.payoutMethod}</p>}
      </fieldset>
      <Field id="maxCommitThb" label="Largest single co-buy commitment (THB)" hint="Optional safety limit. Leave empty for no limit." error={fe.maxCommitThb}>
        <input {...describe("maxCommitThb", fe.maxCommitThb, true)} inputMode="numeric" defaultValue={maxCommitThb ?? ""} placeholder="e.g. 1,000,000" className="input max-w-xs" />
      </Field>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary justify-self-start"><Label>{pending ? "Saving…" : "Save wallet settings"}</Label></button>
    </form>
  );
}
