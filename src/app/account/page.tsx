import { Text } from "@/i18n/Text";
import { Money } from "@/components/Money";
import Link from "next/link";
import { readDb } from "@/lib/store";
import { requireUser } from "@/lib/session";
import { walletSummary } from "@/lib/wallet";
import { MyProperties } from "@/components/MyProperties";

export const metadata = { title: "Your account | U-Estate" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const [db, me] = await Promise.all([readDb(), requireUser("/account")]);
  const wallet = walletSummary(db, me.id);
  const listings = db.listings.filter((l) => l.sellerId === me.id).length;
  const groups = new Set(wallet.commitments.map((c) => c.groupId)).size;

  return (
    <div className="grid gap-6">
      {welcome && (
        <p role="status" className="rounded-[14px] bg-teal-soft px-5 py-4 font-semibold text-teal">
          <Text message="Account created. You can sign in again any time with the same email and password." />
        </p>
      )}
      <header>
        <h1 className="page-title"><Text message="Hello, {name}" values={{ name: me.name }} /></h1>
        <p className="mt-1 text-deep"><Text message="Everything you own, sell or have committed on U-Estate." /></p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-5">
          <dt className="text-sm text-deep"><Text message="Properties listed" /></dt>
          <dd className="mt-1 text-3xl font-bold">{listings}</dd>
          <dd className="mt-2"><Link href="/account/properties" className="text-sm font-semibold text-blue-ink underline"><Text message="Manage" /></Link></dd>
        </div>
        <div className="panel p-5">
          <dt className="text-sm text-deep"><Text message="Test money available" /></dt>
          <dd className="mt-1 text-3xl font-bold"><Money amount={wallet.availableThb} /></dd>
          <dd className="mt-2"><Link href="/account/wallet" className="text-sm font-semibold text-blue-ink underline"><Text message="Open wallet" /></Link></dd>
        </div>
        <div className="panel p-5">
          <dt className="text-sm text-deep"><Text message="Co-buy groups joined" /></dt>
          <dd className="mt-1 text-3xl font-bold">{groups}</dd>
          <dd className="mt-2 text-sm">{me.utopiaMember ? <Text message="U-topia member: co-buy open" /> : <Link href="/account/settings#membership" className="font-semibold text-blue-ink underline"><Text message="Co-buy needs U-topia membership" /></Link>}</dd>
        </div>
      </dl>

      <section aria-labelledby="props-title" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="props-title" className="section-title"><Text message="Your properties" /></h2>
          <Link href="/sell" className="btn btn-primary"><Text message="List a property" /></Link>
        </div>
        <MyProperties db={db} userId={me.id} compact />
      </section>
    </div>
  );
}
