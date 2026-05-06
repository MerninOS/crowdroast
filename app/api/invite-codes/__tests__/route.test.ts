import { describe, it, expect, vi, beforeEach } from "vitest";

type SelectResult = { data: unknown; error: unknown };

// We model the supabase client as a tiny chain that records calls and
// returns canned data. Each test sets up a sequence of from() responses;
// the chain records the table+filters used for the assertion phase.
type Chain = {
  select: (cols?: string) => Chain;
  insert: (payload: Record<string, unknown>) => Chain;
  eq: (col: string, val: unknown) => Chain;
  is: (col: string, val: unknown) => Chain;
  maybeSingle: () => Promise<SelectResult>;
  then: (resolve: (v: SelectResult) => unknown) => Promise<unknown>;
  _table: string;
  _payload?: Record<string, unknown>;
  _eq: Record<string, unknown>;
};

let fromQueue: Array<{ table: string; result: SelectResult }> = [];
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
let currentUser: { id: string } | null = null;

function makeChain(table: string, result: SelectResult): Chain {
  const chain: Chain = {
    _table: table,
    _eq: {},
    select() {
      return chain;
    },
    insert(payload) {
      chain._payload = payload;
      insertCalls.push({ table, payload });
      return chain;
    },
    eq(col, val) {
      chain._eq[col] = val;
      return chain;
    },
    is(col, val) {
      chain._eq[col] = val;
      return chain;
    },
    async maybeSingle() {
      return result;
    },
    then(resolve) {
      // Supabase's insert() returns a thenable. The route awaits it directly
      // (no .single() / .maybeSingle()) so we resolve with the canned result.
      return Promise.resolve(result).then(resolve);
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: currentUser } })),
    },
    from: vi.fn((table: string) => {
      const next = fromQueue.shift();
      if (!next) throw new Error(`Unexpected from(${table}) — queue empty`);
      if (next.table !== table) {
        throw new Error(`Expected from(${next.table}) but got from(${table})`);
      }
      return makeChain(table, next.result);
    }),
  })),
}));

vi.mock("@/lib/referrals/code", () => ({
  generateInviteCode: vi.fn(() => "fixedcode1"),
}));

import { POST } from "../route";

function makeRequest(): Request {
  return new Request("http://localhost/api/invite-codes", {
    method: "POST",
    headers: { origin: "https://crowdroast.test" },
  });
}

beforeEach(() => {
  fromQueue = [];
  insertCalls.length = 0;
  currentUser = null;
});

describe("POST /api/invite-codes", () => {
  it("401 when unauthenticated", async () => {
    currentUser = null;
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("403 when caller has no active hub membership", async () => {
    currentUser = { id: "buyer-1" };
    fromQueue.push({ table: "hub_members", result: { data: null, error: null } });
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe("active_hub_membership_required");
  });

  it("returns the existing code when one already exists (idempotency)", async () => {
    currentUser = { id: "buyer-1" };
    fromQueue.push({
      table: "hub_members",
      result: {
        data: {
          hub_id: "hub-1",
          hub: { id: "hub-1", name: "Test Hub", city: "Austin" },
        },
        error: null,
      },
    });
    fromQueue.push({
      table: "invite_codes",
      result: { data: { code: "existing01" }, error: null },
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.code).toBe("existing01");
    expect(body.url).toBe("https://crowdroast.test/i/existing01");
    expect(body.hubId).toBe("hub-1");
    expect(body.hubName).toBe("Test Hub");
    expect(insertCalls.length).toBe(0); // idempotent — no insert
  });

  it("inserts a new code when none exists", async () => {
    currentUser = { id: "buyer-1" };
    fromQueue.push({
      table: "hub_members",
      result: {
        data: {
          hub_id: "hub-1",
          hub: { id: "hub-1", name: "Test Hub", city: "Austin" },
        },
        error: null,
      },
    });
    fromQueue.push({
      table: "invite_codes",
      result: { data: null, error: null }, // no existing
    });
    fromQueue.push({
      table: "invite_codes",
      result: { data: null, error: null }, // insert succeeds (no error)
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.code).toBe("fixedcode1");
    expect(body.url).toBe("https://crowdroast.test/i/fixedcode1");
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0].table).toBe("invite_codes");
    expect(insertCalls[0].payload).toMatchObject({
      code: "fixedcode1",
      inviter_user_id: "buyer-1",
      hub_id: "hub-1",
    });
  });

  it("re-reads on unique-violation race and returns the winning code", async () => {
    currentUser = { id: "buyer-1" };
    fromQueue.push({
      table: "hub_members",
      result: {
        data: {
          hub_id: "hub-1",
          hub: { id: "hub-1", name: "Test Hub", city: "Austin" },
        },
        error: null,
      },
    });
    fromQueue.push({
      table: "invite_codes",
      result: { data: null, error: null }, // no existing on first read
    });
    fromQueue.push({
      table: "invite_codes",
      result: { data: null, error: { code: "23505", message: "duplicate" } }, // race
    });
    fromQueue.push({
      table: "invite_codes",
      result: { data: { code: "winnerrace" }, error: null }, // re-read finds winner
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.code).toBe("winnerrace");
  });
});
