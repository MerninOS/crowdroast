import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { lot_id, quantity_kg, notes, hub_id } = body;

  if (!lot_id || !quantity_kg || quantity_kg <= 0) {
    return NextResponse.json(
      { error: "lot_id and a positive quantity_kg are required" },
      { status: 400 }
    );
  }

  // Fetch lot
  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("*")
    .eq("id", lot_id)
    .single();

  if (lotError || !lot) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }

  if (lot.status !== "active") {
    return NextResponse.json(
      { error: "Lot is not accepting commitments" },
      { status: 400 }
    );
  }

  // Check deadline
  if (lot.commitment_deadline && new Date(lot.commitment_deadline) < new Date()) {
    return NextResponse.json(
      { error: "Commitment deadline has passed" },
      { status: 400 }
    );
  }

  if (lot.seller_id === user.id) {
    return NextResponse.json(
      { error: "Cannot commit to your own lot" },
      { status: 400 }
    );
  }

  const remaining = lot.total_quantity_kg - lot.committed_quantity_kg;
  if (quantity_kg > remaining) {
    return NextResponse.json(
      { error: `Only ${remaining} kg remaining` },
      { status: 400 }
    );
  }

  // Fetch pricing tiers to determine the active price
  const { data: tiers } = await supabase
    .from("pricing_tiers")
    .select("*")
    .eq("lot_id", lot_id)
    .order("min_quantity_kg", { ascending: false });

  // After this commitment, the new total committed quantity
  const newTotal = lot.committed_quantity_kg + quantity_kg;

  // Find the highest tier that the new total reaches
  let activePricePerKg = lot.price_per_kg; // base price
  if (tiers && tiers.length > 0) {
    for (const tier of tiers) {
      if (newTotal >= tier.min_quantity_kg) {
        activePricePerKg = tier.price_per_kg;
        break; // tiers are sorted desc, so first match is the highest applicable
      }
    }
  }

  const total_price = quantity_kg * activePricePerKg;

  const { data, error } = await supabase
    .from("commitments")
    .insert({
      lot_id,
      buyer_id: user.id,
      hub_id: hub_id || null,
      quantity_kg,
      price_per_kg: activePricePerKg,
      total_price,
      notes: notes || null,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
