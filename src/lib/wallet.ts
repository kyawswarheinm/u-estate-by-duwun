// Test-money wallet (D-40). Pure, unit-tested. No real money, no bank details, no crypto.
// Balance = grants + top-ups − money committed to co-buy groups that are not cancelled.
import type { DB } from "./types";

export const WALLET = {
  signupGrantThb: 5_000_000,
  topUpThb: 1_000_000,
  maxTotalThb: 20_000_000, // ceiling on grants + top-ups per account (keeps the demo tidy)
} as const;

export function walletSummary(db: Pick<DB, "walletTxns" | "cobuyParticipants" | "cobuyGroups">, userId: string) {
  const funded = db.walletTxns.filter((t) => t.userId === userId).reduce((s, t) => s + t.amountThb, 0);
  const activeGroups = new Set(db.cobuyGroups.filter((g) => g.status !== "cancelled").map((g) => g.id));
  const commitments = db.cobuyParticipants.filter((p) => p.userId === userId && activeGroups.has(p.groupId));
  const committed = commitments.reduce((s, p) => s + p.amountThb, 0);
  return { fundedThb: funded, committedThb: committed, availableThb: funded - committed, commitments };
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
