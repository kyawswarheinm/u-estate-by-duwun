import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "tmp/**",
    "next-env.d.ts",
    // Offline Python pipelines: their venvs bundle third-party JS (e.g. torch) that is not ours to lint.
    "pipeline/**",
  ]),
]);

export default eslintConfig;
