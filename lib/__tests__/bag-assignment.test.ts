/**
 * Pure unit tests for `assignKgToBags` (lib/bag-assignment.ts).
 *
 * The function under test is pure and deterministic — no mocks needed.
 * Covers the boundary cases enumerated in
 * docs/plans/bag-aware-campaign-close (Task 1.5) plus a few critical
 * tie-break / input-order invariants.
 */

import { describe, it, expect } from "vitest";
import { assignKgToBags } from "@/lib/bag-assignment";

type Commit = { id: string; quantity_kg: number; created_at: string };

/** Small helper to keep test fixtures compact. */
function mkCommit(
  id: string,
  quantity_kg: number,
  created_at: string
): Commit {
  return { id, quantity_kg, created_at };
}

describe("assignKgToBags", () => {
  // -------------------------------------------------------------------------
  // 1. Empty input
  // -------------------------------------------------------------------------
  it("returns an empty array when no commitments are provided", () => {
    expect(assignKgToBags({ commitments: [], bag_size_kg: 60 })).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 2. Single commit smaller than one bag
  // -------------------------------------------------------------------------
  it("treats a single sub-bag commit as entirely filling", () => {
    const result = assignKgToBags({
      commitments: [mkCommit("c1", 30, "2026-01-01T00:00:00Z")],
      bag_size_kg: 60,
    });
    expect(result).toEqual([
      { commitment_id: "c1", locked_kg: 0, filling_kg: 30 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 3. Single commit exactly equal to one bag
  // -------------------------------------------------------------------------
  it("locks a single commit that exactly fills one bag", () => {
    const result = assignKgToBags({
      commitments: [mkCommit("c1", 60, "2026-01-01T00:00:00Z")],
      bag_size_kg: 60,
    });
    expect(result).toEqual([
      { commitment_id: "c1", locked_kg: 60, filling_kg: 0 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 4. Single commit spanning multiple bags
  // -------------------------------------------------------------------------
  it("splits a single multi-bag commit into locked + filling at the boundary", () => {
    const result = assignKgToBags({
      commitments: [mkCommit("c1", 200, "2026-01-01T00:00:00Z")],
      bag_size_kg: 60,
    });
    // total=200, boundary = floor(200/60)*60 = 180.
    expect(result).toEqual([
      { commitment_id: "c1", locked_kg: 180, filling_kg: 20 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 5. Multiple commits, exact bag multiples
  // -------------------------------------------------------------------------
  it("locks every commit when the total is an exact multiple of the bag size", () => {
    const result = assignKgToBags({
      commitments: [
        mkCommit("c1", 60, "2026-01-01T00:00:00Z"),
        mkCommit("c2", 60, "2026-01-02T00:00:00Z"),
        mkCommit("c3", 60, "2026-01-03T00:00:00Z"),
      ],
      bag_size_kg: 60,
    });
    expect(result).toEqual([
      { commitment_id: "c1", locked_kg: 60, filling_kg: 0 },
      { commitment_id: "c2", locked_kg: 60, filling_kg: 0 },
      { commitment_id: "c3", locked_kg: 60, filling_kg: 0 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 6a. Multiple commits, exact bag multiples (overflow at the tail = none)
  // -------------------------------------------------------------------------
  it("locks all kg when commits [80,80,80] exactly fill 4 bags of 60kg", () => {
    // total=240, boundary = floor(240/60)*60 = 240 → no filling.
    const result = assignKgToBags({
      commitments: [
        mkCommit("c1", 80, "2026-01-01T00:00:00Z"),
        mkCommit("c2", 80, "2026-01-02T00:00:00Z"),
        mkCommit("c3", 80, "2026-01-03T00:00:00Z"),
      ],
      bag_size_kg: 60,
    });
    expect(result).toEqual([
      { commitment_id: "c1", locked_kg: 80, filling_kg: 0 },
      { commitment_id: "c2", locked_kg: 80, filling_kg: 0 },
      { commitment_id: "c3", locked_kg: 80, filling_kg: 0 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 6b. Multiple commits with overflow at the tail
  // -------------------------------------------------------------------------
  it("absorbs overflow into the chronologically-last commit only", () => {
    // bag=60, commits [50, 50, 50], total=150, boundary = floor(150/60)*60 = 120.
    // c1: 0–50  → locked 50, filling 0
    // c2: 50–100 → locked 50, filling 0
    // c3: 100–150 → locked 20 (100→120), filling 30 (120→150)
    const result = assignKgToBags({
      commitments: [
        mkCommit("c1", 50, "2026-01-01T00:00:00Z"),
        mkCommit("c2", 50, "2026-01-02T00:00:00Z"),
        mkCommit("c3", 50, "2026-01-03T00:00:00Z"),
      ],
      bag_size_kg: 60,
    });
    expect(result).toEqual([
      { commitment_id: "c1", locked_kg: 50, filling_kg: 0 },
      { commitment_id: "c2", locked_kg: 50, filling_kg: 0 },
      { commitment_id: "c3", locked_kg: 20, filling_kg: 30 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 7. Chronological tie-break by id (lexicographic ASC)
  // -------------------------------------------------------------------------
  it("breaks chronological ties by id ASC — smaller id is treated as earlier", () => {
    // bag=60, two 50kg commits with identical created_at, ids "a" and "b".
    // total=100, boundary = floor(100/60)*60 = 60.
    // Sorted by (created_at, id): a then b.
    // a: 0–50 → locked 50, filling 0
    // b: 50–100 → locked 10 (50→60), filling 40 (60→100)
    const result = assignKgToBags({
      commitments: [
        mkCommit("a", 50, "2026-01-01T00:00:00Z"),
        mkCommit("b", 50, "2026-01-01T00:00:00Z"),
      ],
      bag_size_kg: 60,
    });
    expect(result).toEqual([
      { commitment_id: "a", locked_kg: 50, filling_kg: 0 },
      { commitment_id: "b", locked_kg: 10, filling_kg: 40 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 8. Total below one bag
  // -------------------------------------------------------------------------
  it("returns zero locked for all commits when the total is below one bag", () => {
    // bag=60, commits [20, 30], total=50, boundary=0.
    const result = assignKgToBags({
      commitments: [
        mkCommit("c1", 20, "2026-01-01T00:00:00Z"),
        mkCommit("c2", 30, "2026-01-02T00:00:00Z"),
      ],
      bag_size_kg: 60,
    });
    expect(result).toEqual([
      { commitment_id: "c1", locked_kg: 0, filling_kg: 20 },
      { commitment_id: "c2", locked_kg: 0, filling_kg: 30 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 9. Spec "Aria" scenario
  // -------------------------------------------------------------------------
  it("places Aria's 30kg fully inside the locked region and dumps overflow on the last commit", () => {
    // bag=60. Chronological layout:
    //   pre   100kg  at positions 1–100   (created_at T1)
    //   aria   30kg  at positions 101–130 (created_at T2)
    //   mid    50kg  at positions 131–180 (created_at T3)
    //   tail    7kg  at positions 181–187 (created_at T4)
    // total=187, boundary = floor(187/60)*60 = 180.
    const result = assignKgToBags({
      commitments: [
        mkCommit("pre", 100, "2026-01-01T00:00:00Z"),
        mkCommit("aria", 30, "2026-01-02T00:00:00Z"),
        mkCommit("mid", 50, "2026-01-03T00:00:00Z"),
        mkCommit("tail", 7, "2026-01-04T00:00:00Z"),
      ],
      bag_size_kg: 60,
    });
    expect(result).toEqual([
      { commitment_id: "pre", locked_kg: 100, filling_kg: 0 },
      { commitment_id: "aria", locked_kg: 30, filling_kg: 0 },
      { commitment_id: "mid", locked_kg: 50, filling_kg: 0 },
      { commitment_id: "tail", locked_kg: 0, filling_kg: 7 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 10. Validation: bag_size_kg ≤ 0
  // -------------------------------------------------------------------------
  it("throws when bag_size_kg is zero", () => {
    expect(() =>
      assignKgToBags({
        commitments: [mkCommit("c1", 30, "2026-01-01T00:00:00Z")],
        bag_size_kg: 0,
      })
    ).toThrow(/bag_size_kg/);
  });

  it("throws when bag_size_kg is negative", () => {
    expect(() =>
      assignKgToBags({
        commitments: [mkCommit("c1", 30, "2026-01-01T00:00:00Z")],
        bag_size_kg: -10,
      })
    ).toThrow(/bag_size_kg/);
  });

  // -------------------------------------------------------------------------
  // 11. Validation: quantity_kg ≤ 0
  // -------------------------------------------------------------------------
  it("throws (mentioning the commit id) when a commitment has quantity_kg = 0", () => {
    expect(() =>
      assignKgToBags({
        commitments: [mkCommit("bad-commit", 0, "2026-01-01T00:00:00Z")],
        bag_size_kg: 60,
      })
    ).toThrow(/bad-commit/);
  });

  it("throws (mentioning the commit id) when a commitment has negative quantity_kg", () => {
    expect(() =>
      assignKgToBags({
        commitments: [
          mkCommit("ok", 30, "2026-01-01T00:00:00Z"),
          mkCommit("bad-commit", -5, "2026-01-02T00:00:00Z"),
        ],
        bag_size_kg: 60,
      })
    ).toThrow(/bad-commit/);
  });

  // -------------------------------------------------------------------------
  // 12. Result order preserves input order, not sorted order
  // -------------------------------------------------------------------------
  it("returns results in input order even when chronological order differs", () => {
    // Input order: [x then y]. Chronological order: y (T1) before x (T2).
    // bag=80, total=120, boundary = floor(120/80)*80 = 80.
    // After sort by created_at ASC: y first, then x.
    //   y: 0–90  → locked 80, filling 10
    //   x: 90–120 → locked 0, filling 30
    // Returned array must preserve INPUT order — so result[0] is x's split,
    // result[1] is y's split. If the function returned sorted-order results,
    // the locked/filling values would be swapped between positions.
    const result = assignKgToBags({
      commitments: [
        mkCommit("x", 30, "2026-01-02T00:00:00Z"),
        mkCommit("y", 90, "2026-01-01T00:00:00Z"),
      ],
      bag_size_kg: 80,
    });
    expect(result).toEqual([
      { commitment_id: "x", locked_kg: 0, filling_kg: 30 },
      { commitment_id: "y", locked_kg: 80, filling_kg: 10 },
    ]);
  });
});
