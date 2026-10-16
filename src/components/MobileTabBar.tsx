"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n";

const icon = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const ICONS = {
  home: <svg {...icon}><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1v-8.5Z" /></svg>,
  market: <svg {...icon}><path d="M4 19V5m0 14h16M8 15l3.5-4 3 2.5L19 8" /></svg>,
  coinvest: <svg {...icon}><circle cx="8" cy="9" r="3" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M3 19c.6-3 2.6-4.5 5-4.5s4.4 1.5 5 4.5m1.5-4.2c.6-.2 1.3-.3 2-.3 2.2 0 3.8 1.3 4.5 4" /></svg>,
  account: <svg {...icon}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" /></svg>,
};

/** Phones only: the four main places one thumb away. The full navigation stays in the header menu. */
export function MobileTabBar({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();
  const pathname = usePathname() || "/";
  const tabs: { href: string; label: MessageKey; icon: keyof typeof ICONS; match: (p: string) => boolean }[] = [
    { href: "/", label: "Home", icon: "home", match: (p) => p === "/" || p.startsWith("/listing") },
    { href: "/market", label: "Market", icon: "market", match: (p) => p.startsWith("/market") },
    { href: "/coinvest", label: "Co-Invest", icon: "coinvest", match: (p) => p.startsWith("/coinvest") || p.startsWith("/premium") },
    signedIn
      ? { href: "/account", label: "Account", icon: "account", match: (p) => p.startsWith("/account") || p.startsWith("/messages") || p.startsWith("/notifications") }
      : { href: `/signin?next=${encodeURIComponent(pathname)}`, label: "Sign in", icon: "account", match: (p) => p.startsWith("/signin") || p.startsWith("/signup") },
  ];
  return (
    <nav aria-label={t("Quick navigation")} className="tab-bar">
      <ul>
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.label}>
              <Link href={tab.href} aria-current={active ? "page" : undefined} className="tab-bar-link">
                {ICONS[tab.icon]}
                <span>{t(tab.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
