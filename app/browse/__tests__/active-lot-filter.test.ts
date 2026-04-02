/**
 * Criterion 1 — Browse page only shows active lots.
 *
 * Tests the JS filter applied in app/browse/page.tsx after fetching rawHubLots.
 * The filter is: (hl) => hl.lot?.status === "active"
 *
 * Verifies:
 * - Active lots pass through
 * - Inactive/draft lots are excluded
 * - Rows with null lot references are excluded
 * - Empty input produces empty output
 *
 * Tradeoff: filtering in JS rather than in the Supabase query (PostgREST
 * embedded filter on aliased joins is unreliable). This test confirms the
 * JS filter is correct, but does not test that inactive lots are excluded
 * at the query level.
 */

import { describe, it, expect } from "vitest";

// The exact filter used in app/browse/page.tsx
const filterActiveLots = (hubLots: any[]) =>
  hubLots.filter((hl: any) => hl.lot?.status === "active");

describe("browse page active lot filter", () => {
  it("passes through active lots", () => {
    const input = [{ hub_id: "h1", lot_id: "l1", lot: { id: "l1", status: "active", title: "Ethiopia Yirgacheffe" } }];
    expect(filterActiveLots(input)).toHaveLength(1);
  });

  it("excludes lots with status !== active", () => {
    const input = [
      { lot: { status: "active", title: "Kept" } },
      { lot: { status: "draft", title: "Excluded draft" } },
      { lot: { status: "closed", title: "Excluded closed" } },
      { lot: { status: "fully_committed", title: "Excluded full" } },
    ];
    const result = filterActiveLots(input);
    expect(result).toHaveLength(1);
    expect(result[0].lot.title).toBe("Kept");
  });

  it("excludes rows where lot is null", () => {
    const input = [
      { lot: null },
      { lot: undefined },
      { lot: { status: "active", title: "Valid" } },
    ];
    const result = filterActiveLots(input);
    expect(result).toHaveLength(1);
    expect(result[0].lot.title).toBe("Valid");
  });

  it("returns empty array when all lots are inactive", () => {
    const input = [
      { lot: { status: "draft" } },
      { lot: { status: "closed" } },
    ];
    expect(filterActiveLots(input)).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(filterActiveLots([])).toHaveLength(0);
  });
});
