import { createClient } from "@/lib/supabase/server";
import { sendSampleRequestEmail } from "@/lib/email";
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
  const { lot_id, quantity_grams, shipping_address, notes, hub_id } = body;

  if (!lot_id) {
    return NextResponse.json(
      { error: "lot_id is required" },
      { status: 400 }
    );
  }

  if (!hub_id) {
    return NextResponse.json(
      { error: "hub_id is required" },
      { status: 400 }
    );
  }

  if (!shipping_address || typeof shipping_address !== "string" || !shipping_address.trim()) {
    return NextResponse.json(
      { error: "shipping_address is required" },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "hub_owner") {
    return NextResponse.json(
      { error: "Only hub owners can request samples" },
      { status: 403 }
    );
  }

  const { data: hub } = await supabase
    .from("hubs")
    .select("id")
    .eq("id", hub_id)
    .eq("owner_id", user.id)
    .single();

  if (!hub) {
    return NextResponse.json(
      { error: "You can only request samples for hubs you own" },
      { status: 403 }
    );
  }

  const { data: lot } = await supabase
    .from("lots")
    .select("id, seller_id")
    .eq("id", lot_id)
    .single();

  if (!lot) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }

  if (lot.seller_id === user.id) {
    return NextResponse.json(
      { error: "Cannot request a sample from your own lot" },
      { status: 400 }
    );
  }

  // Check for existing pending sample request
  const { data: existing } = await supabase
    .from("sample_requests")
    .select("id")
    .eq("lot_id", lot_id)
    .eq("buyer_id", user.id)
    .eq("hub_id", hub_id)
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
      hub_id,
      quantity_grams: quantity_grams || 100,
      shipping_address: shipping_address.trim(),
      notes: notes || null,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // AC-2: notify seller of the sample request
  const [sellerRes, hubOwnerRes, lotTitleRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, contact_name")
      .eq("id", lot.seller_id)
      .single(),
    supabase
      .from("profiles")
      .select("contact_name, company_name")
      .eq("id", user.id)
      .single(),
    supabase.from("lots").select("title").eq("id", lot_id).single(),
  ]);

  if (sellerRes.data && hubOwnerRes.data) {
    await sendSampleRequestEmail({
      seller: sellerRes.data,
      hubOwner: hubOwnerRes.data,
      shippingAddress: shipping_address,
      sampleItems: [
        {
          lotTitle: lotTitleRes.data?.title || "Coffee Lot",
          quantityGrams: quantity_grams || 100,
          notes: notes || null,
        },
      ],
    }).catch(console.error);
  }

  return NextResponse.json(data, { status: 201 });
}
