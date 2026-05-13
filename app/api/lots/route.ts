import { createClient } from "@/lib/supabase/server";
import { validateBagConfig } from "@/lib/lots/validate-bag-config";
import { NextResponse } from "next/server";

type CreateLotBody = {
  title?: unknown;
  origin_country?: unknown;
  region?: unknown;
  farm?: unknown;
  variety?: unknown;
  process?: unknown;
  altitude_min?: unknown;
  altitude_max?: unknown;
  crop_year?: unknown;
  score?: unknown;
  description?: unknown;
  total_quantity_kg?: unknown;
  min_commitment_kg?: unknown;
  price_per_kg?: unknown;
  bag_size_kg?: unknown;
  min_bags_to_succeed?: unknown;
  currency?: unknown;
  expiry_date?: unknown;
  commitment_deadline?: unknown;
  flavor_notes?: unknown;
  certifications?: unknown;
  images?: unknown;
  status?: unknown;
  // Tiers arrive in the post-cutover shape: each row carries `min_bags`
  // (integer ≥ 1) and `price_per_kg`. `min_quantity_kg` is intentionally
  // omitted — Task 3.3 persists tier rows with min_bags set and the legacy
  // kg column NULL. We keep the field-level type as `unknown` so the route
  // is responsible for parsing/validation rather than trusting the caller.
  pricing_tiers?: Array<{
    min_bags?: unknown;
    price_per_kg?: unknown;
    // Accept (and ignore) the legacy key in case any older caller still
    // sends it — `min_bags` always wins. See "Backwards compat" below.
    min_quantity_kg?: unknown;
  }>;
};

type ParsedTier = {
  min_bags: number;
  price_per_kg: number;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toIntegerOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only sellers may create lots. Buyers and hub owners are barred so they
  // can't seed lots assigned to themselves (mirrors the bulk-import guard).
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, stripe_connect_account_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "seller") {
    return NextResponse.json(
      { error: "Only sellers can create lots" },
      { status: 403 }
    );
  }

  // Sellers need a connected Stripe account before listing — there's no
  // payout destination otherwise.
  if (!profile?.stripe_connect_account_id) {
    return NextResponse.json(
      {
        error:
          "Connect your Stripe account before creating lots. Visit Seller Payouts to finish setup.",
      },
      { status: 403 }
    );
  }

  const body = (await request.json()) as CreateLotBody;

  // --- Basic field-presence + type checks ---------------------------------
  // These are local to this route (no shared zod schema exists yet). We
  // surface multiple field errors at once so the form can show them inline.
  const fieldErrors: Record<string, string> = {};

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) fieldErrors.title = "Title is required.";

  const originCountry =
    typeof body.origin_country === "string" ? body.origin_country.trim() : "";
  if (!originCountry) fieldErrors.origin_country = "Origin country is required.";

  const totalQuantityKg = toFiniteNumber(body.total_quantity_kg);
  if (totalQuantityKg === null || totalQuantityKg <= 0) {
    fieldErrors.total_quantity_kg = "Total quantity must be a positive number.";
  }

  const minCommitmentKg = toFiniteNumber(body.min_commitment_kg);
  if (minCommitmentKg === null || minCommitmentKg <= 0) {
    fieldErrors.min_commitment_kg = "Minimum commitment must be a positive number.";
  }

  if (
    totalQuantityKg !== null &&
    minCommitmentKg !== null &&
    minCommitmentKg > totalQuantityKg
  ) {
    fieldErrors.min_commitment_kg =
      "Minimum commitment cannot be greater than the total quantity.";
  }

  const pricePerKg = toFiniteNumber(body.price_per_kg);
  if (pricePerKg === null || pricePerKg <= 0) {
    fieldErrors.price_per_kg = "Price per kg must be a positive number.";
  }

  // --- Bag config validation ----------------------------------------------
  // Per AC9, when min_bags_to_succeed is omitted we default to 1 *before*
  // calling validateBagConfig — so the validator rejects only 0/negative/
  // non-integer values, never "missing field". The default may still itself
  // be rejected (e.g. when floor(total/bag) === 0), and that's correct:
  // surfacing the underlying mismatch rather than silently coercing.
  const bagSizeRaw = body.bag_size_kg;
  const bagSize =
    bagSizeRaw === undefined || bagSizeRaw === null || bagSizeRaw === ""
      ? null
      : toIntegerOrNull(bagSizeRaw);

  const minBagsRaw = body.min_bags_to_succeed;
  const minBagsProvided =
    minBagsRaw !== undefined && minBagsRaw !== null && minBagsRaw !== "";
  const minBags = minBagsProvided ? toIntegerOrNull(minBagsRaw) : 1;

  // Only run the deep validator when we have the numeric companions it needs.
  // Otherwise total_quantity_kg / min_commitment_kg errors already failed
  // above and the validator would just re-surface those.
  if (totalQuantityKg !== null && minCommitmentKg !== null) {
    const bagResult = validateBagConfig({
      bag_size_kg: bagSize,
      min_bags_to_succeed: minBags,
      total_quantity_kg: totalQuantityKg,
      min_commitment_kg: minCommitmentKg,
    });

    if (bagResult.valid === false) {
      for (const [key, message] of Object.entries(bagResult.errors)) {
        // Preserve validator's error keys verbatim (do not re-key) — the form
        // surfaces them by field name.
        fieldErrors[key] = message;
      }
    }
  } else {
    // If we couldn't run the validator due to missing totals, still require
    // bag_size_kg explicitly. New lots must declare a bag size (AC1).
    if (bagSize === null) {
      fieldErrors.bag_size_kg =
        "Bag size must be a whole number between 1 and 100 kg.";
    }
  }

  // --- Pricing tier parsing + validation ----------------------------------
  // Tiers now key off `min_bags` (Task 3.2/3.3) — bag-count threshold rather
  // than kg threshold. We validate up front (before inserting the lot) so an
  // invalid tier doesn't leave behind an orphan lot row. Errors are flattened
  // into the same `fieldErrors` map the rest of the route uses, keyed as
  // `pricing_tiers[i].<field>` so the form can either surface them inline or
  // aggregate them under a single tier panel.
  let parsedTiers: ParsedTier[] = [];
  if (body.pricing_tiers !== undefined && body.pricing_tiers !== null) {
    if (!Array.isArray(body.pricing_tiers)) {
      fieldErrors.pricing_tiers = "Pricing tiers must be a list.";
    } else if (body.pricing_tiers.length > 0) {
      // Bag ceiling: only meaningful when total/bag are both valid. When
      // unavailable we still check `min_bags >= 1` and ascending order so the
      // user gets *some* tier feedback alongside the lot-level errors.
      const bagCeiling =
        totalQuantityKg !== null && bagSize !== null && bagSize >= 1
          ? Math.floor(totalQuantityKg / bagSize)
          : null;

      const tierResults: ParsedTier[] = [];
      let previousMinBags: number | null = null;

      for (let i = 0; i < body.pricing_tiers.length; i++) {
        const raw = body.pricing_tiers[i];
        // Backwards compat: prefer `min_bags`. If only `min_quantity_kg` is
        // supplied, we deliberately do NOT auto-convert — the seller must
        // restate the threshold in bags (matches the rationale in migration
        // #36 for not auto-converting existing tier rows).
        const minBagsParsed = toIntegerOrNull(raw?.min_bags);
        const pricePerKgParsed = toFiniteNumber(raw?.price_per_kg);

        if (minBagsParsed === null || minBagsParsed < 1) {
          fieldErrors[`pricing_tiers[${i}].min_bags`] =
            "Min bags must be a whole number of 1 or more.";
        } else if (bagCeiling !== null && minBagsParsed > bagCeiling) {
          fieldErrors[`pricing_tiers[${i}].min_bags`] =
            `Min bags can't exceed the lot's bag count (${bagCeiling}).`;
        } else if (previousMinBags !== null) {
          if (minBagsParsed === previousMinBags) {
            fieldErrors[`pricing_tiers[${i}].min_bags`] =
              `Min bags (${minBagsParsed}) duplicates the previous tier.`;
          } else if (minBagsParsed < previousMinBags) {
            fieldErrors[`pricing_tiers[${i}].min_bags`] =
              `Min bags must be greater than the previous tier (${previousMinBags}).`;
          }
        }

        if (pricePerKgParsed === null || pricePerKgParsed <= 0) {
          fieldErrors[`pricing_tiers[${i}].price_per_kg`] =
            "Tier price per kg must be a positive number.";
        }

        // Track the previous *valid* min_bags so a single bad row doesn't
        // cascade an "out of order" error onto the next one.
        if (
          minBagsParsed !== null &&
          minBagsParsed >= 1 &&
          (bagCeiling === null || minBagsParsed <= bagCeiling)
        ) {
          previousMinBags = minBagsParsed;
        }

        if (
          minBagsParsed !== null &&
          minBagsParsed >= 1 &&
          pricePerKgParsed !== null &&
          pricePerKgParsed > 0
        ) {
          tierResults.push({
            min_bags: minBagsParsed,
            price_per_kg: pricePerKgParsed,
          });
        }
      }

      parsedTiers = tierResults;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ errors: fieldErrors }, { status: 400 });
  }

  // --- Persist -------------------------------------------------------------
  const deadlineRaw =
    typeof body.commitment_deadline === "string"
      ? body.commitment_deadline
      : typeof body.expiry_date === "string"
        ? body.expiry_date
        : null;

  const status = typeof body.status === "string" ? body.status : "active";
  const currency =
    typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : "USD";

  const insertRow = {
    seller_id: user.id,
    title,
    origin_country: originCountry,
    region: typeof body.region === "string" && body.region.trim() ? body.region.trim() : null,
    farm: typeof body.farm === "string" && body.farm.trim() ? body.farm.trim() : null,
    variety:
      typeof body.variety === "string" && body.variety.trim() ? body.variety.trim() : null,
    process:
      typeof body.process === "string" && body.process.trim() ? body.process.trim() : null,
    altitude_min: toIntegerOrNull(body.altitude_min),
    altitude_max: toIntegerOrNull(body.altitude_max),
    crop_year:
      typeof body.crop_year === "string" && body.crop_year.trim()
        ? body.crop_year.trim()
        : null,
    score: toFiniteNumber(body.score),
    description:
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null,
    total_quantity_kg: totalQuantityKg as number,
    min_commitment_kg: minCommitmentKg as number,
    price_per_kg: pricePerKg as number,
    bag_size_kg: bagSize,
    min_bags_to_succeed: minBags as number,
    currency,
    status,
    commitment_deadline: deadlineRaw,
    expiry_date: typeof body.expiry_date === "string" ? body.expiry_date : null,
    flavor_notes: toStringArray(body.flavor_notes),
    certifications: toStringArray(body.certifications),
    images: toStringArray(body.images),
  };

  const { data: lot, error } = await supabase
    .from("lots")
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Persist pricing tiers in the post-cutover shape — `min_bags` carries the
  // bag-count threshold, `min_quantity_kg` is explicitly NULL on every new
  // row (migration #37 relaxed the NOT NULL constraint to allow this). The
  // tier shape was validated up front, so any rows reaching this point are
  // safe to insert.
  if (parsedTiers.length > 0) {
    const tierRows = parsedTiers.map((t) => ({
      lot_id: lot.id,
      min_bags: t.min_bags,
      min_quantity_kg: null,
      price_per_kg: t.price_per_kg,
    }));
    await supabase.from("pricing_tiers").insert(tierRows);
  }

  return NextResponse.json({ lot }, { status: 201 });
}
