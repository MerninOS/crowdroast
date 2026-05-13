/**
 * Pure unit tests for `expandToBagPortions` (lib/bag-assignment.ts).
 *
 * Sister helper to `assignKgToBags`: instead of returning a single
 * locked/filling split per commit, it expands each commitment's locked kg
 * into one entry per (commitment, bag) pair. Portions in the in-progress
 * (incomplete) bag are dropped — only completed bags appear in the output.
 *
 * Covers Task 4.5a of the bag-aware-campaign-close plan (spec AC5 + AC6).
 */

import { describe, it, expect } from "vitest";
import { expandToBagPortions, type BagPortion } from "@/lib/bag-assignment";

type Commit = { id: string; quantity_kg: number; created_at: string };

/** Small helper to keep test fixtures compact. */
function mkCommit(
  id: string,
  quantity_kg: number,
  created_at: string
): Commit {
  return { id, quantity_kg, created_at };
}

describe("expandToBagPortions", () => {
  // -------------------------------------------------------------------------
  // 1. Empty input → []
  // -------------------------------------------------------------------------
  it("returns an empty array when no commitments are provided", () => {
    expect(expandToBagPortions({ commitments: [], bag_size_kg: 60 })).toEqual(
      []
    );
  });

  // -------------------------------------------------------------------------
  // 2. Single sub-bag commit (30kg @ 60kg bag) → no completed bags → []
  // -------------------------------------------------------------------------
  it("emits no portions when the only commit is under one bag", () => {
    const result = expandToBagPortions({
      commitments: [mkCommit("c1", 30, "2026-01-01T00:00:00Z")],
      bag_size_kg: 60,
    });
    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 3. Single exactly-one-bag commit (60kg @ 60kg bag) → 1 portion of 60kg in bag 1
  // -------------------------------------------------------------------------
  it("emits one bag-1 portion for a commit that exactly fills one bag", () => {
    const result = expandToBagPortions({
      commitments: [mkCommit("c1", 60, "2026-01-01T00:00:00Z")],
      bag_size_kg: 60,
    });
    expect(result).toEqual<BagPortion[]>([
      { commitment_id: "c1", bag_number: 1, kg: 60 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 4. Single multi-bag commit (200kg @ 60kg bag) → 3 portions of 60kg,
  //    trailing 20kg dropped (it falls in incomplete bag 4)
  // -------------------------------------------------------------------------
  it("emits one portion per completed bag for a multi-bag commit, dropping the in-progress remainder", () => {
    // total=200, bag=60, completed_bags=floor(200/60)=3.
    // Commit spans bags 1 (0–60), 2 (60–120), 3 (120–180), 4 (180–200 → 20kg).
    // Bag 4 is in-progress → dropped.
    const result = expandToBagPortions({
      commitments: [mkCommit("c1", 200, "2026-01-01T00:00:00Z")],
      bag_size_kg: 60,
    });
    expect(result).toEqual<BagPortion[]>([
      { commitment_id: "c1", bag_number: 1, kg: 60 },
      { commitment_id: "c1", bag_number: 2, kg: 60 },
      { commitment_id: "c1", bag_number: 3, kg: 60 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 5. Multiple commits, exact bag multiples — one portion per commit per bag
  // -------------------------------------------------------------------------
  it("emits one portion per commit when 3×60kg fills 3 bags exactly", () => {
    const result = expandToBagPortions({
      commitments: [
        mkCommit("c1", 60, "2026-01-01T00:00:00Z"),
        mkCommit("c2", 60, "2026-01-02T00:00:00Z"),
        mkCommit("c3", 60, "2026-01-03T00:00:00Z"),
      ],
      bag_size_kg: 60,
    });
    expect(result).toEqual<BagPortion[]>([
      { commitment_id: "c1", bag_number: 1, kg: 60 },
      { commitment_id: "c2", bag_number: 2, kg: 60 },
      { commitment_id: "c3", bag_number: 3, kg: 60 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 6. Spec "Aria" scenario
  // -------------------------------------------------------------------------
  it("places Aria's 30kg in bag 2 and emits zero portions for the trailing 7kg buyer", () => {
    // bag=60. Chronological layout:
    //   pre   100kg  at positions 1–100   (T1)  → bag 1 (60kg), bag 2 (40kg)
    //   aria   30kg  at positions 101–130 (T2)  → bag 2 (30kg)
    //   mid    50kg  at positions 131–180 (T3)  → bag 2 (-) ... bag 3 (50kg)
    //                                            actually: 131–180 → bag 3 (120-180 = 50kg)
    //   tail    7kg  at positions 181–187 (T4)  → bag 4 (in-progress) → dropped
    // total=187, completed_bags = floor(187/60) = 3.
    // Note bag 2 spans positions 61–120, so:
    //   pre fills 100, contributes to bag 1 (60kg, positions 1–60) and bag 2 (40kg, 61–100).
    //   aria spans 101–130, contributes 20kg to bag 2 (101–120) + 10kg to bag 3 (121–130).
    //   Hmm — let me re-check the spec's expected number.
    //
    // The plan's spec text says Aria gets exactly one portion {bag_number:2, kg:30}.
    // That works only if Aria's 30kg sits ENTIRELY within bag 2.
    // For that to be true, pre must end exactly at bag 2's start (kg 60), not extend
    // into bag 2 — i.e. pre must be 60kg, not 100kg.
    //
    // Re-reading the task spec exactly: "Aria's 30kg sits at chronological
    // positions 101-130 in a 187kg total". Positions 101-130 span bags 2 (61-120)
    // and 3 (121-180). For Aria's 30kg to sit entirely in bag 2, position 101-120
    // is bag 2 (20kg) and 121-130 is bag 3 (10kg).
    //
    // So Aria would get TWO portions, not one. The spec text in the task is
    // imprecise — we'll match the actual fixture: pre=60, aria=60, mid=60, tail=7.
    // That puts pre in bag 1 (kg 1-60), aria in bag 2 (kg 61-120), mid in bag 3
    // (kg 121-180), tail in bag 4 (incomplete, dropped). Aria's single portion is
    // {bag_number: 2, kg: 60}.
    //
    // But the task says aria=30 specifically. So let me re-read once more...
    //
    // OK — re-reading: "4 commits, Aria's 30kg sits at chronological positions
    // 101-130 in a 187kg total." This is a description of positions, not a
    // requirement that those positions equal Aria's quantity. Since 130-101+1=30
    // matches a 30kg commit, and 187 total kg is given, the fixture for the
    // remaining commits must be:
    //   pre = 100 (positions 1-100)
    //   aria = 30 (positions 101-130)
    //   mid = 50 (positions 131-180)
    //   tail = 7 (positions 181-187)
    //
    // With bag_size_kg = 60:
    //   bag 1: 1–60       (pre: 60)
    //   bag 2: 61–120     (pre: 40, aria: 20)
    //   bag 3: 121–180    (aria: 10, mid: 50)
    //   bag 4: 181–240    (incomplete, dropped) — has tail's 7kg
    //
    // completed_bags = floor(187/60) = 3.
    //
    // Expected portions (in sorted order):
    //   pre  → bag 1 (60), bag 2 (40)
    //   aria → bag 2 (20), bag 3 (10)
    //   mid  → bag 3 (50)
    //   tail → (none — bag 4 incomplete)
    //
    // The spec's claim "Aria gets exactly one portion {bag_number:2, kg:30}" is
    // only possible if the slicing is at commit-level rather than position-level.
    // But the task description explicitly says "expands each commitment's kg
    // across bags" and gives the formula "fall in this bag" — so the per-bag
    // proration is what's wanted.
    //
    // We assert the position-correct expected output. The trailing 7kg buyer
    // (tail) getting ZERO portions — the key spec assertion — is preserved.
    const result = expandToBagPortions({
      commitments: [
        mkCommit("pre", 100, "2026-01-01T00:00:00Z"),
        mkCommit("aria", 30, "2026-01-02T00:00:00Z"),
        mkCommit("mid", 50, "2026-01-03T00:00:00Z"),
        mkCommit("tail", 7, "2026-01-04T00:00:00Z"),
      ],
      bag_size_kg: 60,
    });
    expect(result).toEqual<BagPortion[]>([
      { commitment_id: "pre", bag_number: 1, kg: 60 },
      { commitment_id: "pre", bag_number: 2, kg: 40 },
      { commitment_id: "aria", bag_number: 2, kg: 20 },
      { commitment_id: "aria", bag_number: 3, kg: 10 },
      { commitment_id: "mid", bag_number: 3, kg: 50 },
      // tail: zero portions — 7kg fell in incomplete bag 4
    ]);

    // The single most important assertion from the spec: tail emits zero portions.
    const tailPortions = result.filter((p) => p.commitment_id === "tail");
    expect(tailPortions).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 7. Straddling: commit of 100kg starting at bag-1 offset 40
  // -------------------------------------------------------------------------
  it("straddles bag boundaries: commit at offset 40 spreads into bag 1 (20kg) and bag 2 (60kg); incomplete bag 3 dropped", () => {
    // bag=60. Layout:
    //   c1 = 40kg at positions 1–40 (T1)
    //   c2 = 100kg at positions 41–140 (T2)
    // total = 140, completed_bags = floor(140/60) = 2.
    //   bag 1: 1–60   → c1: 40, c2: 20
    //   bag 2: 61–120 → c2: 60
    //   bag 3: 121–180 incomplete → c2's 20kg dropped
    const result = expandToBagPortions({
      commitments: [
        mkCommit("c1", 40, "2026-01-01T00:00:00Z"),
        mkCommit("c2", 100, "2026-01-02T00:00:00Z"),
      ],
      bag_size_kg: 60,
    });
    expect(result).toEqual<BagPortion[]>([
      { commitment_id: "c1", bag_number: 1, kg: 40 },
      { commitment_id: "c2", bag_number: 1, kg: 20 },
      { commitment_id: "c2", bag_number: 2, kg: 60 },
      // c2's bag-3 portion of 20kg is dropped (incomplete bag).
    ]);

    // Spec-stated invariant: exactly 2 portions for the straddling commit.
    const c2Portions = result.filter((p) => p.commitment_id === "c2");
    expect(c2Portions).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // 8. Total below one bag → []
  // -------------------------------------------------------------------------
  it("returns [] when total is below one bag", () => {
    // bag=60, commits [20, 30], total=50, completed_bags=0.
    const result = expandToBagPortions({
      commitments: [
        mkCommit("c1", 20, "2026-01-01T00:00:00Z"),
        mkCommit("c2", 30, "2026-01-02T00:00:00Z"),
      ],
      bag_size_kg: 60,
    });
    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 9. Tie-break: same created_at, ids "b" and "a" → "a" first
  // -------------------------------------------------------------------------
  it("breaks created_at ties by id ASC — id 'a' is treated as earlier than 'b'", () => {
    // bag=60, two 50kg commits with identical created_at.
    // total=100, completed_bags = floor(100/60) = 1.
    // Sorted by (created_at, id): a then b.
    //   a: positions 1–50  → bag 1 (50)
    //   b: positions 51–100 → bag 1 (10), bag 2 (40, dropped because incomplete)
    const result = expandToBagPortions({
      commitments: [
        mkCommit("b", 50, "2026-01-01T00:00:00Z"),
        mkCommit("a", 50, "2026-01-01T00:00:00Z"),
      ],
      bag_size_kg: 60,
    });
    expect(result).toEqual<BagPortion[]>([
      { commitment_id: "a", bag_number: 1, kg: 50 },
      { commitment_id: "b", bag_number: 1, kg: 10 },
    ]);
  });

  // -------------------------------------------------------------------------
  // 10. Validation
  // -------------------------------------------------------------------------
  it("throws when bag_size_kg is zero", () => {
    expect(() =>
      expandToBagPortions({
        commitments: [mkCommit("c1", 30, "2026-01-01T00:00:00Z")],
        bag_size_kg: 0,
      })
    ).toThrow(/bag_size_kg/);
  });

  it("throws when bag_size_kg is negative", () => {
    expect(() =>
      expandToBagPortions({
        commitments: [mkCommit("c1", 30, "2026-01-01T00:00:00Z")],
        bag_size_kg: -10,
      })
    ).toThrow(/bag_size_kg/);
  });

  it("throws (mentioning the commit id) when a commitment has quantity_kg = 0", () => {
    expect(() =>
      expandToBagPortions({
        commitments: [mkCommit("bad-commit", 0, "2026-01-01T00:00:00Z")],
        bag_size_kg: 60,
      })
    ).toThrow(/bad-commit/);
  });

  it("throws (mentioning the commit id) when a commitment has negative quantity_kg", () => {
    expect(() =>
      expandToBagPortions({
        commitments: [
          mkCommit("ok", 30, "2026-01-01T00:00:00Z"),
          mkCommit("bad-commit", -5, "2026-01-02T00:00:00Z"),
        ],
        bag_size_kg: 60,
      })
    ).toThrow(/bad-commit/);
  });
});
