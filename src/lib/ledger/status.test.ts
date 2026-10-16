import { describe, expect, it } from "vitest";
import type { LedgerAnchor } from "../types";
import { anchorFor, confirmedAnchors, entryStatus, statusCounts } from "./status";

const anchor = (upTo: number, txHash = `0x${"ab".repeat(32)}`): LedgerAnchor => ({
  id: `a${upTo}`, upToEntryId: upTo, entryCount: upTo, headHash: "f".repeat(64), message: "m", chainId: 43113,
  network: "Avalanche Fuji C-Chain (testnet)", txHash, explorerUrl: `https://testnet.snowtrace.io/tx/${txHash}`, createdAt: "2026-10-16T00:00:00.000Z",
});

describe("ledger entry status", () => {
  it("is verified only when a confirmed anchor covers the entry", () => {
    const anchors = [anchor(3), anchor(7)];
    expect(entryStatus({ id: 2 }, anchors, "database")).toBe("verified");
    expect(entryStatus({ id: 7 }, anchors, "avalanche")).toBe("verified");
    expect(anchorFor(5, anchors)?.upToEntryId).toBe(7);
  });

  it("is pending while the network is available, and only recorded in fallback mode", () => {
    expect(entryStatus({ id: 8 }, [anchor(7)], "avalanche")).toBe("pending_anchor");
    expect(entryStatus({ id: 8 }, [anchor(7)], "database")).toBe("recorded");
    expect(entryStatus({ id: 1 }, [], "database")).toBe("recorded");
  });

  it("never treats an anchor without a real transaction hash as network evidence", () => {
    const fake = [anchor(10, "local-fingerprint-123"), { ...anchor(10), chainId: 1 }];
    expect(confirmedAnchors(fake)).toEqual([]);
    expect(entryStatus({ id: 3 }, fake, "avalanche")).toBe("pending_anchor");
  });

  it("counts entries by status", () => {
    expect(statusCounts([{ id: 1 }, { id: 2 }, { id: 3 }], [anchor(2)], "database")).toEqual({ verified: 2, pending_anchor: 0, recorded: 1 });
  });
});
