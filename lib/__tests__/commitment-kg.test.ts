/**
 * Unit tests for `commitmentDisplayKg` — the helper that powers seller and
 * buyer "how much of this commit is real" displays.
 *
 * Failure cases this guards:
 * - A settled bag-aware commit displaying the pre-settle pledge (regression
 *   user reported: "shows the total amount in weight the user committed to,
 *   not the total amount that settled").
 * - A pre-settle commit displaying 0 because `kg_locked_at_settlement` is
 *   null (the bag-aware allocation hasn't run yet).
 * - A 0-locked commit (allocated nothing — leftover didn't fill a bag)
 *   falling back to the pledge by mistake.
 */

import { describe, it, expect } from "vitest";
import {
  commitmentDisplayKg,
  totalCommitmentDisplayKg,
} from "../commitment-kg";

describe("commitmentDisplayKg", () => {
  it("returns kg_locked_at_settlement when the campaign has settled", () => {
    expect(
      commitmentDisplayKg({ quantity_kg: 72, kg_locked_at_settlement: 63 })
    ).toBe(63);
  });

  it("returns quantity_kg pre-settle (kg_locked is null)", () => {
    expect(
      commitmentDisplayKg({ quantity_kg: 72, kg_locked_at_settlement: null })
    ).toBe(72);
  });

  it("treats kg_locked_at_settlement === 0 as 'no bag allocated' and falls back to pledge", () => {
    // A buyer who pledged 25 kg but the bag-allocator gave them 0 bags
    // (their kg didn't fill a bag) ends up with kg_locked = 0. The display
    // should still show the pledge so the buyer sees the original commit;
    // the dropped-kg surface elsewhere narrates "you didn't get any bags."
    expect(
      commitmentDisplayKg({ quantity_kg: 25, kg_locked_at_settlement: 0 })
    ).toBe(25);
  });

  it("treats kg_locked_at_settlement equal to quantity_kg as a clean fill (multi-bag commit)", () => {
    expect(
      commitmentDisplayKg({ quantity_kg: 120, kg_locked_at_settlement: 120 })
    ).toBe(120);
  });

  it("coerces numeric strings (Supabase decimal columns arrive as strings via JSON)", () => {
    expect(
      commitmentDisplayKg({
        quantity_kg: "72.07583" as unknown as number,
        kg_locked_at_settlement: "63" as unknown as number,
      })
    ).toBe(63);
  });

  it("returns 0 when both fields are null/missing (shouldn't happen in prod but stays defensive)", () => {
    expect(
      commitmentDisplayKg({
        quantity_kg: 0,
        kg_locked_at_settlement: null,
      })
    ).toBe(0);
  });
});

describe("totalCommitmentDisplayKg", () => {
  it("sums display kg across mixed pre-settle / post-settle commits in the same campaign", () => {
    // Realistic post-settle shape: every commit has kg_locked set. The
    // total should match `completed_bags × bag_size_kg`.
    const out = totalCommitmentDisplayKg([
      { quantity_kg: 72.07583, kg_locked_at_settlement: 63 },
      { quantity_kg: 90, kg_locked_at_settlement: 63 },
      // Edge case: a commit that didn't get any bag at allocation.
      { quantity_kg: 8, kg_locked_at_settlement: 0 },
    ]);
    // 63 + 63 + 8 (the 0-locked falls back to pledge per the helper rule)
    expect(out).toBe(134);
  });

  it("returns 0 for an empty list", () => {
    expect(totalCommitmentDisplayKg([])).toBe(0);
  });
});
