import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Find active membership
  const { data: membership } = await adminClient
    .from("hub_members")
    .select("id, hub_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "You are not a member of any hub" }, { status: 404 });
  }

  // Check for open commitments on lots with future deadlines
  const { data: openCommitments } = await adminClient
    .from("commitments")
    .select("id, lot:lots!commitments_lot_id_fkey(id, title, commitment_deadline)")
    .eq("buyer_id", user.id)
    .eq("hub_id", membership.hub_id)
    .neq("status", "cancelled");

  const blockingLots = (openCommitments || []).filter((c: any) => {
    const lot = Array.isArray(c.lot) ? c.lot[0] : c.lot;
    if (!lot?.commitment_deadline) return false;
    return new Date(lot.commitment_deadline).getTime() > Date.now();
  });

  if (blockingLots.length > 0) {
    const lotNames = blockingLots.map((c: any) => {
      const lot = Array.isArray(c.lot) ? c.lot[0] : c.lot;
      return lot?.title || "Unknown lot";
    });
    return NextResponse.json(
      {
        error: "You have open commitments on lots that haven't closed yet",
        blocking_lots: lotNames,
      },
      { status: 409 }
    );
  }

  // Remove membership
  const { error } = await adminClient
    .from("hub_members")
    .update({ status: "removed" })
    .eq("id", membership.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "You have left the hub" });
}
