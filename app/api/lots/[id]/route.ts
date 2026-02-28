import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

  // Check if any commitments exist
  const { count } = await supabase
    .from("commitments")
    .select("id", { count: "exact", head: true })
    .eq("lot_id", id)
    .not("stripe_payment_intent_id", "is", null);

  return NextResponse.json({
    lot,
    pricing_tiers: tiers || [],
    has_commitments: (count || 0) > 0,
    commitment_count: count || 0,
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

  // Verify ownership
  const { data: lot } = await supabase
    .from("lots")
    .select("id, seller_id")
    .eq("id", id)
    .eq("seller_id", user.id)
    .single();

  if (!lot) {
    return NextResponse.json({ error: "Lot not found or not yours" }, { status: 404 });
  }

  // Check for existing commitments
  const { count } = await supabase
    .from("commitments")
    .select("id", { count: "exact", head: true })
    .eq("lot_id", id)
    .not("stripe_payment_intent_id", "is", null);

  if ((count || 0) > 0) {
    return NextResponse.json(
      { error: "Cannot edit a lot with existing commitments" },
      { status: 409 }
    );
  }

  const body = await request.json();
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
    commitment_deadline,
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
      commitment_deadline: commitment_deadline || null,
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
