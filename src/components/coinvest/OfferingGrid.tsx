import Link from "next/link";
import { formatMoneyRef, translateLabel, type Currency } from "@/i18n";
import { getTranslations } from "@/i18n/server";
import type { Locale } from "@/lib/locale";
import type { OfferingView } from "@/lib/coinvest/view";

/** Co-Invest opportunities as cards: what it is, the unit price, funding progress and one action. */
export async function OfferingGrid({ views, locale, currency, premium }: { views: OfferingView[]; locale: Locale; currency: Currency; premium: boolean }) {
  const t = await getTranslations();
  const money = (v: number) => formatMoneyRef(v, locale, currency);
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {views.map(({ offering: o, property: p, unitPriceThb, soldPct, holders, changePct, poolUnits }) => (
        <li key={o.id} className="listing-card grid content-start gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className={`pill ${o.status === "funding" ? "bg-amber-soft text-amber" : "bg-teal-soft text-teal"}`}>
              <span aria-hidden="true">{o.status === "funding" ? "◔" : "✓"}</span> {o.status === "funding" ? t("Funding") : t("Funded")}
            </span>
            <span className="pill bg-ice text-deep">{translateLabel(locale, p.type)}</span>
            <span className="pill bg-ice text-deep">SAMPLE</span>
          </div>
          <h3 className="card-title"><bdi>{p.title}</bdi></h3>
          <p className="text-sm text-deep"><bdi>{p.district}, {p.province}</bdi> · {p.areaSqm} m²</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-deep">{o.status === "funding" ? t("Funding price per unit") : t("Unit value now")}</dt><dd className="font-semibold tabular-nums">{money(unitPriceThb)}</dd></div>
            <div>
              <dt className="text-deep">{o.status === "funding" ? t("Target") : t("Value since funding")}</dt>
              <dd className="font-semibold tabular-nums">{o.status === "funding" ? money(o.targetThb) : `${changePct >= 0 ? "+" : "−"}${Math.abs(changePct)}%`}</dd>
            </div>
          </dl>
          <div className="grid gap-1">
            <div className="flex justify-between text-xs text-deep">
              <span>{o.status === "funding" ? t("{percent}% funded", { percent: soldPct }) : t("{count} units available from the pool", { count: poolUnits })}</span>
              {holders !== null && <span>{t("{count} co-owners", { count: holders })}</span>}
            </div>
            <progress className="coinvest-progress" max={100} value={soldPct} aria-label={t("{percent}% funded", { percent: soldPct })} />
          </div>
          <Link href={`/coinvest/${o.code}`} className={`btn ${premium ? "btn-primary" : "btn-secondary"} justify-self-start`}>
            {premium ? t("View and invest") : t("Preview")}
          </Link>
        </li>
      ))}
    </ul>
  );
}
