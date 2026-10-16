"use client";
import { useI18n } from "@/i18n/provider";

import { Text } from "@/i18n/Text";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/app/auth/actions";
import { describe, Field, FormMessage } from "./FormBits";

const NATIONALITIES = ["Thai", "Australian", "Japanese", "Emirati", "Chinese", "Taiwanese", "Spanish", "British", "American", "Other"];
const LANGS = [
  { v: "en", l: "English" },
  { v: "th", l: "ภาษาไทย" },
  { v: "ar", l: "العربية" },
  { v: "zh-Hant", l: "繁體中文" },
  { v: "es", l: "Español" },
];

function PasswordInput({ id, error, hint, autoComplete }: { id: string; error?: string; hint?: boolean; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <input {...describe(id, error, hint)} type={show ? "text" : "password"} required minLength={autoComplete === "new-password" ? 8 : undefined} maxLength={128} autoComplete={autoComplete} className="input" />
      <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} className="btn btn-secondary shrink-0 px-3 text-sm">
        {show ? <Text message="Hide" /> : <Text message="Show" />}
      </button>
    </div>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field id="email" label="Email" hint="The made-up email you signed up with, e.g. anythings@example.com" error={fe.email}>
        <input {...describe("email", fe.email, true)} type="email" autoCapitalize="none" spellCheck={false} required autoComplete="email" defaultValue={state?.values?.email} className="input" />
      </Field>
      <Field id="password" label="Password" error={fe.password}>
        <PasswordInput id="password" error={fe.password} autoComplete="current-password" />
      </Field>
      <FormMessage state={state && !state.ok ? state : null} />
      <button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? <Text message="Signing in…" /> : <Text message="Sign in" />}</button>
      <p className="text-center text-sm">
        <Text message="New here?" /> <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-blue-ink underline"><Text message="Create an account" /></Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const { locale } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, null);
  const fe = state?.fieldErrors ?? {};
  const v = state?.values ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field id="name" label="Your name" hint="Shown to sellers and co-buyers." error={fe.name}>
        <input {...describe("name", fe.name, true)} required maxLength={60} autoComplete="name" defaultValue={v.name} className="input" />
      </Field>
      <Field id="email" label="Email" hint="Any non-real email to demo, e.g. anythings@example.com. Real inboxes like Gmail are refused." error={fe.email}>
        <input {...describe("email", fe.email, true)} type="email" autoCapitalize="none" spellCheck={false} required autoComplete="email" placeholder="anythings@example.com" defaultValue={v.email} className="input" />
      </Field>
      <Field id="password" label="Password" hint="At least 8 characters. We store only a secure hash, never the password. Don't reuse a real password." error={fe.password}>
        <PasswordInput id="password" error={fe.password} hint autoComplete="new-password" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nationality" label="Nationality" hint="Sets which co-buy options the law allows." error={fe.nationality}>
          <select {...describe("nationality", fe.nationality, true)} required defaultValue={v.nationality || "Thai"} className="input">
            {NATIONALITIES.map((n) => <option key={n}>{n}</option>)}
          </select>
        </Field>
        <Field id="locale" label="Preferred language" error={fe.locale}>
          <select {...describe("locale", fe.locale)} defaultValue={v.locale || locale} className="input">
            {LANGS.map((l) => <option key={l.v} value={l.v} lang={l.v}>{l.l}</option>)}
          </select>
        </Field>
      </div>
      <FormMessage state={state && !state.ok ? state : null} />
      <button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? <Text message="Creating your account…" /> : <Text message="Create account" />}</button>
      <p className="text-center text-sm">
        <Text message="Already have an account?" /> <Link href={`/signin?next=${encodeURIComponent(next)}`} className="font-semibold text-blue-ink underline"><Text message="Sign in" /></Link>
      </p>
    </form>
  );
}
