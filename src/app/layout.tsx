import type { Metadata } from "next";
import Link from "next/link";
import { Cormorant_Garamond, Manrope, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { readDb } from "@/lib/store";
import { currentUser, demoMode } from "@/lib/session";
import { initials } from "@/lib/auth-rules";
import { walletSummary } from "@/lib/wallet";
import { resetDemo } from "./actions";
import { signOut } from "./auth/actions";
import { Logo, SiteHeader, type HeaderUser } from "@/components/SiteHeader";
import { VoiceAgentDock } from "@/components/VoiceAgentDock";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["500", "600"] });
const notoThai = Noto_Sans_Thai({ variable: "--font-noto-thai", subsets: ["thai"], weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: "U-Estate — transparent property, for every party",
  description: "AI-guided Thai property marketplace: verified listings, honest prices, fair offers and legal co-buying.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [db, me] = await Promise.all([readDb(), currentUser()]);
  const headerUser: HeaderUser = me
    ? {
        name: me.name,
        initials: initials(me.name),
        email: me.email,
        isDemoPersona: Boolean(me.isDemoPersona),
        utopiaMember: me.utopiaMember,
        availableThb: walletSummary(db, me.id).availableThb,
      }
    : null;

  return (
    <html lang="en" className={`${manrope.variable} ${cormorant.variable} ${notoThai.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3">
          Skip to content
        </a>
        <SiteHeader user={headerUser} demoMode={demoMode()} signOutAction={signOut} />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8">{children}</main>
        <VoiceAgentDock userName={me?.name ?? "there"} />
        <footer className="bg-midnight text-silver">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <Logo inverse />
              <p className="mt-3 max-w-md text-sm leading-6">
                U-Estate is a technology marketplace. AI results are estimates, not financial or legal advice.
                This is a hackathon demo: every person, property, document and baht is a sample or test money.
              </p>
            </div>
            <nav aria-label="Footer">
              <p className="text-sm font-semibold text-ice">Explore</p>
              <ul className="mt-2 grid gap-1 text-sm">
                <li><Link className="text-silver hover:text-ice" href="/">Find a home</Link></li>
                <li><Link className="text-silver hover:text-ice" href="/sell">Sell a property</Link></li>
                <li><Link className="text-silver hover:text-ice" href="/ledger">Transparency ledger</Link></li>
                <li><Link className="text-silver hover:text-ice" href="/partners">Partners and your data</Link></li>
              </ul>
            </nav>
            <div>
              <p className="text-sm font-semibold text-ice">Demo controls</p>
              <p className="mt-2 text-sm">Resets offers, co-buy groups and the ledger. Signed-up accounts and their listings stay.</p>
              <form action={resetDemo} className="mt-3">
                <button type="submit" className="btn btn-ghost-dark">Reset demo data</button>
              </form>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
