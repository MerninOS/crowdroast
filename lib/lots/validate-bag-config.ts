type ValidateBagConfigInput = {
  bag_size_kg: number | null | undefined;
  min_bags_to_succeed: number | null | undefined;
  total_quantity_kg: number;
  min_commitment_kg: number;
};

export type ValidateBagConfigResult =
  | { valid: true; errors: Record<string, never> }
  | { valid: false; errors: Record<string, string> };

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

/**
 * Validates the bag-related lot configuration for a campaign. Pure and
 * deterministic — returns the full set of errors found per input field
 * so the caller can surface them all at once.
 *
 * Rules:
 *   - bag_size_kg: integer 1–100 (inclusive)
 *   - min_bags_to_succeed: integer ≥ 1 and ≤ floor(total_quantity_kg / bag_size_kg)
 *   - total_quantity_kg must be a whole multiple of bag_size_kg
 *   - min_commitment_kg ≤ bag_size_kg (otherwise one buyer overflows a bag)
 *
 * If bag_size_kg is invalid we skip the dependent checks (total multiple,
 * min_commitment fit) so we don't double-report the same root cause.
 */
export function validateBagConfig(
  input: ValidateBagConfigInput
): ValidateBagConfigResult {
  const errors: Record<string, string> = {};

  const bagSize = input.bag_size_kg;
  const minBags = input.min_bags_to_succeed;

  const bagSizeValid =
    typeof bagSize === "number" &&
    Number.isInteger(bagSize) &&
    bagSize >= 1 &&
    bagSize <= 100;

  if (!bagSizeValid) {
    errors.bag_size_kg = "Bag size must be a whole number between 1 and 100 kg.";
  }

  const minBagsBasicValid =
    typeof minBags === "number" && isPositiveInteger(minBags);

  if (!minBagsBasicValid) {
    errors.min_bags_to_succeed =
      "Minimum bags to succeed must be a whole number of at least 1.";
  } else if (bagSizeValid) {
    const maxBags = Math.floor(input.total_quantity_kg / (bagSize as number));
    if ((minBags as number) > maxBags) {
      errors.min_bags_to_succeed = `Minimum bags can't exceed the lot's bag count (${maxBags}).`;
    }
  }

  if (bagSizeValid) {
    if (input.total_quantity_kg % (bagSize as number) !== 0) {
      errors.total_quantity_kg = `Total quantity must be a clean multiple of the bag size (${bagSize} kg).`;
    }
    if (input.min_commitment_kg > (bagSize as number)) {
      errors.min_commitment_kg = `Minimum commitment can't be larger than one bag (${bagSize} kg).`;
    }
  }

  if (Object.keys(errors).length === 0) {
    return { valid: true, errors: {} };
  }
  return { valid: false, errors };
}
