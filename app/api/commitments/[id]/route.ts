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
  const { action } = body;

  if (action !== "mark_picked_up") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  // Fetch the commitment to get lot_id for hub ownership verification
  const { data: commitment, error: fetchError } = await supabase
    .from("commitments")
    .select("id, lot_id, picked_up_at")
    .eq("id", id)
    .single();

  if (fetchError || !commitment) {
    return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
  }

  if (commitment.picked_up_at) {
    return NextResponse.json({ error: "Already marked as picked up" }, { status: 409 });
  }

  // Verify the caller is the hub owner for this lot's hub
  const { data: lot } = await supabase
    .from("lots")
    .select("hub_id")
    .eq("id", commitment.lot_id)
    .single();

  if (!lot?.hub_id) {
    return NextResponse.json({ error: "Lot has no associated hub" }, { status: 400 });
  }

  const { data: hub } = await supabase
    .from("hubs")
    .select("owner_id")
    .eq("id", lot.hub_id)
    .single();

  if (!hub || hub.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Mark as picked up — RLS UPDATE policy also enforces hub ownership at DB level
  const { data: updated, error: updateError } = await supabase
    .from("commitments")
    .update({
      picked_up_at: new Date().toISOString(),
      picked_up_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
