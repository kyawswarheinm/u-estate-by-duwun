import { Text } from "@/i18n/Text";
import { UPalChat } from "@/components/upal/UPalChat";
import { UPalAvatar } from "@/components/upal/icons";
import { partnerStatus } from "@/lib/partners";
import { geminiConfigured } from "@/app/api/assistant/gemini";

export const metadata = { title: "U-Pal" };

// The full-size U-Pal chat. Same conversation as the floating widget (UPalProvider), so nothing is lost moving between them.
export default async function AssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const status = partnerStatus();
  const q = (await searchParams).q;
  const initialQuestion = (Array.isArray(q) ? q[0] : q)?.slice(0, 300) ?? "";
  return (
    <article className="assistant-page grid gap-6">
      <header className="assistant-intro">
        <div className="mb-6 flex justify-center"><UPalAvatar size={64} /></div>
        <h1 className="page-title"><Text message="aiTitle" /></h1>
        <p className="mt-4 text-xl text-muted"><Text message="aiSubtitle" /></p>
      </header>
      {!status.claude && !geminiConfigured() && (
        <p role="alert" className="rounded-lg bg-amber-soft p-3 text-amber">
          AI is not connected on this server (ANTHROPIC_API_KEY). Voice search on the home page still works with keyword rules.
        </p>
      )}
      <UPalChat variant="page" initialQuestion={initialQuestion} />
    </article>
  );
}
