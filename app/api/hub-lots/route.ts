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
  const hubId = typeof body?.hub_id === "string" ? body.hub_id : "";
  const lotId = typeof body?.lot_id === "string" ? body.lot_id : "";

  if (!hubId || !lotId) {
    return NextResponse.json({ error: "hub_id and lot_id are required" }, { status: 400 });
  }

  // Verify caller owns this hub
  const { data: hub } = await supabase
    .from("hubs")
    .select("id")
    .eq("id", hubId)
    .eq("owner_id", user.id)
    .single();

  if (!hub) {
    return NextResponse.json(
      { error: "Hub not found or you are not the owner" },
      { status: 403 }
    );
  }

  // Verify lot exists and is active
  const { data: lot } = await supabase
    .from("lots")
    .select("id")
    .eq("id", lotId)
    .in("status", ["active", "fully_committed"])
    .single();

  if (!lot) {
    return NextResponse.json({ error: "Lot not found or not available" }, { status: 404 });
  }

  const { error } = await supabase
    .from("hub_lots")
    .insert({ hub_id: hubId, lot_id: lotId });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const hubId = typeof body?.hub_id === "string" ? body.hub_id : "";
  const lotId = typeof body?.lot_id === "string" ? body.lot_id : "";

  if (!hubId || !lotId) {
    return NextResponse.json({ error: "hub_id and lot_id are required" }, { status: 400 });
  }

  // Verify caller owns this hub
  const { data: hub } = await supabase
    .from("hubs")
    .select("id")
    .eq("id", hubId)
    .eq("owner_id", user.id)
    .single();

  if (!hub) {
    return NextResponse.json(
      { error: "Hub not found or you are not the owner" },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from("hub_lots")
    .delete()
    .eq("hub_id", hubId)
    .eq("lot_id", lotId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
