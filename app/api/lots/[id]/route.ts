import { createClient } from "@/lib/supabase/server";
import { validateBagConfig } from "@/lib/lots/validate-bag-config";
import { NextResponse } from "next/server";

type BagConversionEntry = { tier_id: string; min_bags: number };

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

function isBagConfigPayload(body: Record<string, unknown>): boolean {
  return (
    "bag_size_kg" in body ||
    "min_bags_to_succeed" in body ||
    "pricing_tiers_bag_conversion" in body
  );
}

function parseBagConversion(
  raw: unknown
): { ok: true; entries: BagConversionEntry[] } | { ok: false; reason: string } {
  if (raw === undefined) return { ok: true, entries: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, reason: "pricing_tiers_bag_conversion must be an array." };
  }
  const entries: BagConversionEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return {
        ok: false,
        reason: "Each tier conversion entry must be an object.",
      };
    }
    const candidate = item as { tier_id?: unknown; min_bags?: unknown };
    const tierId =
      typeof candidate.tier_id === "string" ? candidate.tier_id.trim() : "";
    const minBags = toIntegerOrNull(candidate.min_bags);
    if (!tierId) {
      return {
        ok: false,
        reason: "Each tier conversion entry must include a tier_id.",
      };
    }
    if (minBags === null || minBags < 1) {
      return {
        ok: false,
        reason: "Each tier conversion entry must include min_bags ≥ 1.",
      };
    }
    entries.push({ tier_id: tierId, min_bags: minBags });
  }
  return { ok: true, entries };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: lot, error } = await supabase
    .from("lots")
    .select("*")
    .eq("id", id)
    .eq("seller_id", user.id)
    .single();

  if (error || !lot) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }

  // Fetch pricing tiers
  const { data: tiers } = await supabase
    .from("pricing_tiers")
    .select("*")
    .eq("lot_id", id)
    .order("min_quantity_kg", { ascending: true });

  // The edit-lock UI mirrors the PATCH guard: a lot is editable unless a
  // campaign is currently active. Historical commitments don't lock it.
  const { data: activeCampaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("lot_id", id)
    .eq("status", "active")
    .maybeSingle();

  return NextResponse.json({
    lot,
    pricing_tiers: tiers || [],
    has_active_campaign: Boolean(activeCampaign),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership and read status — only certain statuses are editable.
  // Bag-config backfill (Task 3.7) also requires owner-only access (strict —
  // no hub-owner or admin path), so the same lookup serves both flows.
  const { data: lot } = await supabase
    .from("lots")
    .select("id, seller_id, status, total_quantity_kg, min_commitment_kg")
    .eq("id", id)
    .eq("seller_id", user.id)
    .single();

  if (!lot) {
    return NextResponse.json({ error: "Lot not found or not yours" }, { status: 404 });
  }

  // Status allowlist: a lot is only editable in pre-sale states. Once it
  // ships, is delivered, or hits a closed/expired terminal state, sellers
  // can't retroactively change the terms buyers committed against.
  const editableStatuses = ["draft", "active", "awaiting_relist"];
  if (!editableStatuses.includes(lot.status)) {
    return NextResponse.json(
      { error: `Cannot edit a lot in ${lot.status} state` },
      { status: 409 }
    );
  }

  const body = await request.json();

  // Bag-config backfill branch (Task 3.7).
  // Runs before the generic active-campaign 409 gate so we can return the
  // task-specified 400 + custom copy. The active-campaign check still
  // happens — it's just scoped to this branch with the right shape.
  if (
    body &&
    typeof body === "object" &&
    isBagConfigPayload(body as Record<string, unknown>)
  ) {
    return handleBagConfigBackfill({
      supabase,
      lot: lot as {
        id: string;
        seller_id: string;
        status: string;
        total_quantity_kg: number;
        min_commitment_kg: number;
      },
      body: body as Record<string, unknown>,
    });
  }

  // Block edits while an active campaign is running. Historical commitments
  // from closed campaigns no longer lock the lot — sellers need to adjust
  // their lot during the awaiting_relist review window.
  const { data: activeCampaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("lot_id", id)
    .eq("status", "active")
    .maybeSingle();

  if (activeCampaign) {
    return NextResponse.json(
      { error: "Cannot edit a lot with an active campaign" },
      { status: 409 }
    );
  }

  if (
    typeof body?.status === "string" &&
    Object.keys(body).length === 1
  ) {
    const nextStatus = body.status;

    if (nextStatus !== "active" && nextStatus !== "draft") {
      return NextResponse.json(
        { error: "Status must be either active or draft" },
        { status: 400 }
      );
    }

    const { data: updatedStatusLot, error: statusError } = await supabase
      .from("lots")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (statusError) {
      return NextResponse.json({ error: statusError.message }, { status: 500 });
    }

    return NextResponse.json({ lot: updatedStatusLot });
  }

  const {
    title,
    origin_country,
    region,
    farm,
    variety,
    process,
    altitude_min,
    altitude_max,
    crop_year,
    score,
    description,
    total_quantity_kg,
    min_commitment_kg,
    price_per_kg,
    expiry_date,
    flavor_notes,
    certifications,
    images,
    pricing_tiers,
  } = body;

  // Update the lot
  const { data: updated, error } = await supabase
    .from("lots")
    .update({
      title,
      origin_country,
      region: region || null,
      farm: farm || null,
      variety: variety || null,
      process: process || null,
      altitude_min: altitude_min ? Number.parseInt(altitude_min) : null,
      altitude_max: altitude_max ? Number.parseInt(altitude_max) : null,
      crop_year: crop_year || null,
      score: score ? Number.parseFloat(score) : null,
      description: description || null,
      total_quantity_kg: Number.parseFloat(total_quantity_kg),
      min_commitment_kg: Number.parseFloat(min_commitment_kg),
      price_per_kg: Number.parseFloat(price_per_kg),
      expiry_date: expiry_date || null,
      commitment_deadline: expiry_date || null,
      flavor_notes: flavor_notes || [],
      certifications: certifications || [],
      images: images || [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Replace pricing tiers: delete old ones, insert new ones
  await supabase.from("pricing_tiers").delete().eq("lot_id", id);

  if (pricing_tiers && pricing_tiers.length > 0) {
    const tierRows = pricing_tiers.map(
      (t: { min_quantity_kg: number; price_per_kg: number }) => ({
        lot_id: id,
        min_quantity_kg: t.min_quantity_kg,
        price_per_kg: t.price_per_kg,
      })
    );
    await supabase.from("pricing_tiers").insert(tierRows);
  }

  // Remove this lot from ALL hub catalogs so hub owners must review changes
  await supabase.from("hub_lots").delete().eq("lot_id", id);

  return NextResponse.json({ lot: updated });
}

// ---------------------------------------------------------------------------
// Bag-config backfill handler (Task 3.7)
//
// Legacy lots created before the bag-aware migration have `bag_size_kg = NULL`
// and need the seller to declare a bag size before commits will be accepted
// (see `app/api/commitments/route.ts` for the matching guard). This handler
// runs inside PATCH when the body contains any of:
//   - bag_size_kg
//   - min_bags_to_succeed
//   - pricing_tiers_bag_conversion
//
// It is intentionally scoped: it does NOT touch unrelated lot fields, and it
// rejects (400) the moment a campaign is active on the lot — mid-flight schema
// changes are the explicit thing we're preventing.
// ---------------------------------------------------------------------------

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function handleBagConfigBackfill(args: {
  supabase: SupabaseServerClient;
  lot: {
    id: string;
    seller_id: string;
    status: string;
    total_quantity_kg: number;
    min_commitment_kg: number;
  };
  body: Record<string, unknown>;
}): Promise<NextResponse> {
  const { supabase, lot, body } = args;

  // Active-campaign gate — bag-config specific copy and 400 per task spec.
  // We check both `campaigns(status='active')` and `commitments` existence:
  // either one means buyers have already engaged with the lot under its
  // current (legacy) terms, and silently re-keying tiers from kg→bags would
  // change what those buyers thought they were committing to.
  const { data: activeCampaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("lot_id", lot.id)
    .eq("status", "active")
    .maybeSingle();

  if (activeCampaign) {
    return NextResponse.json(
      {
        error:
          "Can't change bag config while a campaign is active. End the campaign first.",
      },
      { status: 400 }
    );
  }

  // Defensive secondary check: any commitment row on the lot. In practice
  // commitments only exist alongside a campaign, but we also guard against
  // orphaned/manually-seeded rows.
  const { count: commitmentCount } = await supabase
    .from("commitments")
    .select("id", { count: "exact", head: true })
    .eq("lot_id", lot.id);

  if ((commitmentCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "Can't change bag config while a campaign is active. End the campaign first.",
      },
      { status: 400 }
    );
  }

  // --- Parse + validate ---------------------------------------------------
  const bagSizeRaw = body.bag_size_kg;
  const bagSizeProvided = "bag_size_kg" in body;
  const bagSize = bagSizeProvided
    ? bagSizeRaw === null || bagSizeRaw === ""
      ? null
      : toIntegerOrNull(bagSizeRaw)
    : null;

  const minBagsRaw = body.min_bags_to_succeed;
  const minBagsProvided =
    "min_bags_to_succeed" in body &&
    minBagsRaw !== undefined &&
    minBagsRaw !== null &&
    minBagsRaw !== "";
  const minBags = minBagsProvided ? toIntegerOrNull(minBagsRaw) : 1;

  const conversionParse = parseBagConversion(body.pricing_tiers_bag_conversion);
  if (!conversionParse.ok) {
    return NextResponse.json(
      { errors: { pricing_tiers_bag_conversion: conversionParse.reason } },
      { status: 400 }
    );
  }

  const bagResult = validateBagConfig({
    bag_size_kg: bagSize,
    min_bags_to_succeed: minBags,
    total_quantity_kg: lot.total_quantity_kg,
    min_commitment_kg: lot.min_commitment_kg,
  });

  if (bagResult.valid === false) {
    return NextResponse.json({ errors: bagResult.errors }, { status: 400 });
  }

  // --- Persist ------------------------------------------------------------
  // Update the lot's bag columns. We deliberately leave every other field
  // alone (no title/price/etc. side effects from a backfill PATCH).
  const { data: updatedLot, error: updateError } = await supabase
    .from("lots")
    .update({
      bag_size_kg: bagSize,
      min_bags_to_succeed: minBags as number,
      updated_at: new Date().toISOString(),
    })
    .eq("id", lot.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Apply tier conversions sequentially. Best-effort: a single failed tier
  // doesn't roll back the lot update — the UI will surface unmapped tiers on
  // the next load so the seller can re-attempt.
  for (const entry of conversionParse.entries) {
    await supabase
      .from("pricing_tiers")
      .update({ min_bags: entry.min_bags })
      .eq("id", entry.tier_id)
      .eq("lot_id", lot.id);
  }

  return NextResponse.json({ lot: updatedLot });
}
