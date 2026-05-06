import { describe, it, expect, vi, beforeEach } from "vitest";

type Result = { data: unknown; error: unknown };

let currentUser: { id: string } | null = null;
let serverFromQueue: Array<{ table: string; result: Result }> = [];
let adminFromQueue: Array<{ table: string; result: Result }> = [];
const adminInsertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const adminUpdateCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];

function makeChain(table: string, result: Result, sink: "server" | "admin") {
  let pendingPayload: Record<string, unknown> | null = null;
  let pendingOp: "select" | "insert" | "update" | null = null;
  const chain: Record<string, unknown> = {
    select: () => {
      pendingOp = "select";
      return chain;
    },
    insert: (payload: Record<string, unknown>) => {
      pendingOp = "insert";
      pendingPayload = payload;
      if (sink === "admin") adminInsertCalls.push({ table, payload });
      return chain;
    },
    update: (payload: Record<string, unknown>) => {
      pendingOp = "update";
      pendingPayload = payload;
      if (sink === "admin") adminUpdateCalls.push({ table, payload });
      return chain;
    },
    eq: () => chain,
    is: () => chain,
    maybeSingle: async () => result,
    then: (resolve: (v: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  void pendingOp;
  void pendingPayload;
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: currentUser } })) },
    from: vi.fn((table: string) => {
      const next = serverFromQueue.shift();
      if (!next) throw new Error(`Unexpected server.from(${table})`);
      return makeChain(table, next.result, "server");
    }),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const next = adminFromQueue.shift();
      if (!next) throw new Error(`Unexpected admin.from(${table})`);
      return makeChain(table, next.result, "admin");
    }),
  })),
}));

import { POST } from "../route";

function callAccept(code: string) {
  return POST(new Request(`http://localhost/api/invite-codes/${code}/accept`, { method: "POST" }), {
    params: Promise.resolve({ code }),
  });
}

beforeEach(() => {
  currentUser = null;
  serverFromQueue = [];
  adminFromQueue = [];
  adminInsertCalls.length = 0;
  adminUpdateCalls.length = 0;
});

describe("POST /api/invite-codes/[code]/accept", () => {
  it("401 unauthenticated", async () => {
    const res = await callAccept("anycode001");
    expect(res.status).toBe(401);
  });

  it("404 when invite is missing", async () => {
    currentUser = { id: "buyer-1" };
    adminFromQueue.push({ table: "invite_codes", result: { data: null, error: null } });
    const res = await callAccept("missing001");
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("invalid_or_revoked");
  });

  it("404 when invite is revoked", async () => {
    currentUser = { id: "buyer-1" };
    adminFromQueue.push({
      table: "invite_codes",
      result: {
        data: {
          inviter_user_id: "inviter-1",
          hub_id: "hub-1",
          revoked_at: "2026-01-01T00:00:00Z",
          hub: { name: "Test Hub" },
        },
        error: null,
      },
    });
    const res = await callAccept("revoked001");
    expect(res.status).toBe(404);
  });

  it("400 self-invite when caller is the inviter", async () => {
    currentUser = { id: "inviter-1" };
    adminFromQueue.push({
      table: "invite_codes",
      result: {
        data: {
          inviter_user_id: "inviter-1",
          hub_id: "hub-1",
          revoked_at: null,
          hub: { name: "Test Hub" },
        },
        error: null,
      },
    });
    const res = await callAccept("selfcode01");
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("self_invite_not_allowed");
    expect(adminInsertCalls.length).toBe(0);
  });

  it("200 already_member when caller is active in this hub", async () => {
    currentUser = { id: "buyer-1" };
    adminFromQueue.push({
      table: "invite_codes",
      result: {
        data: {
          inviter_user_id: "inviter-1",
          hub_id: "hub-1",
          revoked_at: null,
          hub: { name: "Test Hub" },
        },
        error: null,
      },
    });
    adminFromQueue.push({
      table: "hub_members",
      result: {
        data: { hub_id: "hub-1", hub: { name: "Test Hub" } },
        error: null,
      },
    });
    const res = await callAccept("samehubcd1");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.already_member).toBe(true);
    expect(adminInsertCalls.length).toBe(0);
  });

  it("409 different_hub_active when caller is in another hub", async () => {
    currentUser = { id: "buyer-1" };
    adminFromQueue.push({
      table: "invite_codes",
      result: {
        data: {
          inviter_user_id: "inviter-1",
          hub_id: "hub-1",
          revoked_at: null,
          hub: { name: "Test Hub" },
        },
        error: null,
      },
    });
    adminFromQueue.push({
      table: "hub_members",
      result: {
        data: { hub_id: "hub-2", hub: { name: "Other Hub" } },
        error: null,
      },
    });
    const res = await callAccept("diffhubcd1");
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe("different_hub_active");
    expect(body.currentHubName).toBe("Other Hub");
    expect(adminInsertCalls.length).toBe(0);
  });

  it("inserts membership and stamps profile attribution when hubless", async () => {
    currentUser = { id: "buyer-1" };
    adminFromQueue.push({
      table: "invite_codes",
      result: {
        data: {
          inviter_user_id: "inviter-1",
          hub_id: "hub-1",
          revoked_at: null,
          hub: { name: "Test Hub" },
        },
        error: null,
      },
    });
    adminFromQueue.push({ table: "hub_members", result: { data: null, error: null } });
    adminFromQueue.push({ table: "hub_members", result: { data: null, error: null } }); // insert
    adminFromQueue.push({ table: "profiles", result: { data: null, error: null } }); // update

    const res = await callAccept("happycode1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.joined).toBe(true);
    expect(body.hubId).toBe("hub-1");
    expect(body.hubName).toBe("Test Hub");

    expect(adminInsertCalls).toHaveLength(1);
    expect(adminInsertCalls[0].table).toBe("hub_members");
    expect(adminInsertCalls[0].payload).toMatchObject({
      hub_id: "hub-1",
      user_id: "buyer-1",
      status: "active",
      role: "buyer",
      invited_by_user_id: "inviter-1",
    });

    expect(adminUpdateCalls).toHaveLength(1);
    expect(adminUpdateCalls[0].table).toBe("profiles");
    expect(adminUpdateCalls[0].payload).toMatchObject({
      invited_by_user_id: "inviter-1",
      invite_code_used: "happycode1",
    });
  });
});
