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

  const { data: commitment, error: fetchError } = await supabase
    .from("commitments")
    .select("id, lot_id, buyer_id, picked_up_at")
    .eq("id", id)
    .single();

  if (fetchError || !commitment) {
    return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
  }

  if (commitment.picked_up_at) {
    return NextResponse.json({ error: "Already marked as picked up" }, { status: 409 });
  }

  // The caller is allowed if they are either:
  //   (a) the buyer who placed the commitment (self-pickup at hub), or
  //   (b) the hub owner for the lot's hub (hub-side confirmation).
  let allowed = commitment.buyer_id === user.id;

  if (!allowed) {
    const { data: lot } = await supabase
      .from("lots")
      .select("hub_id")
      .eq("id", commitment.lot_id)
      .single();

    if (lot?.hub_id) {
      const { data: hub } = await supabase
        .from("hubs")
        .select("owner_id")
        .eq("id", lot.hub_id)
        .single();
      if (hub?.owner_id === user.id) allowed = true;
    }
  }

  if (!allowed) {
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
