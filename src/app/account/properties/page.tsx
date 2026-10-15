import { Text } from "@/i18n/Text";
import Link from "next/link";
import { readDb } from "@/lib/store";
import { requireUser } from "@/lib/session";
import { MyProperties } from "@/components/MyProperties";

export const metadata = { title: "My properties | U-Estate" };

export default async function MyPropertiesPage() {
  const [db, me] = await Promise.all([readDb(), requireUser("/account/properties")]);
  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold"><Text message="My properties" /></h1>
          <p className="mt-1 text-deep"><Text message="Your listings, their deed checks and the sealed offers they received." /></p>
        </div>
        <Link href="/sell" className="btn btn-primary"><Text message="List a property" /></Link>
      </header>
      <MyProperties db={db} userId={me.id} />
    </div>
  );
}
