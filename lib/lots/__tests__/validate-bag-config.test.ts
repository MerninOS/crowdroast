/**
 * Pure unit tests for `validateBagConfig` (lib/lots/validate-bag-config.ts).
 *
 * Covers the rules enumerated in plan Task 1.7:
 *   - bag_size_kg integer 1–100 (with 0/101 boundary failures and non-integer rejection)
 *   - min_bags_to_succeed between 1 and floor(total/bag) inclusive
 *   - total_quantity_kg must be a whole multiple of bag_size_kg
 *   - min_commitment_kg <= bag_size_kg
 *   - dependent rules (total-multiple, min_commitment, min_bags upper bound) are
 *     skipped when bag_size_kg is itself invalid, so we never double-report a
 *     single root cause.
 *
 * Error-message assertions match on substrings rather than exact copy so that
 * minor wording edits don't break the suite.
 */

import { describe, it, expect } from "vitest";
import {
  validateBagConfig,
  type ValidateBagConfigResult,
} from "@/lib/lots/validate-bag-config";

type Input = Parameters<typeof validateBagConfig>[0];

/**
 * Builds an input that is valid by default; spread an override to flip one
 * field at a time. Keeps each test focused on the rule under test.
 */
function makeInput(overrides: Partial<Input> = {}): Input {
  return {
    bag_size_kg: 60,
    min_bags_to_succeed: 3,
    total_quantity_kg: 600,
    min_commitment_kg: 20,
    ...overrides,
  };
}

describe("validateBagConfig", () => {
  // -------------------------------------------------------------------------
  // 1. Valid happy path
  // -------------------------------------------------------------------------
  it("returns valid:true with no errors on a clean input", () => {
    const result = validateBagConfig(makeInput());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  // -------------------------------------------------------------------------
  // 2. bag_size_kg lower boundary
  // -------------------------------------------------------------------------
  it("accepts bag_size_kg = 1 (lower inclusive bound)", () => {
    // total must remain a multiple of bag; commitment must fit one bag.
    const result = validateBagConfig(
      makeInput({
        bag_size_kg: 1,
        total_quantity_kg: 600,
        min_commitment_kg: 1,
        min_bags_to_succeed: 1,
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects bag_size_kg = 0 with a bag_size_kg error", () => {
    const result = validateBagConfig(makeInput({ bag_size_kg: 0 }));
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.errors.bag_size_kg).toBeDefined();
      expect(result.errors.bag_size_kg).toMatch(/1 and 100/);
    }
  });

  // -------------------------------------------------------------------------
  // 3. bag_size_kg upper boundary
  // -------------------------------------------------------------------------
  it("accepts bag_size_kg = 100 (upper inclusive bound)", () => {
    const result = validateBagConfig(
      makeInput({
        bag_size_kg: 100,
        total_quantity_kg: 600,
        min_commitment_kg: 20,
        min_bags_to_succeed: 1,
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects bag_size_kg = 101 with a bag_size_kg error", () => {
    const result = validateBagConfig(makeInput({ bag_size_kg: 101 }));
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.errors.bag_size_kg).toBeDefined();
      expect(result.errors.bag_size_kg).toMatch(/1 and 100/);
    }
  });

  // -------------------------------------------------------------------------
  // 4. bag_size_kg non-integer
  // -------------------------------------------------------------------------
  it("rejects a non-integer bag_size_kg under the bag_size_kg key", () => {
    const result = validateBagConfig(makeInput({ bag_size_kg: 60.5 }));
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.errors.bag_size_kg).toBeDefined();
    }
  });

  // -------------------------------------------------------------------------
  // 5. bag_size_kg null vs undefined produce the same error
  // -------------------------------------------------------------------------
  it("treats null and undefined bag_size_kg identically (same error message)", () => {
    const nullResult = validateBagConfig(makeInput({ bag_size_kg: null }));
    const undefinedResult = validateBagConfig(
      makeInput({ bag_size_kg: undefined })
    );
    expect(nullResult.valid).toBe(false);
    expect(undefinedResult.valid).toBe(false);
    if (nullResult.valid === false && undefinedResult.valid === false) {
      expect(nullResult.errors.bag_size_kg).toBeDefined();
      expect(undefinedResult.errors.bag_size_kg).toBeDefined();
      expect(nullResult.errors.bag_size_kg).toBe(
        undefinedResult.errors.bag_size_kg
      );
    }
  });

  // -------------------------------------------------------------------------
  // 6. min_bags_to_succeed boundaries
  // -------------------------------------------------------------------------
  it("rejects min_bags_to_succeed = 0 with a min_bags_to_succeed error", () => {
    const result = validateBagConfig(makeInput({ min_bags_to_succeed: 0 }));
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.errors.min_bags_to_succeed).toBeDefined();
      expect(result.errors.min_bags_to_succeed).toMatch(/at least 1/);
    }
  });

  it("accepts min_bags_to_succeed = 1 (lower bound)", () => {
    const result = validateBagConfig(makeInput({ min_bags_to_succeed: 1 }));
    expect(result.valid).toBe(true);
  });

  it("accepts min_bags_to_succeed = floor(total / bag) (upper inclusive bound)", () => {
    // 600 / 60 = 10 bags maximum.
    const result = validateBagConfig(
      makeInput({ min_bags_to_succeed: 10, total_quantity_kg: 600, bag_size_kg: 60 })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects min_bags_to_succeed = floor(total / bag) + 1 (exceeds maximum)", () => {
    // floor(600/60) = 10, so 11 should fail.
    const result = validateBagConfig(
      makeInput({ min_bags_to_succeed: 11, total_quantity_kg: 600, bag_size_kg: 60 })
    );
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.errors.min_bags_to_succeed).toBeDefined();
      // The "exceeds lot bag count" form mentions the ceiling number.
      expect(result.errors.min_bags_to_succeed).toMatch(/exceed/i);
    }
  });

  // -------------------------------------------------------------------------
  // 7. Dependent rule skipped: when bag_size_kg is invalid the min_bags upper
  //    bound check must NOT run — otherwise we double-report a single root
  //    cause. min_bags should still flag the basic "at least 1" rule if it
  //    fails that, but should not produce the "exceeds bag count" message.
  // -------------------------------------------------------------------------
  it("does not apply the min_bags upper-bound check when bag_size_kg is invalid", () => {
    // bag_size_kg invalid (0); min_bags_to_succeed would exceed any ceiling
    // were bag_size_kg = 60, but with bag_size_kg invalid the upper-bound
    // check must be skipped. min_bags_to_succeed = 11 is itself a valid
    // positive integer, so we should see ONLY the bag_size_kg error.
    const result = validateBagConfig(
      makeInput({ bag_size_kg: 0, min_bags_to_succeed: 11 })
    );
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.errors.bag_size_kg).toBeDefined();
      expect(result.errors.min_bags_to_succeed).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // 8. total_quantity_kg not a clean multiple
  // -------------------------------------------------------------------------
  it("rejects total_quantity_kg when it isn't a clean multiple of bag_size_kg", () => {
    // 575 / 60 = 9.583... → not a multiple.
    const result = validateBagConfig(
      makeInput({ bag_size_kg: 60, total_quantity_kg: 575 })
    );
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.errors.total_quantity_kg).toBeDefined();
      expect(result.errors.total_quantity_kg).toMatch(/multiple/i);
    }
  });

  // -------------------------------------------------------------------------
  // 9. total_quantity_kg multiple check skipped when bag_size_kg invalid
  // -------------------------------------------------------------------------
  it("skips the total-multiple check when bag_size_kg is invalid", () => {
    // bag_size_kg = 0 is invalid; we must not also raise a total_quantity_kg
    // error (would be modulo-by-zero anyway and is just noise for the user).
    const result = validateBagConfig(
      makeInput({ bag_size_kg: 0, total_quantity_kg: 575 })
    );
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.errors.bag_size_kg).toBeDefined();
      expect(result.errors.total_quantity_kg).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // 10. min_commitment_kg exceeds bag_size_kg
  // -------------------------------------------------------------------------
  it("rejects min_commitment_kg larger than one bag", () => {
    const result = validateBagConfig(
      makeInput({ bag_size_kg: 60, min_commitment_kg: 70 })
    );
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.errors.min_commitment_kg).toBeDefined();
      expect(result.errors.min_commitment_kg).toMatch(/bag/i);
    }
  });

  // -------------------------------------------------------------------------
  // 11. min_commitment_kg check skipped when bag_size_kg invalid
  // -------------------------------------------------------------------------
  it("skips the min_commitment_kg fit check when bag_size_kg is invalid", () => {
    // bag_size_kg null is invalid; min_commitment_kg can be anything without
    // its own dependent error — fix the root cause, then re-validate.
    const result = validateBagConfig(
      makeInput({ bag_size_kg: null, min_commitment_kg: 999 })
    );
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.errors.bag_size_kg).toBeDefined();
      expect(result.errors.min_commitment_kg).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // 12. min_commitment_kg == bag_size_kg is allowed (<= not <)
  // -------------------------------------------------------------------------
  it("allows min_commitment_kg to equal bag_size_kg exactly", () => {
    const result = validateBagConfig(
      makeInput({ bag_size_kg: 60, min_commitment_kg: 60 })
    );
    expect(result.valid).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 13. Multiple errors at once still surface together
  // -------------------------------------------------------------------------
  it("reports independent errors for invalid bag_size_kg AND missing min_bags_to_succeed simultaneously", () => {
    const result = validateBagConfig(
      makeInput({ bag_size_kg: 101, min_bags_to_succeed: null })
    );
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.errors.bag_size_kg).toBeDefined();
      expect(result.errors.min_bags_to_succeed).toBeDefined();
    }
  });

  // -------------------------------------------------------------------------
  // 14. Discriminated union narrowing works naturally
  //
  //    This is exercised structurally throughout the tests above — we only
  //    read `result.errors.<key>` inside an `if (result.valid === false)`
  //    branch, which is the discriminated-union narrow. The block below
  //    asserts the inverse: on the valid branch the errors object is empty,
  //    and TypeScript narrows `errors` to `Record<string, never>` so any
  //    `.someKey` access here would be a compile error. Touch only `.valid`
  //    and an empty deep-equal to keep this strictly safe.
  // -------------------------------------------------------------------------
  it("narrows the discriminated union correctly on the valid branch", () => {
    const result: ValidateBagConfigResult = validateBagConfig(makeInput());
    if (result.valid === true) {
      // On the valid branch, errors is Record<string, never> — i.e., empty.
      expect(result.errors).toEqual({});
    } else {
      // Should never reach here for the happy-path fixture.
      throw new Error(
        "Expected the happy-path input to validate as valid:true"
      );
    }
  });
});
