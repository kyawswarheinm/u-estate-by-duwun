"use client";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useI18n } from "@/i18n/provider";

import { Label, Text } from "@/i18n/Text";

import { Money } from "@/components/Money";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type HeaderUser = {
  name: string;
  initials: string;
  email?: string;
  isDemoPersona: boolean;
  utopiaMember: boolean;
  availableThb: number;
} | null;

const NAV = [
  { href: "/", label: "Find a home", match: (p: string) => p === "/" || p.startsWith("/listing") || p.startsWith("/cobuy") },
  { href: "/market", label: "Market", match: (p: string) => p.startsWith("/market") },
  { href: "/sell", label: "Sell", match: (p: string) => p.startsWith("/sell") },
  { href: "/ledger", label: "Ledger", match: (p: string) => p.startsWith("/ledger") },
];

const ACCOUNT_LINKS = [
  { href: "/messages", label: "Messages" },
  { href: "/account", label: "Overview" },
  { href: "/account/properties", label: "My properties" },
  { href: "/account/wallet", label: "Wallet" },
  { href: "/account/settings", label: "Account settings" },
];

/** Brand mark (U with a keyhole) + wordmark. Assets come from /logo via scripts/brand-assets.mjs. */
export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-xl font-bold tracking-tight ${inverse ? "text-ice" : "text-midnight"}`}>
      <Image
        src={inverse ? "/brand/u-estate-mark-white.png" : "/brand/u-estate-mark-midnight.png"}
        alt=""
        width={26}
        height={32}
        priority={!inverse}
      />
      U-Estate
    </span>
  );
}

export function SiteHeader({ user, demoMode, signOutAction, notifications }: { notifications?: React.ReactNode; user: HeaderUser; demoMode: boolean; signOutAction: () => Promise<void> }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false); // account menu
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false); // language and currency popover
  const menuRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const langButtonRef = useRef<HTMLButtonElement>(null);

  // Close menus on navigation (reset during render, the React-recommended pattern), outside click and Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
    setMobileOpen(false);
    setLangOpen(false);
  }
  useEffect(() => {
    if (!menuOpen && !mobileOpen && !langOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
      if (!langRef.current?.contains(e.target as Node)) setLangOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (langOpen) langButtonRef.current?.focus();
      setMenuOpen(false);
      setMobileOpen(false);
      setLangOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, mobileOpen, langOpen]);

  const onAuthPage = pathname.startsWith("/signin") || pathname.startsWith("/signup");
  const next = encodeURIComponent(onAuthPage ? "/account" : pathname || "/");

  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-silver bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      {/* Three regions: logo (start), nav centred on the viewport, actions (end). The equal 1fr side columns keep the nav at the true centre. */}
      <div className="site-header-bar">
        <Link href="/" aria-label={t("U-Estate home")} className="justify-self-start rounded-md no-underline">
          <Logo />
        </Link>

        <nav aria-label={t("Main")} className="site-nav">
          <ul className="flex items-center gap-7">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="nav-link" aria-current={n.match(pathname) ? "page" : undefined}><Label>{n.label}</Label></Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center justify-self-end gap-2">
          <div ref={langRef} className="relative">
            <button
              ref={langButtonRef}
              type="button"
              onClick={() => setLangOpen((o) => !o)}
              aria-expanded={langOpen}
              aria-controls="language-menu"
              aria-label={t("Language")}
              className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm ${langOpen ? "bg-ice" : "hover:bg-ice"}`}
            >
              <span aria-hidden="true">&#9678;</span> <span className="hidden xl:inline">{t("Language")}</span>
            </button>
            {langOpen && (
              // Phones: pinned under the header with a 16px gutter. Wider screens: aligned to the trigger's end edge.
              <div
                id="language-menu"
                role="group"
                aria-label={t("Language")}
                className="fixed inset-x-4 top-[calc(var(--header-h)+8px)] z-[var(--z-popover)] rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow)] sm:absolute sm:inset-x-auto sm:end-0 sm:top-[calc(100%+8px)] sm:w-80"
              >
                <LocaleSwitcher />
              </div>
            )}
          </div>
          {notifications}
          {user ? (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-controls="account-menu"
                aria-label={`${t("Account menu")}: ${user.name}`}
                className="flex min-h-11 items-center gap-2 rounded-full border border-silver bg-white py-1 ps-1 pe-3 hover:border-deep"
              >
                <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-midnight text-sm font-bold text-ice">{user.initials}</span>
                <span className="hidden text-start leading-tight sm:block">
                  <span className="block text-sm font-semibold">{user.name}</span>
                  <span className="block text-xs text-muted"><Money amount={user.availableThb} /> <Text message="test money" /></span>
                </span>
              </button>
              {menuOpen && (
                <div id="account-menu" className="absolute end-0 top-[calc(100%+8px)] w-72 rounded-[14px] border border-silver bg-white p-2 shadow-[var(--shadow)]">
                  <div className="border-b border-silver px-3 pb-3 pt-2">
                    <p className="font-semibold">{user.name}</p>
                    <p className="text-sm text-muted">{user.isDemoPersona ? <Text message="Demo persona" /> : user.email}</p>
                    <p className="mt-1 text-sm">{user.utopiaMember ? <Text message="U-topia member" /> : <Text message="Not a U-topia member" />}</p>
                  </div>
                  <ul className="py-1">
                    {ACCOUNT_LINKS.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="flex min-h-11 items-center rounded-lg px-3 font-medium no-underline hover:bg-ice" aria-current={pathname === l.href ? "page" : undefined}>
                          <Label>{l.label}</Label>
                        </Link>
                      </li>
                    ))}
                    <li>
                      <Link href="/sell" className="flex min-h-11 items-center rounded-lg px-3 font-medium no-underline hover:bg-ice"><Text message="List a property" /></Link>
                    </li>
                    {demoMode && (
                      <li>
                        <Link href={`/signin?next=${next}#personas`} className="flex min-h-11 items-center rounded-lg px-3 font-medium no-underline hover:bg-ice"><Text message="Switch demo persona" /></Link>
                      </li>
                    )}
                  </ul>
                  <form action={signOutAction} className="border-t border-silver pt-1">
                    <button type="submit" className="flex min-h-11 w-full items-center rounded-lg px-3 text-start font-medium text-red hover:bg-red-soft"><Text message="Sign out" /></button>
                  </form>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href={`/signin?next=${next}`} className="btn btn-secondary hidden sm:inline-flex"><Text message="Sign in" /></Link>
              <Link href={`/signup?next=${next}`} className="btn btn-primary hidden sm:inline-flex"><Text message="Create account" /></Link>
            </>
          )}

          <button
            type="button"
            className="btn btn-secondary px-3 site-nav-toggle"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((o) => !o)}
          >
            <span aria-hidden="true">☰</span>
            <span className="sr-only"><Text message="Menu" /></span>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav id="mobile-nav" aria-label={t("Main")} className="site-nav-mobile border-t border-silver bg-white px-4 pb-4">
          <ul className="grid">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="flex min-h-12 items-center border-b border-ice font-semibold no-underline" aria-current={n.match(pathname) ? "page" : undefined}>
                  <Label>{n.label}</Label>
                </Link>
              </li>
            ))}
            {!user && <li><Link href={`/signup?next=${next}`} className="btn btn-primary my-3"><Text message="Create account" /></Link></li>}
            {!user && (
              <li>
                <Link href={`/signin?next=${next}`} className="flex min-h-12 items-center font-semibold no-underline"><Text message="Sign in" /></Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
