import { SellerFeePreview } from "@/components/SellerFeePreview";
import { PhotoUploader } from "@/components/PhotoUploader";
import { usesSupabase } from "@/lib/db/runtime";
import { Text } from "@/i18n/Text";
import Link from "next/link";
import { readDb } from "@/lib/store";
import { aiConfigured } from "@/lib/ai";
import { currentUser } from "@/lib/session";
import { DeedCheckForm } from "@/components/DeedCheckForm";
import { ListingForm } from "@/components/ListingForm";
import { MyProperties } from "@/components/MyProperties";
import { FEES } from "@/lib/rules";
import { UPalPageContext } from "@/components/upal/UPalProvider";

export const metadata = { title: "Sell a property | U-Estate" };

export default async function SellPage({ searchParams }: { searchParams: Promise<{ listing?: string }> }) {
  const { listing: selected } = await searchParams;
  const [db, me] = await Promise.all([readDb(), currentUser()]);

  if (!me) {
    return (
      <div className="grid gap-6">
        <UPalPageContext facts={{ step: "sign in or create an account to list", signed_in: false, ...feeFacts }} />
        <header className="max-w-2xl">
          <h1 className="page-title"><Text message="sellTitle" /></h1>
          <p className="mt-3 text-lg text-deep"><Text message="List your property, check your deed, and compare offers by rules you publish before any offer arrives. Your fee: 1.5% (0.75% for U-topia members), against a typical 3%." /></p>
        </header>
        <SellerSteps />
        <SellerFeePreview />
        <div className="panel flex flex-wrap items-center gap-4 p-6">
          <p className="flex-1 font-semibold"><Text message="Create a free account to list a property. Any made-up email works in this demo." /></p>
          <Link href="/signup?next=/sell" className="btn btn-primary"><Text message="Create account" /></Link>
          <Link href="/signin?next=/sell" className="btn btn-secondary"><Text message="Sign in" /></Link>
        </div>
      </div>
    );
  }

  const mine = db.listings
    .filter((l) => l.sellerId === me.id && !l.archivedAt)
    .map((l) => ({ id: l.id, title: db.properties.find((p) => p.id === l.propertyId)!.title }));

  const unchecked = db.listings.filter((l) => l.sellerId === me.id && !l.archivedAt && l.verificationStatus === "unverified").length;
  const step = mine.length === 0 ? "publish a first listing" : unchecked > 0 ? "check the title deed" : "open the offer room and compare offers";
  return (
    <div className="grid gap-8">
      <UPalPageContext facts={{ step, signed_in: true, active_listings: mine.length, listings_without_deed_check: unchecked, utopia_member: me.utopiaMember, ...feeFacts }} />
      <header className="max-w-2xl">
        <h1 className="page-title"><Text message="sellTitle" /></h1>
        <p className="mt-2 text-lg text-deep"><Text message="Publish your listing, then check the deed so buyers see a verified badge." /></p>
      </header>

      <SellerSteps />
      <SellerFeePreview />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="new-title" className="panel p-6">
          <h2 id="new-title" className="mb-4 text-xl font-bold"><Text message="Property details" /></h2>
          <ListingForm />
        </section>
        <aside className="grid content-start gap-3" aria-labelledby="mine-title">
          <h2 id="mine-title" className="text-xl font-bold"><Text message="Your listings" /></h2>
          <MyProperties db={db} userId={me.id} compact />
        </aside>
      </div>

      {usesSupabase() && mine.length > 0 && <PhotoUploader listings={mine} selected={selected} locale={me.locale}/>}
      <section id="deed" aria-labelledby="deed-title" className="panel grid gap-4 p-6">
        <div>
          <h2 id="deed-title" className="text-xl font-bold"><Text message="Check a title deed" /></h2>
          <p className="mt-1 max-w-3xl text-deep">
            <Text message="AI reads the deed type, owner name and warning signs. Code then checks the name against your account and applies Thai deed rules. AI flags are indicators, not proof. Ownership is only confirmed at the Land Office." />
          </p>
        </div>
        {!aiConfigured() && <p role="alert" className="rounded-[10px] bg-amber-soft p-3 text-amber">AI is not connected on this server yet (ANTHROPIC_API_KEY). The check will show an error.</p>}
        <p className="text-sm">
          Sample deeds to try: <a className="underline" href="/samples/deed-chanote-malee.png" download>clean Chanote (house)</a>,{" "}
          <a className="underline" href="/samples/deed-condo-malee.png" download>condo title</a>,{" "}
          <a className="underline" href="/samples/deed-landreform.png" download>land-reform certificate</a>,{" "}
          <a className="underline" href="/samples/deed-name-mismatch.png" download>name mismatch</a>.
          The samples are in Khun Malee&apos;s name, so on your own listing they show a name mismatch, as they should.
        </p>
        {mine.length ? (
          <DeedCheckForm listings={mine} defaultListingId={selected} />
        ) : (
          <p className="text-deep"><Text message="Publish a listing first, then check its deed here." /></p>
        )}
      </section>
    </div>
  );
}

const feeFacts = { seller_fee_pct: FEES.saleStandard * 100, seller_fee_pct_utopia_member: FEES.saleMember * 100, typical_agent_fee_pct: FEES.agentSaleTypical * 100 };

function SellerSteps() {
  return <ol className="seller-steps">{(["stepProperty", "stepVerify", "stepValue", "stepPublish", "stepOffers"] as const).map((key,i) => <li key={key}><span>{String(i+1).padStart(2,"0")}</span><Text message={key} /></li>)}</ol>;
}
