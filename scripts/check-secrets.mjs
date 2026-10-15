#!/usr/bin/env node
// Blocks secrets and private files from reaching git/GitHub.
//   node scripts/check-secrets.mjs --staged   (pre-commit hook: checks what is about to be committed)
//   node scripts/check-secrets.mjs            (CI / manual: checks every tracked + untracked, non-ignored file)
// Exit code 1 = something must be removed before committing. Never bypass with --no-verify.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const staged = process.argv.includes("--staged");
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const files = (staged
  ? git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")
  : git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
).split("\0").filter(Boolean);

// Files that must never be committed, whatever they contain.
const BLOCKED_PATHS = [
  [/(^|\/)\.env($|\.(?!example$)[^/]*$)/, "environment file with real values (only .env.example may be committed)"],
  [/(^|\/)\.data\//, "local demo database (contains password hashes and sessions)"],
  [/\.(pem|key|p12|pfx|keystore)$/i, "private key / certificate file"],
  [/(^|\/)id_(rsa|ed25519|ecdsa)(\.pub)?$/, "SSH key"],
  [/(^|\/)\.vercel\//, "Vercel project link"],
  [/(^|\/)supabase\/\.(temp|branches)\//, "Supabase CLI local state"],
  [/(^|\/)\.claude\/settings\.local\.json$/, "personal Claude Code settings"],
  [/\.local\.(txt|md|json)$/, "local-only notes"],
];

// Content patterns. Each is specific enough to avoid false alarms on code and docs.
const SECRET_PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API key"],
  [/\bsk_[a-f0-9]{40,}\b/, "ElevenLabs API key"],
  [/\bsb_secret_[A-Za-z0-9_-]{16,}/, "Supabase secret key"],
  [/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "Supabase/JWT key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "GitHub token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/^\s*(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ELEVENLABS_API_KEY|ELEVENLABS_AGENT_ID|TOKENOMIST_API_KEY|AVALANCHE_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|DEMO_PASSWORD|CRON_SECRET)\s*=\s*['"]?(?![<$.{*])[^\s'"#]{6,}/m, "secret env var with a value"], // <placeholders> are fine
  [/(private[_ ]?key|secret)["'\s:=]{1,6}(0x)?[a-fA-F0-9]{64}\b/i, "hex private key"],
];
// Plain-text passwords in docs/config (not code: tests use obviously fake passwords).
const PASSWORD_IN_TEXT = /\bpassword\s*[:=]\s*["']?(?!\*{3}|<|\$\{|\{\{)[^\s"'<>{}`]{8,}/i;
const TEXT_EXT = /\.(md|txt|example|ya?ml|toml|json|ini|cfg|conf|env)$/i;

const findings = [];
for (const f of files) {
  for (const [re, why] of BLOCKED_PATHS) if (re.test(f) && f !== ".env.example") findings.push(`${f}: blocked file (${why})`);
  let text;
  try {
    text = staged ? git("show", `:${f}`) : existsSync(f) ? readFileSync(f, "utf8") : "";
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue; // binary
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [re, why] of SECRET_PATTERNS) if (re.test(line)) findings.push(`${f}:${i + 1}: ${why}`);
    if (TEXT_EXT.test(f) && PASSWORD_IN_TEXT.test(line)) findings.push(`${f}:${i + 1}: password written in a text/config file`);
  });
}

if (findings.length) {
  console.error("\n✖ Secret check failed. Remove these before committing (put real values in .env.local, which git ignores):\n");
  for (const x of [...new Set(findings)]) console.error("  - " + x);
  console.error("\nIf a real key was ever committed or pushed, rotate it immediately: deleting the file is not enough.\n");
  process.exit(1);
}
console.log(`✓ Secret check passed (${files.length} file${files.length === 1 ? "" : "s"} scanned${staged ? ", staged" : ""}).`);
