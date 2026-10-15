// Fallback chat provider: Google Gemini, used ONLY when no Anthropic key is set (Claude stays the default, D-31).
// Same system prompt, same read-only tools (D-36): Gemini picks a tool, our code runs it with runTool.
// Plain REST (no SDK). The key is server-only: GEMINI_API_KEY, optional GEMINI_MODEL.
import "server-only";
import { z } from "zod";
import { runTool, TOOL_DESCRIPTIONS, TOOL_NAMES, ToolInputs } from "@/lib/assistant-tools";

const API = "https://generativelanguage.googleapis.com/v1beta";
const MAX_ROUNDS = 6;

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: unknown; thought?: boolean };
type Content = { role: "user" | "model"; parts: Part[] };
export type ChatEvent = { type: "text"; text: string } | { type: "tool"; name: string };

export class GeminiError extends Error {
  constructor(public status: number) {
    super(`Gemini HTTP ${status}`);
  }
}

const key = () => process.env.GEMINI_API_KEY!.trim();

let modelCache: string | null = null;
/** GEMINI_MODEL if set, else the newest stable "flash" model this key can use (looked up once per server). */
async function model() {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (modelCache) return modelCache;
  const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key() }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new GeminiError(r.status);
  const { models = [] } = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const names = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /flash/.test(m.name) && !/(lite|image|tts|live|audio|thinking|exp|preview)/.test(m.name))
    .map((m) => m.name.replace(/^models\//, ""))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (!names[0]) throw new GeminiError(404);
  modelCache = names[0];
  return modelCache;
}

const declarations = TOOL_NAMES.map((name) => {
  const parametersJsonSchema = z.toJSONSchema(ToolInputs[name], { io: "input" }) as Record<string, unknown>;
  delete parametersJsonSchema.$schema; // Gemini rejects the $schema keyword
  return { name, description: TOOL_DESCRIPTIONS[name], parametersJsonSchema };
});

/** Runs the tool loop and reports text and tool use as they happen. Throws GeminiError on upstream failures. */
export async function geminiChat(system: string, messages: { role: "user" | "assistant"; content: string }[], emit: (e: ChatEvent) => void) {
  const contents: Content[] = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const m = await model();
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const r = await fetch(`${API}/models/${m}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [{ functionDeclarations: declarations }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new GeminiError(r.status);
    const j = (await r.json()) as { candidates?: { content?: Content; finishReason?: string }[] };
    const content = j.candidates?.[0]?.content;
    if (!content?.parts?.length) {
      emit({ type: "text", text: "Sorry, I can't help with that request." }); // blocked or empty answer
      return;
    }
    contents.push({ role: "model", parts: content.parts });

    const calls = content.parts.filter((p) => p.functionCall);
    const text = content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
    if (calls.length === 0) {
      if (text) emit({ type: "text", text });
      return;
    }
    const responses: Part[] = [];
    for (const { functionCall } of calls) {
      const name = functionCall!.name;
      emit({ type: "tool", name });
      const result = await runTool(name, functionCall!.args ?? {}); // zod-validated, read-only
      responses.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  emit({ type: "text", text: "I could not finish that answer. Please ask a narrower question." });
}
