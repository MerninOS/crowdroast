import { createClient } from "@/lib/supabase/server";
import { sendLotShippedEmailsBatch, sendReadyForPickupEmailsBatch } from "@/lib/email";
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
  const { status, carrier, tracking_number, notes, is_local_pickup } = body;

  // Fetch current shipment to verify authorization and validate state transition
  const { data: current, error: fetchError } = await supabase
    .from("shipments")
    .select("id, lot_id, hub_id, status")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  // Verify caller is seller or hub owner for this shipment
  const [{ data: lot }, { data: hub }] = await Promise.all([
    supabase.from("lots").select("seller_id").eq("id", current.lot_id).single(),
    current.hub_id
      ? supabase.from("hubs").select("owner_id").eq("id", current.hub_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const isSeller = lot?.seller_id === user.id;
  const isHubOwner = (hub as { owner_id: string } | null)?.owner_id === user.id;
  if (!isSeller && !isHubOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate state transition
  const validTransitions: Record<string, string[]> = {
    pending: ["in_transit"],
    in_transit: ["at_hub"],
    at_hub: ["out_for_delivery", "delivered"],
    out_for_delivery: ["delivered"],
    delivered: [],
    cancelled: [],
  };

  if (!status || !validTransitions[current.status]?.includes(status)) {
    return NextResponse.json(
      { error: `Cannot transition from '${current.status}' to '${status}'` },
      { status: 400 }
    );
  }

  // Validate tracking fields when transitioning pending → in_transit
  if (status === "in_transit" && !is_local_pickup && !carrier) {
    return NextResponse.json(
      { error: "Carrier is required when not marking as local pickup" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    status,
    updated_at: now,
  };

  if (status === "in_transit") {
    updateData.shipped_at = now;
    if (carrier) updateData.carrier = carrier;
    if (tracking_number) updateData.tracking_number = tracking_number;
    if (notes) updateData.notes = notes;
  }

  if (status === "at_hub" || status === "delivered") {
    updateData.delivered_at = now;
  }

  const { data: shipment, error } = await supabase
    .from("shipments")
    .update(updateData)
    .eq("id", id)
    .select("id, lot_id, hub_id, carrier, tracking_number, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fire emails after confirmed DB update
  if (status === "in_transit") {
    void fireShippedEmails(supabase, shipment);
  } else if (status === "at_hub") {
    void firePickupEmails(supabase, shipment);
  }

  return NextResponse.json(shipment);
}

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

async function fireShippedEmails(
  supabase: SupabaseClient,
  shipment: { lot_id: string; hub_id: string | null; carrier: string | null; tracking_number: string | null }
) {
  try {
    const [lotResult, commitmentsResult] = await Promise.all([
      supabase.from("lots").select("id, title").eq("id", shipment.lot_id).single(),
      supabase.from("commitments").select("buyer_id").eq("lot_id", shipment.lot_id).eq("status", "confirmed"),
    ]);

    if (lotResult.error || !lotResult.data) {
      console.error("[shipments PATCH] Failed to fetch lot for shipped email:", lotResult.error);
      return;
    }
    if (commitmentsResult.error) {
      console.error("[shipments PATCH] Failed to fetch commitments for shipped email:", commitmentsResult.error);
      return;
    }

    const lot = lotResult.data;
    const buyerIds = (commitmentsResult.data ?? []).map((c) => c.buyer_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("email, contact_name")
      .in("id", buyerIds);
    const buyers = (profiles ?? []).map((p) => ({ buyer: p }));

    let hubOwner: { email: string | null; contact_name: string | null } | null = null;
    if (shipment.hub_id) {
      const { data: hub } = await supabase
        .from("hubs").select("owner_id").eq("id", shipment.hub_id).single();
      if (hub?.owner_id) {
        const { data: ownerProfile } = await supabase
          .from("profiles").select("email, contact_name").eq("id", hub.owner_id).single();
        hubOwner = ownerProfile ?? null;
      }
    }

    await sendLotShippedEmailsBatch({ lot, buyers, hubOwner, carrier: shipment.carrier, trackingNumber: shipment.tracking_number });
  } catch (err) {
    console.error("[shipments PATCH] Failed to send shipped emails:", err);
  }
}

async function firePickupEmails(
  supabase: SupabaseClient,
  shipment: { lot_id: string; hub_id: string | null }
) {
  if (!shipment.hub_id) return;

  try {
    const [lotResult, commitmentsResult, hubResult] = await Promise.all([
      supabase.from("lots").select("id, title").eq("id", shipment.lot_id).single(),
      supabase.from("commitments").select("buyer_id").eq("lot_id", shipment.lot_id).eq("status", "confirmed"),
      supabase.from("hubs").select("name, address, city, state, country").eq("id", shipment.hub_id).single(),
    ]);

    if (lotResult.error || !lotResult.data) {
      console.error("[shipments PATCH] Failed to fetch lot for pickup email:", lotResult.error);
      return;
    }
    if (commitmentsResult.error) {
      console.error("[shipments PATCH] Failed to fetch commitments for pickup email:", commitmentsResult.error);
      return;
    }
    if (hubResult.error || !hubResult.data) {
      console.error("[shipments PATCH] Failed to fetch hub for pickup email:", hubResult.error);
      return;
    }

    const buyerIds = (commitmentsResult.data ?? []).map((c) => c.buyer_id);
    const { data: profiles } = await supabase
      .from("profiles").select("email, contact_name").in("id", buyerIds);
    const buyers = (profiles ?? []).map((p) => ({ buyer: p }));

    await sendReadyForPickupEmailsBatch({ lot: lotResult.data, buyers, hub: hubResult.data });
  } catch (err) {
    console.error("[shipments PATCH] Failed to send pickup emails:", err);
  }
}
