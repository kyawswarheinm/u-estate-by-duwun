// Creates a dashboard SQL Editor bundle for a NEW project only. Never executes SQL.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
const directory = new URL("../../supabase/migrations/", import.meta.url);
const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
const output = new URL("../../tmp/supabase-setup.sql", import.meta.url);
mkdirSync(new URL("../../tmp/", import.meta.url), { recursive: true });
writeFileSync(output, [
  "-- U-Estate: NEW demo/test project only. Do not run against an existing schema.",
  "begin;",
  ...files.map((file) => `-- Migration: ${file}\n${readFileSync(new URL(file, directory), "utf8").replace(/^(begin|commit);\r?$/gmi, "")}`),
  "commit;",
].join("\n\n"));
console.log(`Bundled ${files.length} migrations into tmp/supabase-setup.sql. Apply once in the project's SQL Editor.`);
