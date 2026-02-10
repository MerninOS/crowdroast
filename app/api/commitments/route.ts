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

  if (!lot_id || !quantity_kg) {
    return NextResponse.json(
      { error: "lot_id and quantity_kg are required" },
      { status: 400 }
    );
  }

  // Fetch lot to validate
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

  if (lot.seller_id === user.id) {
    return NextResponse.json(
      { error: "Cannot commit to your own lot" },
      { status: 400 }
    );
  }

  const remaining = lot.total_quantity_kg - lot.committed_quantity_kg;
  if (quantity_kg < lot.min_commitment_kg || quantity_kg > remaining) {
    return NextResponse.json(
      {
        error: `Quantity must be between ${lot.min_commitment_kg} and ${remaining} kg`,
      },
      { status: 400 }
    );
  }

  const total_price = quantity_kg * lot.price_per_kg;

  const { data, error } = await supabase
    .from("commitments")
    .insert({
      lot_id,
      buyer_id: user.id,
      hub_id: hub_id || null,
      quantity_kg,
      price_per_kg: lot.price_per_kg,
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
