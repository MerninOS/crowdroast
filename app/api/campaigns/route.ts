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
  const deadline = typeof body?.deadline === "string" ? body.deadline : "";

  if (!hubId || !lotId || !deadline) {
    return NextResponse.json(
      { error: "hub_id, lot_id, and deadline are required" },
      { status: 400 }
    );
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

  // Verify lot exists and is active or fully_committed
  const { data: lot } = await supabase
    .from("lots")
    .select("id, title, status, expiry_date")
    .eq("id", lotId)
    .in("status", ["active", "fully_committed"])
    .single();

  if (!lot) {
    return NextResponse.json(
      { error: "Lot not found or not available" },
      { status: 404 }
    );
  }

  // Validate deadline
  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid deadline date" },
      { status: 400 }
    );
  }

  const now = new Date();
  if (deadlineDate <= now) {
    return NextResponse.json(
      { error: "Deadline must be in the future" },
      { status: 400 }
    );
  }

  const maxDeadline = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (deadlineDate > maxDeadline) {
    return NextResponse.json(
      { error: "Deadline must be within 30 days from now" },
      { status: 400 }
    );
  }

  if (lot.expiry_date && deadlineDate >= new Date(lot.expiry_date)) {
    return NextResponse.json(
      { error: "Deadline must be before lot expiry date" },
      { status: 400 }
    );
  }

  // Insert campaign
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      hub_id: hubId,
      lot_id: lotId,
      deadline: deadlineDate.toISOString(),
      status: "active",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This lot has already been claimed by another hub" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(campaign, { status: 201 });
}
