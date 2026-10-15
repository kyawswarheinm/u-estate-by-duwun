import { describe, expect, it } from "vitest";
import { ChangePasswordSchema, hashPassword, initials, isRealInbox, safeNext, SignUpSchema, verifyPassword } from "./auth-rules";
import { checkCommitment, walletSummary } from "./wallet";

describe("demo accounts (D-39)", () => {
  it("stores only a salted hash and verifies the right password", () => {
    const h = hashPassword("correct horse");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h).not.toContain("correct horse");
    expect(hashPassword("correct horse")).not.toBe(h); // new salt each time
    expect(verifyPassword("correct horse", h)).toBe(true);
    expect(verifyPassword("wrong horse", h)).toBe(false);
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
  });

  it("accepts made-up emails and refuses real inboxes", () => {
    const ok = SignUpSchema.safeParse({ name: "Any", email: "Anythings@Example.com", password: "12345678", nationality: "Thai" });
    expect(ok.success && ok.data.email).toBe("anythings@example.com");
    expect(isRealInbox("someone@gmail.com")).toBe(true);
    const bad = SignUpSchema.safeParse({ name: "Any", email: "someone@gmail.com", password: "12345678", nationality: "Thai" });
    expect(bad.success).toBe(false);
  });

  it("checks password length and confirmation", () => {
    expect(SignUpSchema.safeParse({ name: "A", email: "a@example.com", password: "short", nationality: "Thai" }).success).toBe(false);
    expect(ChangePasswordSchema.safeParse({ current: "x", next: "longenough", confirm: "different" }).success).toBe(false);
    expect(ChangePasswordSchema.safeParse({ current: "x", next: "longenough", confirm: "longenough" }).success).toBe(true);
  });

  it("only redirects to same-site paths", () => {
    expect(safeNext("/sell")).toBe("/sell");
    expect(safeNext("//evil.example")).toBe("/account");
    expect(safeNext("https://evil.example")).toBe("/account");
    expect(initials("Khun Malee")).toBe("KM");
  });
});

describe("test-money wallet (D-40)", () => {
  const db = {
    walletTxns: [
      { id: "w1", userId: "u1", kind: "demo_grant" as const, amountThb: 5_000_000, note: "", createdAt: "" },
      { id: "w2", userId: "u1", kind: "top_up" as const, amountThb: 1_000_000, note: "", createdAt: "" },
    ],
    cobuyGroups: [
      { id: "g1", listingId: "l", targetThb: 4_000_000, deadline: "", status: "forming" as const, createdBy: "u1", createdAt: "" },
      { id: "g2", listingId: "l2", targetThb: 4_000_000, deadline: "", status: "cancelled" as const, createdBy: "u1", createdAt: "" },
    ],
    cobuyParticipants: [
      { id: "p1", groupId: "g1", userId: "u1", lane: "co_owner" as const, amountThb: 1_500_000, fetRequired: false, joinedAt: "" },
      { id: "p2", groupId: "g2", userId: "u1", lane: "co_owner" as const, amountThb: 900_000, fetRequired: false, joinedAt: "" },
    ],
  };

  it("subtracts commitments in active groups only", () => {
    expect(walletSummary(db, "u1")).toMatchObject({ fundedThb: 6_000_000, committedThb: 1_500_000, availableThb: 4_500_000 });
  });

  it("blocks commitments over the balance or the per-commitment limit", () => {
    expect(checkCommitment(1_000_000, 2_000_000)).toHaveLength(1);
    expect(checkCommitment(5_000_000, 2_000_000, 1_000_000)).toHaveLength(1);
    expect(checkCommitment(5_000_000, 1_000_000, 2_000_000)).toEqual([]);
  });
});
