import { runTool } from "@/lib/assistant-tools";
import { rateLimit } from "@/lib/ratelimit";

// T1: "Can my crypto fund this deposit?" Tokenomist unlock data → code-computed risk level (D-34).
export async function POST(req: Request) {
  const limited = rateLimit(req, "token-check", 10);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { token?: string; depositThb?: number; payWithinDays?: number };
  try {
    const out = await runTool("check_token_unlocks", {
      token: body.token,
      deposit_thb: Number(body.depositThb),
      pay_within_days: Math.round(Number(body.payWithinDays ?? 14)),
    });
    if (out && typeof out === "object" && "error" in out) return Response.json({ code: "VALIDATION", message: "Enter a token and a THB amount.", details: out }, { status: 400 });
    return Response.json(out);
  } catch {
    return Response.json({ code: "UPSTREAM", message: "Tokenomist did not answer. Try again, or try a sample token." }, { status: 502 });
  }
}
