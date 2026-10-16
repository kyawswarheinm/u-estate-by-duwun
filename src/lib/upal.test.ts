import { describe, expect, it } from "vitest";
import { describeContext, PAGE_KINDS, pageKindFor, toHistory } from "./upal";
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
    expect(pageKindFor("/account/wallet")).toBe("other");
    expect(pageKindFor("/listing")).toBe("other");
  });

  it("has a greeting, 2-3 suggestions and widget text for every page kind in every language", () => {
    for (const locale of LOCALES) {
      for (const kind of PAGE_KINDS) {
        expect(UPAL_COPY[locale].greeting[kind].trim(), `${locale} ${kind}`).not.toBe("");
        expect(UPAL_COPY[locale].suggestions[kind].length, `${locale} ${kind}`).toBeGreaterThanOrEqual(2);
        expect(UPAL_COPY[locale].suggestions[kind].length, `${locale} ${kind}`).toBeLessThanOrEqual(3);
      }
      expect(Object.keys(UPAL_COPY[locale].invite).sort()).toEqual(Object.keys(UPAL_COPY.en.invite).sort());
      expect(Object.keys(UPAL_UI[locale]).sort()).toEqual(Object.keys(UPAL_UI.en).sort());
    }
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
