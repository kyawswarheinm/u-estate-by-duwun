import { Text } from "@/i18n/Text";
import Image from "next/image";
import { readDb } from "@/lib/store";
import { currentUser, demoMode } from "@/lib/session";
import { initials, safeNext } from "@/lib/auth-rules";
import { SignInForm } from "@/components/AuthForms";
import { signInAsPersona } from "@/app/auth/actions";

export const metadata = { title: "Sign in | U-Estate" };

const PERSONA_NOTE: Record<string, string> = {
  "u-malee": "Seller: owns the Sathorn condo and the Bang Yai house",
  "u-somchai": "Thai buyer, U-topia member",
  "u-ploy": "Thai co-buyer, U-topia member",
  "u-daniel": "Australian member: condo co-owner or lender",
  "u-aiko": "Japanese member: condo co-owner",
  "u-narin": "Thai buyer, not a member (co-buy is blocked)",
  "u-manager": "Property manager",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(rawNext, "/account");
  const [db, me] = await Promise.all([readDb(), currentUser()]);
  // Reviewer personas are excluded: reviewer rights are granted to a real team account (scripts/db/make-reviewer.mjs).
  const personas = db.profiles.filter((p) => p.isDemoPersona && !p.isReviewer);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,440px)_1fr] lg:items-start">
      <section aria-labelledby="signin-title" className="panel p-6 sm:p-8">
        <Image src="/brand/u-estate-app-icon-512.png" alt="" width={48} height={48} className="mb-4 rounded-[12px]" />
        <h1 id="signin-title" className="page-title"><Text message="Welcome back" /></h1>
        <p className="mb-6 mt-2 text-deep"><Text message="Sign in to see your properties, your wallet and your offers." /></p>
        {me && <p className="mb-4 rounded-[10px] bg-ice px-4 py-3 text-sm">You are signed in as <strong>{me.name}</strong>. Signing in again switches account.</p>}
        <SignInForm next={next} />
      </section>

      {demoMode() && (
        <section id="personas" aria-labelledby="personas-title" className="grid gap-4">
          <div>
            <h2 id="personas-title" className="section-title"><Text message="Or try a demo persona" /></h2>
            <p className="mt-1 max-w-xl text-deep"><Text message="One click, no password. Use these to show the co-buy rules, FairOffer and the seller view during the demo." /></p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {personas.map((p) => (
              <li key={p.id}>
                <form action={signInAsPersona}>
                  <input type="hidden" name="userId" value={p.id} />
                  <input type="hidden" name="next" value={rawNext ? next : "/"} />
                  <button type="submit" className="panel flex w-full items-center gap-3 p-4 text-start hover:border-deep">
                    <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-ice font-bold text-midnight">{initials(p.name)}</span>
                    <span>
                      <span className="block font-semibold">{p.name}{me?.id === p.id && <span className="ms-2 text-sm font-normal text-muted"><Text message="(current)" /></span>}</span>
                      <span className="block text-sm text-deep">{PERSONA_NOTE[p.id] ?? `${p.nationality}${p.utopiaMember ? ", U-topia member" : ""}`}</span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
