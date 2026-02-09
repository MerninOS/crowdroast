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
  const { lot_id, quantity_grams, shipping_address, notes } = body;

  if (!lot_id) {
    return NextResponse.json(
      { error: "lot_id is required" },
      { status: 400 }
    );
  }

  // Check for existing pending sample request
  const { data: existing } = await supabase
    .from("sample_requests")
    .select("id")
    .eq("lot_id", lot_id)
    .eq("buyer_id", user.id)
    .in("status", ["pending", "approved", "shipped"])
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "You already have a pending sample request for this lot" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("sample_requests")
    .insert({
      lot_id,
      buyer_id: user.id,
      quantity_grams: quantity_grams || 100,
      shipping_address: shipping_address || null,
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
