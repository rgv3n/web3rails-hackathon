import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHeliusPage } from "../src/lib/helius";

const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

describe("Helius fetch (request shape)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for transactions of the wallet's token accounts, so receipts to its ATA are not missed", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: URL | string) => { urls.push(String(u)); return new Response("[]", { status: 200 }); }));
    await fetchHeliusPage("test-key", WALLET, { limit: 100, before: "sigB", until: "sigU" });
    const q = new URL(urls[0]).searchParams;
    expect(new URL(urls[0]).pathname).toBe(`/v0/addresses/${WALLET}/transactions`);
    expect(q.get("token-accounts")).toBe("balanceChanged");
    expect(q.get("limit")).toBe("100");
    expect(q.get("before")).toBe("sigB");
    expect(q.get("until")).toBe("sigU");
  });
});
