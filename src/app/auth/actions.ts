"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fieldErrors, hashPassword, safeNext, SignInSchema, SignUpSchema, verifyPassword } from "@/lib/auth-rules";
import { demoMode, endSession, startSession } from "@/lib/session";
import { newId, readDb, updateDb } from "@/lib/store";
import { WALLET } from "@/lib/wallet";
import { usesSupabase } from "@/lib/db/runtime";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/ratelimit";

export type AuthState = { ok: boolean; message: string; fieldErrors?: Record<string, string>; values?: Record<string, string> } | null;

// Slow down password guessing: 5 failed tries per email per 5 minutes (per server instance).
const failures = new Map<string, number[]>();
const WINDOW_MS = 5 * 60_000;
function tooManyFailures(email: string) {
  const recent = (failures.get(email) ?? []).filter((t) => Date.now() - t < WINDOW_MS);
  failures.set(email, recent);
  return recent.length >= 5;
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(["name", "email", "password", "nationality", "locale"].map((k) => [k, String(formData.get(k) ?? "")]));
  const values = { name: raw.name, email: raw.email, nationality: raw.nationality, locale: raw.locale };
  const parsed = SignUpSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error.issues), values };
  const { name, email, password, nationality, locale } = parsed.data;

  if (usesSupabase()) {
    const client = await supabaseServer();
    const limited = rateLimit(new Request("http://localhost/signup", { headers: await headers() }), "signup", 5);
    if (limited) return { ok: false, message: "Too many sign-up attempts. Please wait a minute.", values };
    // Only reserved example domains may bypass email confirmation in the demo.
    // The public Auth endpoint rejects these addresses; no email is sent.
    const reserved = /^example\.(com|org|net)$/.test(email.split("@")[1]);
    const { data: enabled } = demoMode() && reserved ? await client.rpc("demo_mode") : { data: false };
    if (enabled) {
      const created = await supabaseAdmin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, nationality, locale } });
      if (created.error) return { ok: false, message: "Could not create this account. Check your details or try signing in.", values };
      const signedIn = await client.auth.signInWithPassword({ email, password });
      if (signedIn.error) return { ok: false, message: "Account created. Please try signing in.", values };
      revalidatePath("/", "layout");
      redirect(safeNext(formData.get("next"), "/account?welcome=1"));
    }
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { name, nationality, locale } } });
    if (error) return { ok: false, message: "Could not create this account. Check your details or try signing in.", values };
    if (!data.session) return { ok: false, message: "Email confirmation is required by this project's Auth settings. The demo uses made-up emails; ask the project owner to configure demo sign-up.", values };
    revalidatePath("/", "layout");
    redirect(safeNext(formData.get("next"), "/account?welcome=1"));
  }

  const db = await readDb();
  if (db.accounts.some((a) => a.email === email)) {
    return { ok: false, message: "An account with this email already exists.", fieldErrors: { email: "This email already has an account. Sign in instead." }, values };
  }
  const passwordHash = hashPassword(password); // hashed before the store lock: scrypt is deliberately slow
  const now = new Date().toISOString();
  const userId = newId("u");
  const created = await updateDb((d) => {
    if (d.accounts.some((a) => a.email === email)) return false; // lost a race with another sign-up
    d.profiles.push({ id: userId, name, nationality, isThai: nationality === "Thai", utopiaMember: false, roles: ["buyer", "seller"], email, locale, createdAt: now });
    d.accounts.push({ userId, email, passwordHash, createdAt: now });
    d.walletTxns.push({ id: newId("w"), userId, kind: "demo_grant", amountThb: WALLET.signupGrantThb, note: "Welcome test money (demo)", createdAt: now });
    return true;
  });
  if (!created) return { ok: false, message: "An account with this email already exists.", fieldErrors: { email: "This email already has an account. Sign in instead." }, values };

  await startSession(userId);
  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next"), "/account?welcome=1"));
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = SignInSchema.safeParse({ email: formData.get("email") ?? "", password: formData.get("password") ?? "" });
  const values = { email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { ok: false, message: "Enter your email and password.", fieldErrors: fieldErrors(parsed.error.issues), values };
  const { email, password } = parsed.data;
  if (tooManyFailures(email)) return { ok: false, message: "Too many tries. Wait 5 minutes, then try again.", values };

  if (usesSupabase()) {
    const { error } = await (await supabaseServer()).auth.signInWithPassword({ email, password });
    if (error) {
      failures.get(email)!.push(Date.now());
      return { ok: false, message: "Email or password is incorrect.", values };
    }
    failures.delete(email);
    revalidatePath("/", "layout");
    redirect(safeNext(formData.get("next"), "/account"));
  }

  const db = await readDb();
  const account = db.accounts.find((a) => a.email === email);
  // Same message whether the email or the password is wrong, so emails can't be discovered.
  if (!account || !verifyPassword(password, account.passwordHash)) {
    failures.get(email)!.push(Date.now());
    return { ok: false, message: "Email or password is incorrect.", values };
  }
  failures.delete(email);
  await startSession(account.userId);
  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next"), "/account"));
}

export async function signOut() {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/");
}

/** Demo only: one click to act as a seeded persona (Khun Malee, Somchai, Daniel…). */
export async function signInAsPersona(formData: FormData) {
  if (!demoMode()) redirect("/signin");
  const id = String(formData.get("userId") ?? "");
  if (usesSupabase()) {
    if (!z.uuid().safeParse(id).success) redirect("/signin");
    const client = await supabaseServer();
    const { data: enabled } = await client.rpc("demo_mode");
    if (!enabled) redirect("/signin");
    const { data: persona } = await client.from("profiles").select("id").eq("id", id).eq("is_demo_persona", true).single();
    if (!persona) redirect("/signin");
    const admin = supabaseAdmin();
    const account = await admin.auth.admin.getUserById(id);
    if (account.error || !account.data.user.email) throw new Error("Demo persona unavailable.");
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: account.data.user.email });
    if (link.error) throw new Error("Demo sign-in unavailable.");
    const { error } = await client.auth.verifyOtp({ type: "email", token_hash: link.data.properties.hashed_token });
    if (error) throw new Error("Demo sign-in failed. Please try again.");
    revalidatePath("/", "layout");
    redirect(safeNext(formData.get("next"), "/"));
  }
  const db = await readDb();
  const persona = db.profiles.find((p) => p.id === id && p.isDemoPersona);
  if (!persona) redirect("/signin");
  await startSession(persona.id);
  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next"), "/"));
}
