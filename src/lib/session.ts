import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readDb, updateDb } from "./store";
import type { DB, Profile } from "./types";

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
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const keep = token ? sha256(token) : "";
  await updateDb((db) => {
    db.sessions = db.sessions.filter((s) => s.userId !== userId || s.tokenHash === keep);
  });
}
