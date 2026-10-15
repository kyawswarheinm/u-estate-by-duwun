import { runTool, TOOL_NAMES } from "@/lib/assistant-tools";
import { rateLimit } from "@/lib/ratelimit";

// E3: the voice agent's client tools call this endpoint from the browser.
// Read-only tools only (search, facts, fees, token unlocks, rules). Inputs are validated with zod.
export async function POST(req: Request) {
  const limited = rateLimit(req, "agent-tools", 60);
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as { tool?: string; input?: unknown } | null;
  if (!body?.tool || !TOOL_NAMES.includes(body.tool as never)) {
    return Response.json({ code: "VALIDATION", message: `tool must be one of ${TOOL_NAMES.join(", ")}` }, { status: 400 });
  }
  try {
    return Response.json({ result: await runTool(body.tool, body.input) });
  } catch {
    return Response.json({ code: "UPSTREAM", message: "The tool could not finish. Try again." }, { status: 502 });
  }
}
