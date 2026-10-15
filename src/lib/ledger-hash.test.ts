import { describe, expect, it } from "vitest";
import { anchorMessage, canonicalJson, GENESIS_HASH, hashChain, headHash, parseAnchorMessage } from "./ledger-hash";
import type { LedgerEntry } from "./types";

const entry = (id: number, details: string, amountThb?: number): LedgerEntry => ({
  id, createdAt: `2026-10-15T10:0${id}:00.000Z`, userId: "u-somchai", entryType: "commit_test_funds", amountThb, details, isSimulated: true,
});

describe("ledger hash chain (A1)", () => {
  it("canonical JSON ignores key order and undefined fields", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: undefined } })).toBe('{"a":{"d":2},"b":1}');
    expect(canonicalJson({ a: { d: 2 }, b: 1 })).toBe(canonicalJson({ b: 1, a: { d: 2 } }));
  });

  it("is deterministic and chains every entry", () => {
    const entries = [entry(1, "first", 1000), entry(2, "second", 2000)];
    const a = hashChain(entries);
    const b = hashChain([...entries].reverse());
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
    expect(a[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a[0].hash).not.toBe(a[1].hash);
  });

  it("detects an edited old entry (every later hash changes)", () => {
    const original = [entry(1, "first", 1000), entry(2, "second", 2000), entry(3, "third")];
    const tampered = [entry(1, "first", 9000), entry(2, "second", 2000), entry(3, "third")];
    expect(headHash(tampered, 3).hash).not.toBe(headHash(original, 3).hash);
    expect(headHash(original, 3).count).toBe(3);
  });

  it("head up to an id ignores newer entries, so old anchors stay verifiable", () => {
    const two = [entry(1, "first"), entry(2, "second")];
    const three = [...two, entry(3, "third")];
    expect(headHash(three, 2)).toEqual(headHash(two, 2));
    expect(headHash([], 5)).toEqual({ hash: GENESIS_HASH, count: 0 });
  });

  it("anchor message round-trips", () => {
    const h = headHash([entry(1, "x")], 1);
    const msg = anchorMessage(1, h.count, h.hash);
    expect(parseAnchorMessage(msg)).toEqual({ upToId: 1, count: 1, hash: h.hash });
    expect(parseAnchorMessage("something else")).toBeNull();
  });
});
