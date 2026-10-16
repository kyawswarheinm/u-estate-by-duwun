"use client";

// Tenant budget check. Code does the arithmetic; the share-of-income guideline is a rule of thumb the user can change,
// not a landlord requirement, and the result says nothing about whether a lease will be approved.
import { useId, useState } from "react";
import { formatMoney } from "@/i18n";
import { useI18n } from "@/i18n/provider";
import { rentAffordability } from "@/lib/market-search";

const DEFAULT_GUIDELINE_PCT = 30;

const n = (v: string) => {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : 0;
};

export function RentAffordability({ defaultRent }: { defaultRent: number }) {
  const { t, locale, currency } = useI18n();
  const id = useId();
  const [income, setIncome] = useState("");
  const [rent, setRent] = useState(String(defaultRent));
  const [deposit, setDeposit] = useState("2");
  const [advance, setAdvance] = useState("1");
  const [utilities, setUtilities] = useState("");
  const [guideline, setGuideline] = useState(String(DEFAULT_GUIDELINE_PCT));
  const money = (thb: number) => formatMoney(thb, locale, currency);
  const r = rentAffordability({ income: n(income), rent: n(rent), depositMonths: n(deposit), advanceMonths: n(advance), utilities: n(utilities), guidelinePct: n(guideline) || DEFAULT_GUIDELINE_PCT });

  const field = (key: string, label: string, value: string, set: (v: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field-label" htmlFor={`${id}-${key}`}>
      {label}
      <input id={`${id}-${key}`} type="number" inputMode="decimal" min={0} value={value} onChange={(e) => set(e.target.value)} className="input" {...props} />
    </label>
  );

  return (
    <section aria-labelledby={`${id}-title`} className="surface-card grid gap-5 p-6">
      <div>
        <h2 id={`${id}-title`} className="section-title">{t("Rent affordability")}</h2>
        <p className="lead mt-1">{t("See what a rent means for your monthly budget and move-in costs.")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {field("income", t("Monthly income (THB)"), income, setIncome, { placeholder: "50000" })}
        {field("rent", t("Monthly rent (THB)"), rent, setRent)}
        {field("utilities", t("Estimated utilities per month (THB)"), utilities, setUtilities, { placeholder: "2000" })}
        {field("deposit", t("Security deposit (months of rent)"), deposit, setDeposit, { step: 0.5, max: 12 })}
        {field("advance", t("Advance rent (months)"), advance, setAdvance, { step: 1, max: 12 })}
        {field("guideline", t("Guideline: rent as % of income"), guideline, setGuideline, { min: 1, max: 100 })}
      </div>
      <dl className="grid gap-3 sm:grid-cols-3" aria-live="polite">
        <div className="stat-tile">
          <dt>{t("Rent as a share of income")}</dt>
          <dd className="price">{r.rentSharePct === null ? "—" : `${r.rentSharePct}%`}</dd>
          {r.withinGuideline !== null && (
            <dd className={`caption font-semibold ${r.withinGuideline ? "text-teal" : "text-amber"}`}>
              {r.withinGuideline ? `✓ ${t("Within your {pct}% guideline", { pct: n(guideline) || DEFAULT_GUIDELINE_PCT })}` : `! ${t("Above your {pct}% guideline", { pct: n(guideline) || DEFAULT_GUIDELINE_PCT })}`}
            </dd>
          )}
          {n(income) > 0 && <dd className="caption">{t("Guideline rent: up to {amount}", { amount: money(r.guidelineRentThb) })}</dd>}
        </div>
        <div className="stat-tile">
          <dt>{t("Estimated move-in cost")}</dt>
          <dd className="price">{money(r.moveInThb)}</dd>
          <dd className="caption">{t("Deposit plus advance rent")}</dd>
        </div>
        <div className="stat-tile">
          <dt>{t("Estimated monthly housing cost")}</dt>
          <dd className="price">{money(r.monthlyThb)}</dd>
          <dd className="caption">{t("Rent plus utilities")}</dd>
        </div>
      </dl>
      <p className="caption">{t("The guideline is a common rule of thumb, not a universal rule. Landlords set their own deposit, advance and approval terms; this is not a promise that you will qualify for a lease.")}</p>
    </section>
  );
}
