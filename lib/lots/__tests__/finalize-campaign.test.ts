import { describe, expect, it, vi } from "vitest";
import { finalizeCampaign } from "../finalize-campaign";

type RpcCall = { fn: string; args: unknown };

function buildAdminClient(rpcResult: { data: unknown; error: unknown }) {
  const calls: RpcCall[] = [];
  const admin = {
    rpc: vi.fn((fn: string, args: unknown) => {
      calls.push({ fn, args });
      return Promise.resolve(rpcResult);
    }),
  } as unknown as Parameters<typeof finalizeCampaign>[0];
  return { admin, calls };
}

describe("finalizeCampaign", () => {
  it("invokes finalize_campaign rpc with the campaign id and outcome", async () => {
    const { admin, calls } = buildAdminClient({ data: null, error: null });

    const result = await finalizeCampaign(admin, "camp-1", "settled");

    expect(calls).toEqual([
      {
        fn: "finalize_campaign",
        args: { p_campaign_id: "camp-1", p_outcome: "settled" },
      },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("forwards each terminal outcome verbatim", async () => {
    for (const outcome of ["settled", "failed", "cancelled"] as const) {
      const { admin, calls } = buildAdminClient({ data: null, error: null });
      await finalizeCampaign(admin, "camp-x", outcome);
      expect(calls[0].args).toMatchObject({ p_outcome: outcome });
    }
  });

  it("returns a tagged failure with structured Postgres error metadata", async () => {
    const { admin } = buildAdminClient({
      data: null,
      error: { message: "row locked", code: "55P03", hint: "try again" },
    });

    const result = await finalizeCampaign(admin, "camp-1", "settled");

    expect(result).toEqual({
      ok: false,
      error: "55P03 — row locked — try again",
    });
  });

  it("falls back to a generic error message when the rpc error has no fields", async () => {
    const { admin } = buildAdminClient({ data: null, error: {} });

    const result = await finalizeCampaign(admin, "camp-1", "failed");

    expect(result).toEqual({
      ok: false,
      error: "finalize_campaign rpc failed",
    });
  });
});
