import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readDb, updateDb } from "./store";
import type { DB, Profile } from "./types";
import { usesSupabase } from "./db/runtime";
import { profileRow } from "./db/snapshot";
import { supabaseServer } from "./supabase/server";

// Sessions for demo accounts (D-39). The cookie holds a random token; the store keeps only its SHA-256.
export const SESSION_COOKIE = "ue_session";
const SESSION_DAYS = 7;

/** Demo mode allows one-click persona sign-in. On by default in the prototype; set DEMO_MODE=false to hide it. */
export function demoMode() {
  return process.env.DEMO_MODE !== "false";
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function findSessionUser(db: DB, token: string | undefined): Profile | null {
  if (!token) return null;
  const tokenHash = sha256(token);
  const s = db.sessions.find((x) => x.tokenHash === tokenHash && new Date(x.expiresAt).getTime() > Date.now());
  return s ? db.profiles.find((p) => p.id === s.userId) ?? null : null;
}

/** The signed-in person, or null for a guest. */
export async function currentUser(): Promise<Profile | null> {
  if (usesSupabase()) {
    const client = await supabaseServer();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;
    const [{ data, error }, settings] = await Promise.all([
      client.from("profiles").select("*").eq("id", user.id).single(),
      client.from("profile_settings").select("payout_method,max_commit_thb").eq("user_id", user.id).single(),
    ]);
    if (error || settings.error) throw new Error("Account profile unavailable. Please try again.");
    return { ...profileRow(data), email: user.email, payoutMethod: settings.data.payout_method,
      maxCommitThb: settings.data.max_commit_thb ?? undefined };
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findSessionUser(await readDb(), token);
}

/** For pages and actions that need an account: sends guests to sign in, then back. */
export async function requireUser(next: string): Promise<Profile> {
  const me = await currentUser();
  if (!me) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return me;
}

export async function startSession(userId: string) {
  if (usesSupabase()) throw new Error("Supabase sessions require authentication.");
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await updateDb((db) => {
    db.sessions = db.sessions.filter((s) => new Date(s.expiresAt).getTime() > now.getTime()); // drop expired
    db.sessions.push({ tokenHash: sha256(token), userId, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() });
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  if (usesSupabase()) {
    const { error } = await (await supabaseServer()).auth.signOut({ scope: "local" });
    if (error) throw new Error("Sign-out failed. Please try again.");
    return;
  }
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = sha256(token);
    await updateDb((db) => {
      db.sessions = db.sessions.filter((s) => s.tokenHash !== tokenHash);
    });
  }
  jar.delete(SESSION_COOKIE);
}

/** Signs the user out everywhere (used after a password change), keeping the current browser signed in. */
export async function endOtherSessions(userId: string) {
  if (usesSupabase()) {
    const { error } = await (await supabaseServer()).auth.signOut({ scope: "others" });
    if (error) throw new Error("Could not sign out other sessions.");
    return;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const keep = token ? sha256(token) : "";
  await updateDb((db) => {
    db.sessions = db.sessions.filter((s) => s.userId !== userId || s.tokenHash === keep);
  });
}
