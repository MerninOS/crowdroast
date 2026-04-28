import { describe, expect, it, vi } from "vitest";
import { recycleLot } from "../recycle-lot";

type RpcCall = { fn: string; args: unknown };

function buildAdminClient(rpcResult: { data: unknown; error: unknown }) {
  const calls: RpcCall[] = [];
  const admin = {
    rpc: vi.fn((fn: string, args: unknown) => {
      calls.push({ fn, args });
      return Promise.resolve(rpcResult);
    }),
  } as unknown as Parameters<typeof recycleLot>[0];
  return { admin, calls };
}

describe("recycleLot", () => {
  it("invokes recycle_lot rpc with the lot id and returns ok", async () => {
    const { admin, calls } = buildAdminClient({ data: null, error: null });

    const result = await recycleLot(admin, "lot-123");

    expect(calls).toEqual([
      { fn: "recycle_lot", args: { p_lot_id: "lot-123" } },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("returns a tagged failure with structured Postgres error metadata", async () => {
    const { admin } = buildAdminClient({
      data: null,
      error: { message: "permission denied", code: "42501", hint: "check grants" },
    });

    const result = await recycleLot(admin, "lot-123");

    expect(result).toEqual({
      ok: false,
      error: "42501 — permission denied — check grants",
    });
  });

  it("falls back to a generic error message when the rpc error has no fields", async () => {
    const { admin } = buildAdminClient({ data: null, error: {} });

    const result = await recycleLot(admin, "lot-123");

    expect(result).toEqual({ ok: false, error: "recycle_lot rpc failed" });
  });
});
