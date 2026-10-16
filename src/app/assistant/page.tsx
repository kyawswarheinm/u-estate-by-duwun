import { Text } from "@/i18n/Text";
import { getTranslations } from "@/i18n/server";
import { SLOT, withSlot } from "@/i18n/slot";
import { AssistantChat } from "@/components/AssistantChat";
import { partnerStatus } from "@/lib/partners";
import { geminiConfigured } from "@/app/api/assistant/gemini";

export const metadata = { title: "Ask U-Estate AI" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const status = partnerStatus();
  const t = await getTranslations();
  const q = (await searchParams).q;
  const initialQuestion = (Array.isArray(q) ? q[0] : q)?.slice(0, 300) ?? "";
  return (
    <article className="assistant-page grid gap-6">
      <header className="assistant-intro"><div className="ai-orb" aria-hidden="true" />
        <h1 className="text-3xl font-bold"><Text message="aiTitle" /></h1><p className="mt-4 text-xl text-muted"><Text message="aiSubtitle" /></p>
        <p className="mt-1 max-w-3xl text-ink-soft">
          {withSlot(t("Chat in real time, in English, Thai, Arabic, Traditional Chinese or Spanish. The AI looks up our listings, fees, co-buy rules and token-unlock data with tools, so every number comes from U-Estate data, not from the AI's memory. Or press {voice} for a live voice conversation.", { voice: SLOT }), <strong>{t("Talk to U-Estate")}</strong>)}
        </p>
      </header>
      {!status.claude && !geminiConfigured() && (
        <p role="alert" className="rounded-lg bg-amber-soft p-3 text-amber">
          {t("AI is not connected on this server (ANTHROPIC_API_KEY). Voice search on the home page still works with keyword rules.")}
        </p>
      )}
      <AssistantChat initialQuestion={initialQuestion} />
    </article>
  );
}
