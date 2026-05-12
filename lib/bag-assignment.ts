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
