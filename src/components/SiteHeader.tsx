"use client";
import { CurrencyMenu, LanguageMenu, ThemeMenu, useSystemThemeSync } from "./preferences/PreferenceMenus";
import type { ThemePref } from "@/lib/theme";
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
      {inverse ? (
        <Image src="/brand/u-estate-mark-white.png" alt="" width={26} height={32} />
      ) : (
        <>
          {/* The navy mark disappears on a dark header, so dark mode shows the white mark. */}
          <Image src="/brand/u-estate-mark-midnight.png" alt="" width={26} height={32} priority className="dark:hidden" />
          <Image src="/brand/u-estate-mark-white.png" alt="" width={26} height={32} className="hidden dark:block" />
        </>
      )}
      U-Estate
    </span>
  );
}

export function SiteHeader({ user, demoMode, signOutAction, notifications, themePref: initialThemePref }: { notifications?: React.ReactNode; user: HeaderUser; demoMode: boolean; signOutAction: () => Promise<void>; themePref: ThemePref }) {
  const { t } = useI18n();
  const [themePref, setThemePref] = useState<ThemePref>(initialThemePref);
  useSystemThemeSync(themePref);
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false); // account menu
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDialogElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = mobileRef.current;
    if (!dialog) return;
    if (!mobileOpen) { dialog.close(); return; }
    dialog.showModal();
    const trigger = mobileTrigger.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const wide = window.matchMedia("(min-width: 1152px)");
    const closeOnWide = () => { if (wide.matches) setMobileOpen(false); };
    wide.addEventListener("change", closeOnWide);
    return () => {
      document.body.style.overflow = previous;
      wide.removeEventListener("change", closeOnWide);
      dialog.close();
      trigger?.focus({ preventScroll: true });
    };
  }, [mobileOpen]);

  // Close menus on navigation (reset during render, the React-recommended pattern), outside click and Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
    setMobileOpen(false);
  }
  useEffect(() => {
    if (!menuOpen && !mobileOpen) return;
    const onClick = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !mobileOpen) { setMenuOpen(false); menuRef.current?.querySelector("button")?.focus(); } };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, mobileOpen]);

  const onAuthPage = pathname.startsWith("/signin") || pathname.startsWith("/signup");
  const next = encodeURIComponent(onAuthPage ? "/account" : pathname || "/");

  return (
    <header className="site-header sticky top-0 z-[var(--z-header)] border-b border-silver bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
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
          <div className="hidden items-center gap-1.5 sm:flex">
            <LanguageMenu />
            <CurrencyMenu />
            <ThemeMenu pref={themePref} onChange={setThemePref} />
          </div>
          {notifications}
          {user ? (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => { setMenuOpen((o) => !o); setMobileOpen(false); }}
                aria-expanded={menuOpen}
                aria-controls="account-menu"
                aria-label={`${t("Account menu")}: ${user.name}`}
                className="flex min-h-11 items-center gap-2 rounded-full border border-silver bg-paper py-1 ps-1 pe-3 hover:border-deep"
              >
                <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-midnight text-sm font-bold text-ice">{user.initials}</span>
                <span className="hidden max-w-32 truncate text-start leading-tight 2xl:block">
                  <span className="block text-sm font-semibold">{user.name}</span>
                  <span className="block text-xs text-muted"><Money amount={user.availableThb} /> <Text message="test money" /></span>
                </span>
              </button>
              {menuOpen && (
                <div id="account-menu" className="account-menu absolute end-0 top-[calc(100%+8px)] w-72 rounded-[14px] border border-silver bg-paper p-2 shadow-[var(--shadow)]">
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
            ref={mobileTrigger}
            type="button"
            className="btn btn-secondary px-3 site-nav-toggle"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => { setMobileOpen((o) => !o); setMenuOpen(false); }}
          >
            <span aria-hidden="true">☰</span>
            <span className="sr-only"><Text message="Menu" /></span>
          </button>
        </div>
      </div>

      <dialog ref={mobileRef} className="mobile-menu" aria-label={t("Menu")} onCancel={() => setMobileOpen(false)} onClick={(e) => { if (e.target === e.currentTarget) setMobileOpen(false); }}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
          const first = controls[0], last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }}>
        <div className="mobile-menu-heading">
          <Logo />
          <button type="button" className="btn btn-secondary" onClick={() => setMobileOpen(false)}>{t("Close")}</button>
        </div>
        <nav id="mobile-nav" aria-label={t("Main")} className="px-4 pb-4" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setMobileOpen(false); }}>
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
          <section aria-label={t("Preferences")} className="mt-2 grid gap-2 border-t border-silver pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("Preferences")}</p>
            <LanguageMenu block />
            <CurrencyMenu block />
            <ThemeMenu block pref={themePref} onChange={setThemePref} />
          </section>
        </nav>
      </dialog>
    </header>
  );
}
