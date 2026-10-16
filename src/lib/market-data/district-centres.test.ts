import { describe, expect, it } from "vitest";
import { districtCentre, safeSourceUrl } from "./district-centres";

describe("market map helpers", () => {
  it("only lets http(s) source links through", () => {
    expect(safeSourceUrl("https://example.com/listing/1")).toBe("https://example.com/listing/1");
    expect(safeSourceUrl("http://example.com/a?b=1")).toBe("http://example.com/a?b=1");
    expect(safeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeSourceUrl("JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeSourceUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeSourceUrl("not a url")).toBeNull();
  });

  it("finds district centres case-insensitively and inside Thailand", () => {
    expect(districtCentre(" sathorn ")).toEqual(districtCentre("Sathorn"));
    expect(districtCentre("Atlantis")).toBeNull();
    const c = districtCentre("Bang Yai")!;
    expect(c.lat).toBeGreaterThan(5); expect(c.lat).toBeLessThan(21); expect(c.lng).toBeGreaterThan(97); expect(c.lng).toBeLessThan(106);
  });
});
