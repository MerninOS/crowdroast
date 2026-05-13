import type { BagAssignmentResult } from "@/lib/types";

type AssignKgInput = {
  commitments: Array<{ id: string; quantity_kg: number; created_at: string }>;
  bag_size_kg: number;
};

/**
 * Splits each commitment's quantity_kg into kg that fall inside fully-completed bags (locked)
 * vs kg that fall inside the current in-progress bag (filling), using chronological order.
 *
 * Pure and deterministic: sorts by (created_at ASC, id ASC), then assigns by running total.
 * Results are returned in the original input order.
 */
export function assignKgToBags(input: AssignKgInput): BagAssignmentResult[] {
  const { commitments, bag_size_kg } = input;

  if (!Number.isFinite(bag_size_kg) || bag_size_kg <= 0) {
    throw new Error(
      `assignKgToBags: bag_size_kg must be a positive number, got ${bag_size_kg}`
    );
  }

  if (commitments.length === 0) {
    return [];
  }

  for (const c of commitments) {
    if (!Number.isFinite(c.quantity_kg) || c.quantity_kg <= 0) {
      throw new Error(
        `assignKgToBags: commitment ${c.id} has invalid quantity_kg ${c.quantity_kg} (must be > 0)`
      );
    }
  }

  const sorted = [...commitments].sort((a, b) => {
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  const total = sorted.reduce((sum, c) => sum + c.quantity_kg, 0);
  const boundary = Math.floor(total / bag_size_kg) * bag_size_kg;

  const resultsById = new Map<string, BagAssignmentResult>();
  let running = 0;
  for (const c of sorted) {
    const start = running;
    const end = running + c.quantity_kg;
    const locked_kg = Math.max(0, Math.min(end, boundary) - start);
    const filling_kg = c.quantity_kg - locked_kg;
    resultsById.set(c.id, {
      commitment_id: c.id,
      locked_kg,
      filling_kg,
    });
    running = end;
  }

  return commitments.map((c) => {
    const result = resultsById.get(c.id);
    if (!result) {
      throw new Error(`assignKgToBags: missing result for commitment ${c.id}`);
    }
    return result;
  });
}

type ExpandToBagPortionsInput = {
  commitments: Array<{ id: string; quantity_kg: number; created_at: string }>;
  bag_size_kg: number;
};

export type BagPortion = {
  commitment_id: string;
  /** 1-indexed bag number within the campaign. */
  bag_number: number;
  /** How many kg of this commitment fall inside the named bag. */
  kg: number;
};

/**
 * Expands each commitment's locked kg into one entry per (commitment, bag) pair.
 *
 * Pure and deterministic: sorts commitments by (created_at ASC, id ASC) — same
 * tie-break as `assignKgToBags` — walks them in order, and emits a portion for
 * every bag a commitment overlaps with. Portions that fall inside the in-progress
 * (incomplete) bag are dropped: only completed bags are charged.
 *
 * Bags are 1-indexed. `completed_bags = floor(total_kg / bag_size_kg)`; bag
 * numbers `1..completed_bags` are completed, bag `completed_bags + 1` and beyond
 * are the in-progress region and never appear in the output.
 *
 * Output is ordered by (sorted commitment position, bag_number ASC).
 */
export function expandToBagPortions(
  input: ExpandToBagPortionsInput
): BagPortion[] {
  const { commitments, bag_size_kg } = input;

  if (!Number.isFinite(bag_size_kg) || bag_size_kg <= 0) {
    throw new Error(
      `expandToBagPortions: bag_size_kg must be a positive number, got ${bag_size_kg}`
    );
  }

  if (commitments.length === 0) {
    return [];
  }

  for (const c of commitments) {
    if (!Number.isFinite(c.quantity_kg) || c.quantity_kg <= 0) {
      throw new Error(
        `expandToBagPortions: commitment ${c.id} has invalid quantity_kg ${c.quantity_kg} (must be > 0)`
      );
    }
  }

  const sorted = [...commitments].sort((a, b) => {
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  const total = sorted.reduce((sum, c) => sum + c.quantity_kg, 0);
  const completed_bags = Math.floor(total / bag_size_kg);

  if (completed_bags === 0) {
    return [];
  }

  const portions: BagPortion[] = [];
  let running = 0;
  for (const c of sorted) {
    const start = running;
    const end = running + c.quantity_kg;

    // First and last bag (1-indexed) this commitment touches.
    const first_bag = Math.floor(start / bag_size_kg) + 1;
    // For an end that lands exactly on a bag boundary (end % bag_size_kg === 0),
    // the commitment ends at the close of bag (end / bag_size_kg), not the next.
    const last_bag_inclusive = Math.ceil(end / bag_size_kg);

    // Cap the upper bag at completed_bags — anything beyond is the in-progress
    // region and gets dropped.
    const last_bag = Math.min(last_bag_inclusive, completed_bags);

    for (let b = first_bag; b <= last_bag; b++) {
      const bag_start = (b - 1) * bag_size_kg;
      const bag_end = b * bag_size_kg;
      const kg = Math.min(end, bag_end) - Math.max(start, bag_start);
      if (kg > 0) {
        portions.push({
          commitment_id: c.id,
          bag_number: b,
          kg,
        });
      }
    }

    running = end;
  }

  return portions;
}
