import { describe, expect, it } from "vitest";
import { describeContext, PAGE_KINDS, PAGE_QUESTION_SETS, pageKindFor, pickQuestion, questionsFor, QUESTION_SETS, toHistory } from "./upal";
import { UPAL_COPY, UPAL_UI } from "../i18n/upal";
import { LOCALES } from "../lib/locale";

describe("U-Pal page awareness", () => {
  it("maps routes to page kinds", () => {
    expect(pageKindFor("/")).toBe("home");
    expect(pageKindFor("/market")).toBe("market");
    expect(pageKindFor("/market?district=Sathorn")).toBe("market");
    expect(pageKindFor("/sell/")).toBe("sell");
    expect(pageKindFor("/listing/l-condo")).toBe("listing");
    expect(pageKindFor("/listing/l-condo/offers")).toBe("listing");
    expect(pageKindFor("/ledger")).toBe("ledger");
    expect(pageKindFor("/assistant")).toBe("assistant");
    expect(pageKindFor("/account/wallet")).toBe("wallet");
    expect(pageKindFor("/account")).toBe("dashboard");
    expect(pageKindFor("/account/properties")).toBe("dashboard");
    expect(pageKindFor("/coinvest")).toBe("coinvest");
    expect(pageKindFor("/coinvest/ci-lumpini")).toBe("coinvest");
    expect(pageKindFor("/premium")).toBe("coinvest");
    expect(pageKindFor("/cobuy/g-1")).toBe("cobuy");
    expect(pageKindFor("/listing")).toBe("other");
  });

  it("has a greeting, 2-3 suggestions and widget text for every page kind in every language", () => {
    for (const locale of LOCALES) {
      for (const kind of PAGE_KINDS) {
        expect(UPAL_COPY[locale].greeting[kind].trim(), `${locale} ${kind}`).not.toBe("");
        expect(UPAL_COPY[locale].suggestions[kind].length, `${locale} ${kind}`).toBeGreaterThanOrEqual(2);
        expect(UPAL_COPY[locale].suggestions[kind].length, `${locale} ${kind}`).toBeLessThanOrEqual(3);
      }
      expect(Object.keys(UPAL_UI[locale]).sort()).toEqual(Object.keys(UPAL_UI.en).sort());
    }
  });

  it("has the same contextual question sets in every language, with the same audiences", () => {
    for (const locale of LOCALES) {
      expect(Object.keys(UPAL_COPY[locale].questions).sort()).toEqual([...QUESTION_SETS].sort());
      for (const set of QUESTION_SETS) {
        const en = UPAL_COPY.en.questions[set], here = UPAL_COPY[locale].questions[set];
        expect(here.length, `${locale} ${set}`).toBe(en.length);
        here.forEach((q, i) => {
          expect(q.q.trim(), `${locale} ${set} ${i}`).not.toBe("");
          expect(q.for ?? null, `${locale} ${set} ${i}`).toEqual(en[i].for ?? null);
        });
      }
    }
  });

  it("offers every user at least one question on every page that has a bubble, and never a premium-only one to others", () => {
    for (const locale of LOCALES) {
      for (const kind of PAGE_KINDS) {
        for (const tier of ["guest", "standard", "premium"] as const) {
          const list = questionsFor(UPAL_COPY[locale].questions, kind, tier);
          if (PAGE_QUESTION_SETS[kind].length) expect(list.length, `${locale} ${kind} ${tier}`).toBeGreaterThan(0);
          else expect(list).toEqual([]);
        }
      }
    }
    const premiumOnly = UPAL_COPY.en.questions.coinvest.filter((q) => q.for?.length === 1 && q.for[0] === "premium").map((q) => q.q);
    expect(questionsFor(UPAL_COPY.en.questions, "coinvest", "guest").some((q) => premiumOnly.includes(q))).toBe(false);
    expect(questionsFor(UPAL_COPY.en.questions, "coinvest", "premium").some((q) => premiumOnly.includes(q))).toBe(true);
    // The market page draws on listings, map and analytics questions.
    expect(questionsFor(UPAL_COPY.en.questions, "market", "guest")).toEqual([...UPAL_COPY.en.questions.listings, ...UPAL_COPY.en.questions.map, ...UPAL_COPY.en.questions.analytics].map((q) => q.q));
  });

  it("rotates questions so a page never repeats the one it showed last", () => {
    const list = ["a", "b", "c"];
    expect(pickQuestion(list, null)).toBe("a");
    expect(pickQuestion(list, "a")).toBe("b");
    expect(pickQuestion(list, "c")).toBe("a");
    expect(pickQuestion(list, "gone")).toBe("a");
    expect(pickQuestion(["only"], "only")).toBe("only");
    expect(pickQuestion([], null)).toBeNull();
  });

  it("builds a valid chat history: no empty or error turns, alternating roles, user first, at most 20", () => {
    expect(
      toHistory([
        { role: "assistant", content: "Hi from voice" },
        { role: "user", content: "a" },
        { role: "user", content: "b" },
        { role: "assistant", content: "" },
        { role: "assistant", content: "AI is busy", error: true },
        { role: "assistant", content: "answer" },
      ]),
    ).toEqual([
      { role: "user", content: "a\nb" },
      { role: "assistant", content: "answer" },
    ]);
    const long = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}` }));
    const h = toHistory(long);
    expect(h.length).toBeLessThanOrEqual(20);
    expect(h[0].role).toBe("user");
  });

  it("describes the page for the assistant without inventing anything", () => {
    expect(describeContext({ kind: "listing", path: "/listing/l-condo", facts: { listing_id: "l-condo" } })).toBe(
      'The user is viewing /listing/l-condo (listing page). On screen: {"listing_id":"l-condo"}',
    );
    expect(describeContext({ kind: "home", path: "/" })).toBe("The user is viewing / (home page).");
  });
});
