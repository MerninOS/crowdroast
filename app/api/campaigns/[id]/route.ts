import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recycleLot } from "@/lib/lots/recycle-lot";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
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

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("*, lot:lots(*), hub:hubs(*)")
    .eq("id", id)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json(campaign);
}

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

  if (body?.status !== "cancelled") {
    return NextResponse.json(
      { error: "Only cancellation is supported" },
      { status: 400 }
    );
  }

  // Fetch campaign and verify it exists and is active
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, hub_id, lot_id, status")
    .eq("id", id)
    .single();

  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  if (campaign.status !== "active") {
    return NextResponse.json(
      { error: "Only active campaigns can be cancelled" },
      { status: 400 }
    );
  }

  // Verify caller owns the hub
  const { data: hub } = await supabase
    .from("hubs")
    .select("id")
    .eq("id", campaign.hub_id)
    .eq("owner_id", user.id)
    .single();

  if (!hub) {
    return NextResponse.json(
      { error: "Hub not found or you are not the owner" },
      { status: 403 }
    );
  }

  // Update campaign status to cancelled
  const { error: updateError } = await supabase
    .from("campaigns")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  // Cancel all pending commitments for this campaign
  await supabase
    .from("commitments")
    .update({
      status: "cancelled",
      payment_error: "Campaign was cancelled by hub owner",
    })
    .eq("campaign_id", id)
    .neq("status", "cancelled");

  // Recycle the lot back to the seller for review. Uses the admin client
  // because recycle_lot is granted only to service_role.
  const admin = createAdminClient();
  const recycleResult = await recycleLot(admin, campaign.lot_id);
  if (!recycleResult.ok) {
    console.error(
      `campaigns[id]: failed to recycle lot ${campaign.lot_id} after cancel`,
      recycleResult.error
    );
    return NextResponse.json(
      { error: "Campaign was cancelled but lot recycle failed; please contact support." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
