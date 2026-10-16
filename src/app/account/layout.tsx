import { requireUser } from "@/lib/session";
import { AccountNav } from "@/components/AccountNav";
import { Text } from "@/i18n/Text";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser("/account");
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="grid content-start gap-3">
        <div>
          <p className="text-sm text-muted"><Text message="Signed in as" /></p>
          <p className="font-semibold">{me.name}</p>
        </div>
        <AccountNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
