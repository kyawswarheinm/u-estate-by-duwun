"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ChangePasswordSchema, fieldErrors, hashPassword, NATIONALITIES, verifyPassword } from "@/lib/auth-rules";
import { demoMode, endOtherSessions, requireUser } from "@/lib/session";
import { newId, readDb, updateDb } from "@/lib/store";
import { canTopUp, WALLET, walletSummary } from "@/lib/wallet";
import type { AuthState } from "@/app/auth/actions";

const ProfileSchema = z.object({
  name: z.string().trim().min(1, { message: "Enter your name." }).max(60),
  nationality: z.enum(NATIONALITIES, { message: "Choose your nationality." }),
  locale: z.enum(["en", "th", "ar", "zh-Hant", "es"]),
});

export async function updateProfile(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const me = await requireUser("/account/settings");
  const parsed = ProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error.issues) };
  if (me.isDemoPersona && parsed.data.nationality !== me.nationality) {
    return { ok: false, message: "Demo personas keep their nationality so the co-buy rules demo stays the same.", fieldErrors: { nationality: "Fixed for demo personas." } };
  }
  await updateDb((db) => {
    const p = db.profiles.find((x) => x.id === me.id)!;
    Object.assign(p, { name: parsed.data.name, nationality: parsed.data.nationality, isThai: parsed.data.nationality === "Thai", locale: parsed.data.locale });
  });
  revalidatePath("/", "layout");
  (await cookies()).set("locale", parsed.data.locale, { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 365 * 86400 });
  return { ok: true, message: "Profile saved." };
}

export async function changePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const me = await requireUser("/account/settings");
  const parsed = ChangePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error.issues) };
  const db = await readDb();
  const account = db.accounts.find((a) => a.userId === me.id);
  if (!account) return { ok: false, message: "Demo personas sign in with one click and have no password. Create your own account to set one." };
  if (!verifyPassword(parsed.data.current, account.passwordHash)) return { ok: false, message: "Your current password is incorrect.", fieldErrors: { current: "Incorrect password." } };
  const passwordHash = hashPassword(parsed.data.next);
  await updateDb((d) => {
    const a = d.accounts.find((x) => x.userId === me.id)!;
    a.passwordHash = passwordHash;
    a.passwordChangedAt = new Date().toISOString();
  });
  await endOtherSessions(me.id);
  return { ok: true, message: "Password changed. Other devices were signed out." };
}

/** Demo only: in production U-topia confirms membership (U-Bot / U-topia API). */
export async function toggleMembership() {
  const me = await requireUser("/account/settings");
  if (!demoMode() || me.isDemoPersona) return;
  await updateDb((db) => {
    const p = db.profiles.find((x) => x.id === me.id)!;
    p.utopiaMember = !p.utopiaMember;
    p.utopiaLinkedAt = p.utopiaMember ? new Date().toISOString() : undefined;
  });
  revalidatePath("/", "layout");
}

export async function topUpWallet() {
  const me = await requireUser("/account/wallet");
  await updateDb((db) => {
    if (!canTopUp(walletSummary(db, me.id).fundedThb)) return;
    db.walletTxns.push({ id: newId("w"), userId: me.id, kind: "top_up", amountThb: WALLET.topUpThb, note: "Test money added (demo)", createdAt: new Date().toISOString() });
  });
  revalidatePath("/account/wallet");
}

const WalletSettingsSchema = z.object({
  payoutMethod: z.enum(["utopia_wallet", "escrow_bank_transfer"], { message: "Choose how you would receive money." }),
  maxCommitThb: z
    .string()
    .transform((v): "" | number => {
      const t = v.replace(/[,฿\s]/g, "");
      return t === "" ? "" : Number(t);
    })
    .pipe(z.union([z.literal(""), z.number({ message: "Enter a number in baht." }).int().min(10_000, { message: "Use at least ฿10,000, or leave it empty." }).max(20_000_000, { message: "Use at most ฿20,000,000." })])),
});

export async function updateWalletSettings(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const me = await requireUser("/account/wallet");
  const parsed = WalletSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error.issues) };
  await updateDb((db) => {
    const p = db.profiles.find((x) => x.id === me.id)!;
    p.payoutMethod = parsed.data.payoutMethod;
    p.maxCommitThb = parsed.data.maxCommitThb === "" ? undefined : parsed.data.maxCommitThb;
  });
  revalidatePath("/account/wallet");
  return { ok: true, message: "Wallet settings saved." };
}
