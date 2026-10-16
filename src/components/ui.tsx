"use client";
import { useI18n } from "@/i18n/provider";
import { translateLabel } from "@/i18n";
import { Label, Text } from "@/i18n/Text";
import type { VerificationStatus } from "@/lib/types";

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const map = {
    verified_sample: { icon: "✓", text: "Deed checked (sample)", cls: "bg-teal-soft text-teal" },
    needs_review: { icon: "!", text: "Needs human review", cls: "bg-amber-soft text-amber" },
    unverified: { icon: "?", text: "Not checked yet", cls: "bg-mist text-ink-soft" },
  }[status];
  return (
    <span className={`pill ${map.cls}`}>
      <span aria-hidden="true">{map.icon}</span> <Label>{map.text}</Label>
    </span>
  );
}

export function RiskIcon({ level }: { level: "ok" | "warning" | "unknown" }) {
  const { locale } = useI18n();
  const m = { ok: ["✓", "text-teal", "OK"], warning: ["!", "text-amber", "Warning"], unknown: ["?", "text-ink-soft", "Unknown"] }[level];
  return (
    <span className={`inline-block w-5 text-center font-bold ${m[1]}`} aria-label={translateLabel(locale, m[2])} role="img">
      {m[0]}
    </span>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`content-card rounded-[24px] border border-line bg-paper p-6 sm:p-8 ${className}`}>{children}</section>;
}

export function SampleTag() {
  return <span className="rounded bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber"><Text message="SAMPLE DATA" /></span>;
}
