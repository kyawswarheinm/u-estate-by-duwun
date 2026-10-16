// Runs the production build against the offline JSON store instead of Supabase. For local QA only: nothing here
// reaches the hosted database.
//   node scripts/start-offline.mjs [port] [--data=tmp/qa-db.json] [--avalanche-rpc=http://127.0.0.1:9] [--avalanche-test-key]
// --data uses an isolated data file (created from the seed when missing). --avalanche-rpc points the ledger at another
// RPC, e.g. an unreachable one to exercise the database-ledger fallback, or a local fake Fuji RPC (tests/e2e) together
// with --avalanche-test-key: a random throwaway key generated in memory for this process only (never printed or saved).
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const port = args.find((a) => /^\d+$/.test(a)) ?? "3200";
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const env = { ...process.env, DEMO_OFFLINE: "true" };
if (flag("data")) env.DEMO_DATA_FILE = flag("data");
if (flag("avalanche-rpc")) env.AVALANCHE_RPC_URL = flag("avalanche-rpc");
if (args.includes("--avalanche-test-key")) {
  if (!flag("avalanche-rpc")?.startsWith("http://127.0.0.1")) throw new Error("--avalanche-test-key is only for a local fake RPC");
  env.AVALANCHE_PRIVATE_KEY = `0x${randomBytes(32).toString("hex")}`;
}
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port], { cwd: app, stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
