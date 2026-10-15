import { AssistantChat } from "@/components/AssistantChat";
import { partnerStatus } from "@/lib/partners";

export const metadata = { title: "Ask U-Estate AI" };

export default function AssistantPage() {
  const status = partnerStatus();
  return (
    <article className="grid gap-4">
      <header>
        <h1 className="text-3xl font-bold">Ask U-Estate AI</h1>
        <p className="mt-1 max-w-3xl text-ink-soft">
          Chat in real time, in English, Thai, Arabic, Traditional Chinese or Spanish. The AI looks up our listings, fees, co-buy rules and token-unlock data
          with tools, so every number comes from U-Estate data, not from the AI&apos;s memory. Or press <strong>Talk to U-Estate</strong> for a live voice conversation.
        </p>
      </header>
      {!status.claude && (
        <p role="alert" className="rounded-lg bg-amber-soft p-3 text-amber">
          AI is not connected on this server (ANTHROPIC_API_KEY). Voice search on the home page still works with keyword rules.
        </p>
      )}
      <AssistantChat />
    </article>
  );
}
