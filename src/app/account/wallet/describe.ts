import type { getTranslations } from "@/i18n/server";
import type { DB, WalletTxn } from "@/lib/types";

export const KIND_LABEL = {
  demo_grant: "Welcome test money", top_up: "Top-up", premium_fee: "Premium upgrade", share_purchase: "Co-Invest purchase", share_sale: "Co-Invest sale", refund: "Refund",
} as const;

/** A translated description built from the record (the stored note stays in English for the audit trail). */
export function describeTxn(x: WalletTxn, db: Pick<DB, "coinvestTrades" | "coinvestOfferings" | "properties">, t: Awaited<ReturnType<typeof getTranslations>>) {
  const trade = x.tradeId ? db.coinvestTrades.find((r) => r.id === x.tradeId) : undefined;
  const offering = x.offeringId ? db.coinvestOfferings.find((o) => o.id === x.offeringId) : undefined;
  const title = offering ? db.properties.find((p) => p.id === offering.propertyId)?.title ?? "" : "";
  const count = trade?.units ?? 0;
  switch (x.kind) {
    case "share_purchase": return t("Bought {count} Co-Invest units: {title}", { count, title });
    case "share_sale": return t("Sold {count} Co-Invest units to the U-Estate pool: {title}", { count, title });
    case "refund": return t("Withdrew {count} units during funding, refunded: {title}", { count, title });
    case "premium_fee": return t("Premium upgrade, one-time demo fee");
    case "top_up": return t("Test money added (demo)");
    default: return t("Welcome test money (demo)");
  }
}

