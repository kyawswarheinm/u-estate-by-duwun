// Runs on `npm install` (package.json "prepare"): points git at the versioned hooks in .githooks/
// so the secret check runs before every commit. Safe to run anywhere: does nothing outside a git checkout.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync(".git")) process.exit(0);
try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  console.log("git hooks enabled (.githooks/pre-commit runs the secret check)");
} catch {
  // git not available (e.g. some CI images): CI runs the check itself.
}
