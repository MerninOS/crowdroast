import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hubId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hubId } = await params;
  const body = await request.json();
  const { lot_id } = body;

  if (!lot_id) {
    return NextResponse.json({ error: "lot_id is required" }, { status: 400 });
  }

  // Verify caller owns this hub
  const { data: hub, error: hubError } = await supabase
    .from("hubs")
    .select("id, owner_id")
    .eq("id", hubId)
    .single();

  if (hubError || !hub) {
    return NextResponse.json({ error: "Hub not found" }, { status: 404 });
  }

  if (hub.owner_id !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the lot is in this hub's catalog
  const { data: hubLot } = await supabase
    .from("hub_lots")
    .select("id")
    .eq("hub_id", hubId)
    .eq("lot_id", lot_id)
    .single();

  if (!hubLot) {
    return NextResponse.json(
      { error: "Lot is not in this hub's catalog" },
      { status: 400 }
    );
  }

  // Verify the lot has an active campaign for this hub
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("hub_id", hubId)
    .eq("lot_id", lot_id)
    .eq("status", "active")
    .single();

  if (!campaign) {
    return NextResponse.json(
      { error: "Lot does not have an active campaign in this hub" },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("hubs")
    .update({ featured_lot_id: lot_id })
    .eq("id", hubId)
    .select("featured_lot_id")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Failed to update featured lot" }, { status: 500 });
  }

  return NextResponse.json({ featured_lot_id: updated.featured_lot_id });
}
