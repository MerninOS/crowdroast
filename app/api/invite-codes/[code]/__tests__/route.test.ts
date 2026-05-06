import { describe, it, expect, vi, beforeEach } from "vitest";

type SelectResult = { data: unknown; error: unknown };

let nextResult: SelectResult = { data: null, error: null };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => nextResult,
        }),
      }),
    })),
  })),
}));

import { GET } from "../route";

function callGet(code: string) {
  return GET(new Request(`http://localhost/api/invite-codes/${code}`), {
    params: Promise.resolve({ code }),
  });
}

beforeEach(() => {
  nextResult = { data: null, error: null };
});

describe("GET /api/invite-codes/[code]", () => {
  it("404 when code does not exist", async () => {
    nextResult = { data: null, error: null };
    const res = await callGet("missing12");
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("invalid_or_revoked");
  });

  it("404 when code is revoked", async () => {
    nextResult = {
      data: {
        code: "revoked001",
        revoked_at: "2026-01-01T00:00:00Z",
        hub: { id: "hub-1", name: "Test Hub", city: "Austin" },
        inviter: { contact_name: "Alice" },
      },
      error: null,
    };
    const res = await callGet("revoked001");
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("invalid_or_revoked");
  });

  it("returns landing-page payload for a valid code", async () => {
    nextResult = {
      data: {
        code: "validabc01",
        revoked_at: null,
        hub: { id: "hub-1", name: "Test Hub", city: "Austin" },
        inviter: { contact_name: "Alice" },
      },
      error: null,
    };
    const res = await callGet("validabc01");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      code: "validabc01",
      inviterName: "Alice",
      hubId: "hub-1",
      hubName: "Test Hub",
      hubCity: "Austin",
    });
  });

  it("404 when hub has been hard-deleted (defensive)", async () => {
    nextResult = {
      data: {
        code: "orphancode",
        revoked_at: null,
        hub: null,
        inviter: { contact_name: "Alice" },
      },
      error: null,
    };
    const res = await callGet("orphancode");
    expect(res.status).toBe(404);
  });

  it("500 on database error", async () => {
    nextResult = { data: null, error: { message: "boom" } };
    const res = await callGet("anycode001");
    expect(res.status).toBe(500);
  });
});
