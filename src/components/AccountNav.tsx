"use client";
import { useI18n } from "@/i18n/provider";
import { Label } from "@/i18n/Text";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/account", label: "Overview" },
  { href: "/account/properties", label: "My properties" },
  { href: "/account/wallet", label: "Wallet" },
  { href: "/account/settings", label: "Account settings" },
];

export function AccountNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <nav aria-label={t("Account")}>
      <ul className="flex gap-1 overflow-x-auto lg:grid">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-[10px] px-3 font-semibold no-underline ${active ? "bg-paper text-midnight shadow-sm ring-1 ring-silver" : "text-deep hover:bg-paper/70"}`}
              >
                <Label>{l.label}</Label>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
