// Runs the production build against the offline JSON store (.data/db.json) instead of Supabase.
// For local QA only: nothing here reaches the hosted database. Usage: node scripts/start-offline.mjs [port]
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("..", import.meta.url));
const port = process.argv[2] ?? "3200";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], {
  cwd: app,
  stdio: "inherit",
  env: { ...process.env, DEMO_OFFLINE: "true" },
});
child.on("exit", (code) => process.exit(code ?? 0));
