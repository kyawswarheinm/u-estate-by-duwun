"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { fieldErrors, hashPassword, safeNext, SignInSchema, SignUpSchema, verifyPassword } from "@/lib/auth-rules";
import { demoMode, endSession, startSession } from "@/lib/session";
import { newId, readDb, updateDb } from "@/lib/store";
import { WALLET } from "@/lib/wallet";

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
  const db = await readDb();
  const persona = db.profiles.find((p) => p.id === id && p.isDemoPersona);
  if (!persona) redirect("/signin");
  await startSession(persona.id);
  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next"), "/"));
}
