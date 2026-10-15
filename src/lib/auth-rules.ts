// Demo accounts (D-39). Pure functions, unit-tested. Server code only (node:crypto).
// People sign up with a made-up email (e.g. anythings@example.com) and a password.
// The password is stored only as a salted scrypt hash, never in plain text.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export function hashPassword(password: string, salt = randomBytes(16)) {
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [alg, n, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Real inbox providers are refused so nobody types a personal address into a public demo. */
const REAL_PROVIDERS = [
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.th", "ymail.com", "hotmail.com", "hotmail.co.th", "outlook.com", "outlook.co.th",
  "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.net",
  "yandex.com", "yandex.ru", "mail.ru", "qq.com", "163.com", "126.com", "naver.com", "daum.net", "zoho.com", "tutanota.com",
];

export function isRealInbox(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return REAL_PROVIDERS.includes(domain);
}

export const EMAIL_HINT = "Any non-real email to demo, e.g. anythings@example.com";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: "Enter an email address, for example anythings@example.com." }))
  .refine((e) => !isRealInbox(e), { message: "Please don't use a real inbox. Any made-up email works, for example anythings@example.com." });

const password = z.string().min(8, { message: "Use at least 8 characters." }).max(128, { message: "Use at most 128 characters." });

export const NATIONALITIES = ["Thai", "Australian", "Japanese", "Emirati", "Chinese", "Taiwanese", "Spanish", "British", "American", "Other"] as const;

export const SignUpSchema = z.object({
  name: z.string().trim().min(1, { message: "Enter your name." }).max(60),
  email,
  password,
  nationality: z.enum(NATIONALITIES, { message: "Choose your nationality." }),
  locale: z.enum(["en", "th", "ar", "zh-Hant", "es"]).default("en"),
});

export const SignInSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1, { message: "Enter your password." }).max(128),
});

export const ChangePasswordSchema = z
  .object({ current: z.string().min(1, { message: "Enter your current password." }), next: password, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "The new passwords don't match.", path: ["confirm"] });

/** Only same-site paths are allowed as a post-sign-in destination (no open redirects). */
export function safeNext(next: unknown, fallback = "/account") {
  const n = String(next ?? "");
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : fallback;
}

export function fieldErrors(issues: z.core.$ZodIssue[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    out[k] ??= i.message;
  }
  return out;
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
