// Test-money wallet (D-40). Pure, unit-tested. No real money, no bank details, no crypto.
// Movements are signed: grants, top-ups, Co-Invest sales and refunds add; the premium fee and unit purchases subtract.
// Available = every movement − money committed to co-buy groups that are not cancelled (a hold, not a movement).
import type { DB, WalletKind } from "./types";

export const WALLET = {
  signupGrantThb: 5_000_000,
  topUpThb: 1_000_000,
  maxTotalThb: 20_000_000, // ceiling on grants + top-ups per account (keeps the demo tidy); spending never raises it
} as const;

export const MONEY_IN: readonly WalletKind[] = ["demo_grant", "top_up", "share_sale", "refund"];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function walletSummary(db: Pick<DB, "walletTxns" | "cobuyParticipants" | "cobuyGroups">, userId: string) {
  const mine = db.walletTxns.filter((t) => t.userId === userId);
  const funded = mine.filter((t) => t.kind === "demo_grant" || t.kind === "top_up").reduce((s, t) => s + t.amountThb, 0);
  const net = mine.reduce((s, t) => s + t.amountThb, 0);
  const spent = -mine.filter((t) => t.amountThb < 0).reduce((s, t) => s + t.amountThb, 0);
  const received = mine.filter((t) => t.kind === "share_sale" || t.kind === "refund").reduce((s, t) => s + t.amountThb, 0);
  const activeGroups = new Set(db.cobuyGroups.filter((g) => g.status !== "cancelled").map((g) => g.id));
  const commitments = db.cobuyParticipants.filter((p) => p.userId === userId && activeGroups.has(p.groupId));
  const committed = commitments.reduce((s, p) => s + p.amountThb, 0);
  return { fundedThb: funded, spentThb: round2(spent), receivedThb: round2(received), committedThb: committed, availableThb: round2(net - committed), commitments };
}

/** Wallet checks before a co-buy commitment. Co-buy legal rules stay in rules.ts (validateJoin). */
export function checkCommitment(available: number, amountThb: number, maxCommitThb?: number) {
  const errors: string[] = [];
  if (amountThb > available) errors.push(`Not enough test money in your wallet: ฿${available.toLocaleString("en-US")} available. Add test money on the Wallet page.`);
  if (maxCommitThb && amountThb > maxCommitThb) errors.push(`Your wallet setting allows at most ฿${maxCommitThb.toLocaleString("en-US")} per commitment. Change it on the Wallet page.`);
  return errors;
}

export function canTopUp(fundedThb: number) {
  return fundedThb + WALLET.topUpThb <= WALLET.maxTotalThb;
}
