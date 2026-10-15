import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  set: vi.fn(), revalidate: vi.fn(), currentUser: vi.fn(), updateDb: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../lib/session", () => ({ currentUser: mocks.currentUser }));
vi.mock("../lib/store", () => ({ updateDb: mocks.updateDb }));
import { savePreferences } from "./actions";

const form = (locale: string, currency = "THB") => {
  const data = new FormData(); data.set("locale", locale); data.set("currency", currency); return data;
};
describe("locale preference persistence", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.currentUser.mockResolvedValue(null); });
  it("persists guest preferences without touching a profile", async () => {
    await savePreferences(form("ar", "USD"));
    expect(mocks.updateDb).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledWith("locale", "ar", expect.objectContaining({ path: "/", httpOnly: true, sameSite: "lax" }));
    expect(mocks.set).toHaveBeenCalledWith("currency", "USD", expect.any(Object));
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("only updates the server-resolved owner, ignoring a submitted user id", async () => {
    mocks.currentUser.mockResolvedValue({ id: "owner" });
    const db = { profiles: [{ id: "owner", locale: "en" }, { id: "other", locale: "en" }] };
    mocks.updateDb.mockImplementation(async (change) => change(db));
    const data = form("th"); data.set("userId", "other");
    await savePreferences(data);
    expect(db.profiles).toEqual([{ id: "owner", locale: "th" }, { id: "other", locale: "en" }]);
  });
  it("rejects unsupported preferences before any mutation", async () => {
    for (const data of [form("xx"), form("__proto__"), form("en", "BTC")]) {
      await expect(savePreferences(data)).rejects.toThrow("Invalid preferences");
    }
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.updateDb).not.toHaveBeenCalled();
  });
});
