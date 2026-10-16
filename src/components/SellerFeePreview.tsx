"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { formatMoney } from "@/i18n";
import { agentSaleFee, sellerFee } from "@/lib/rules";

export function SellerFeePreview() {
  const { t, locale, currency } = useI18n();
  const [price, setPrice] = useState("4000000");
  const amount = Number(price);
  const valid = price !== "" && Number.isFinite(amount) && amount > 0 && amount <= 1e12;
  const money = (value: number) => formatMoney(value, locale, currency);
  return <section className="panel grid gap-6 bg-ice p-6 sm:p-8 lg:grid-cols-2">
    <div><h2 className="text-2xl font-semibold">{t("Same facts. Same fees. For every party.")}</h2>
      <label className="field mt-5 max-w-sm"><span>{t("feePrice")}</span><input className="input" type="number" min="1" max="1000000000000" step="1" value={price} onChange={e => setPrice(e.target.value)} /></label>
      <p className="mt-4 text-xs text-muted">{t("Excludes government transfer fees and taxes. Typical agent fee is common market practice, not a quote.")}</p>
    </div>
    <dl className="grid content-center gap-4" aria-live="polite">
      {([
        ["Typical agent (3%)", valid ? agentSaleFee(amount) : 0],
        ["U-Estate seller fee (1.5%)", valid ? sellerFee(amount, false) : 0],
        ["U-topia member (0.75%)", valid ? sellerFee(amount, true) : 0],
        ["Buyer pays U-Estate", 0],
      ] as const).map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 border-b border-line pb-3"><dt className="text-sm text-muted">{t(label)}</dt><dd className="font-semibold">{valid ? money(value) : "—"}</dd></div>)}
    </dl>
  </section>;
}
