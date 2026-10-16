import { randomUUID } from "node:crypto";
import { backendText } from "@/i18n/backend";
import { NotificationBell } from "@/components/NotificationBell";
import { translator } from "@/i18n";
import { getPreferences } from "@/i18n/server";
import { I18nProvider } from "@/i18n/provider";
import { LOCALE_INFO } from "@/lib/locale";

import { Text } from "@/i18n/Text";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Inter, Noto_Sans_Thai, Noto_Sans_Arabic, Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import "./responsive.css";
import { readDb } from "@/lib/store";
import { currentUser, demoMode } from "@/lib/session";
import { initials } from "@/lib/auth-rules";
import { walletSummary } from "@/lib/wallet";
import { resetDemo } from "./actions";
import { signOut } from "./auth/actions";
import { Logo, SiteHeader, type HeaderUser } from "@/components/SiteHeader";
import { UPalProvider } from "@/components/upal/UPalProvider";
import { UPalWidget } from "@/components/upal/UPalWidget";
import { MobileTabBar } from "@/components/MobileTabBar";
import { usesSupabase } from "@/lib/db/runtime";
import { asTheme, THEME_BOOT_SCRIPT, THEME_COOKIE } from "@/lib/theme";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const notoThai = Noto_Sans_Thai({ variable: "--font-noto-thai", subsets: ["thai"], display: "swap", weight: ["400", "600", "700"] });

const notoArabic = Noto_Sans_Arabic({ variable: "--font-noto-arabic", subsets: ["arabic"], display: "swap", weight: ["400", "600"] });
const notoTc = Noto_Sans_TC({ variable: "--font-noto-tc", subsets: ["latin"], display: "swap", weight: ["400", "600"] });

export const metadata: Metadata = {
  title: "U-Estate — transparent property, for every party",
  description: "AI-guided Thai property marketplace: verified listings, honest prices, fair offers and legal co-buying.",
};

// "light dark" tells browsers the site has its own dark theme, so they don't auto-darken it.
export const viewport: Viewport = {
  colorScheme: "light dark",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, currency } = await getPreferences();
  const t = translator(locale);
  const [db, me, jar] = await Promise.all([readDb(), currentUser(), cookies()]);
  const theme = asTheme(jar.get(THEME_COOKIE)?.value);
  const headerUser: HeaderUser = me
    ? {
        name: me.name,
        initials: initials(me.name),
        email: me.email,
        isDemoPersona: Boolean(me.isDemoPersona),
        utopiaMember: me.utopiaMember,
        premium: Boolean(me.premium),
        availableThb: walletSummary(db, me.id).availableThb,
      }
    : null;

  return (
    <html
      lang={locale}
      dir={LOCALE_INFO[locale].dir}
      data-theme={theme ?? undefined}
      suppressHydrationWarning /* without a saved choice the boot script sets data-theme before hydration */
      className={`${inter.variable} ${notoThai.variable} ${notoArabic.variable} ${notoTc.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={locale} currency={currency}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[var(--z-skip)] focus:rounded-lg focus:bg-paper focus:px-4 focus:py-3">
          <Text message="Skip to content" />
        </a>
        <SiteHeader user={headerUser} theme={theme} demoMode={demoMode()} signOutAction={signOut} notifications={me && usesSupabase() ? <NotificationBell key={me.id} userId={me.id} locale={me.locale} /> : null} />
        <UPalProvider userName={me?.name ?? "there"} tier={me ? (me.premium ? "premium" : "standard") : "guest"}>
          <main tabIndex={-1} id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-5 pb-28 pt-10 sm:px-8 lg:px-12">{children}</main>
          <UPalWidget />
        </UPalProvider>
        <MobileTabBar signedIn={Boolean(me)} />
        <footer className="band text-silver">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <Logo inverse />
              <p className="mt-3 max-w-md text-sm leading-6">
                <Text message="footerDisclaimer" />
              </p>
            </div>
            <nav aria-label={t("Footer")}>
              <p className="text-sm font-semibold text-ice"><Text message="Explore" /></p>
              <ul className="mt-2 grid gap-1 text-sm">
                <li><Link className="text-silver hover:text-ice" href="/"><Text message="Find a home" /></Link></li>
                <li><Link className="text-silver hover:text-ice" href="/market"><Text message="Market" /></Link></li>
                <li><Link className="text-silver hover:text-ice" href="/coinvest"><Text message="Co-Invest" /></Link></li>
                <li><Link className="text-silver hover:text-ice" href="/sell"><Text message="Sell a property" /></Link></li>
                <li><Link className="text-silver hover:text-ice" href="/ledger"><Text message="Ledger" /></Link></li>
                <li><Link className="text-silver hover:text-ice" href="/partners"><Text message="Partners and your data" /></Link></li>
              </ul>
            </nav>
            <div>
              <p className="text-sm font-semibold text-ice"><Text message="Demo controls" /></p>
              {!usesSupabase() && <p className="mt-2 text-sm"><Text message="Resets offers, co-buy groups and the ledger. Signed-up accounts and their listings stay." /></p>}
              {usesSupabase() ? me?.isReviewer && demoMode() && <form action={resetDemo} className="mt-3">
                <input type="hidden" name="requestId" value={randomUUID()} />
                <p className="text-sm">{backendText(me.locale).resetNote}</p>
                <button type="submit" className="btn btn-ghost-dark">{backendText(me.locale).reset}</button>
              </form> : <form action={resetDemo} className="mt-3">
                <button type="submit" className="btn btn-ghost-dark"><Text message="Reset demo data" /></button>
              </form>}
            </div>
          </div>
        </footer>
      </I18nProvider>
      </body>
    </html>
  );
}
