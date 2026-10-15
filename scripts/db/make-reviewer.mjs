// Grants (or removes) reviewer rights for ONE real team account in the dedicated demo project.
// Reviewers can read every private deed and run the demo reset, so this is never a one-click persona.
//   node --env-file=.env.local scripts/db/make-reviewer.mjs --email you@example.com          (grant)
//   node --env-file=.env.local scripts/db/make-reviewer.mjs --email you@example.com --revoke (remove)
// Prints no keys, tokens or passwords.
import { createClient } from "@supabase/supabase-js";

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const email = arg("--email")?.trim().toLowerCase();
const revoke = process.argv.includes("--revoke");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!email || !url || !secret) {
  console.error("Usage: node --env-file=.env.local scripts/db/make-reviewer.mjs --email <account email> [--revoke]");
  process.exit(1);
}
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
let user;
for (let page = 1; !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error("Could not list accounts."); process.exit(1); }
  user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (data.users.length < 200) break;
}
if (!user) { console.error("No account with that email. Sign up in the app first."); process.exit(1); }
const { error } = await admin.from("profiles").update({ is_reviewer: !revoke }).eq("id", user.id).eq("is_demo_persona", false);
if (error) { console.error("Update failed."); process.exit(1); }
console.log(`${revoke ? "Removed" : "Granted"} reviewer rights for ${email}. Sign out and in again to see the reset control.`);
