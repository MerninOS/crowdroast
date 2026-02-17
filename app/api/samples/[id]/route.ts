import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

  const body = await request.json();
  const { status, tracking_number, cupping_scheduled_at } = body;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: sample } = await supabase
    .from("sample_requests")
    .select("id, buyer_id, lot_id, hub_id, lot:lots!sample_requests_lot_id_fkey(seller_id)")
    .eq("id", id)
    .single();

  if (!sample) {
    return NextResponse.json({ error: "Sample request not found" }, { status: 404 });
  }

  const sellerId = Array.isArray(sample.lot) ? sample.lot[0]?.seller_id : (sample.lot as { seller_id?: string } | null)?.seller_id;
  const isSellerForLot = sellerId === user.id;
  const isRequester = sample.buyer_id === user.id;

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const isCuppingUpdate = cupping_scheduled_at !== undefined;
  const isSellerUpdate = status !== undefined || tracking_number !== undefined;

  if (isSellerUpdate) {
    if (!isSellerForLot) {
      return NextResponse.json(
        { error: "Only the seller for this lot can update sample status or tracking" },
        { status: 403 }
      );
    }
    if (status) updateData.status = status;
    if (tracking_number !== undefined) {
      updateData.tracking_number =
        typeof tracking_number === "string" && tracking_number.trim()
          ? tracking_number.trim()
          : null;
    }
  }

  if (isCuppingUpdate) {
    if (profile?.role !== "hub_owner" || !isRequester) {
      return NextResponse.json(
        { error: "Only the requesting hub owner can host a cupping" },
        { status: 403 }
      );
    }
    if (cupping_scheduled_at === null || cupping_scheduled_at === "") {
      updateData.cupping_scheduled_at = null;
    } else {
      const scheduled = new Date(cupping_scheduled_at);
      if (Number.isNaN(scheduled.getTime())) {
        return NextResponse.json(
          { error: "Invalid cupping date/time" },
          { status: 400 }
        );
      }
      updateData.cupping_scheduled_at = scheduled.toISOString();
    }
  }

  if (!isSellerUpdate && !isCuppingUpdate) {
    return NextResponse.json(
      { error: "No valid update fields provided" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("sample_requests")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
