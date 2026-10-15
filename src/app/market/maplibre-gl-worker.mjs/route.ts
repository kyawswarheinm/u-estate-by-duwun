import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Serves MapLibre GL's tile worker. maplibre-gl 6 ships it as a separate module file and finds it next to its own
// bundle, which doesn't exist inside the Next.js build, so MarketMap points setWorkerUrl here instead.
// Static third-party code from the pinned package: no input is read from the request.
const WORKER = join(process.cwd(), "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");

export async function GET() {
  const code = await readFile(WORKER);
  return new Response(code, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
