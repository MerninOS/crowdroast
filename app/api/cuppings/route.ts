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
  const { hub_id, scheduled_at, sample_request_ids, notes } = body as {
    hub_id?: string;
    scheduled_at?: string;
    sample_request_ids?: string[];
    notes?: string | null;
  };

  if (!hub_id || !scheduled_at || !Array.isArray(sample_request_ids) || sample_request_ids.length === 0) {
    return NextResponse.json(
      { error: "hub_id, scheduled_at, and sample_request_ids are required" },
      { status: 400 }
    );
  }

  const scheduled = new Date(scheduled_at);
  if (Number.isNaN(scheduled.getTime())) {
    return NextResponse.json({ error: "Invalid scheduled_at value" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "hub_owner") {
    return NextResponse.json(
      { error: "Only hub owners can create cupping events" },
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
      { error: "You can only host cuppings for hubs you own" },
      { status: 403 }
    );
  }

  const uniqueSampleIds = [...new Set(sample_request_ids)];
  const { data: validSamples } = await supabase
    .from("sample_requests")
    .select("id")
    .eq("hub_id", hub_id)
    .eq("buyer_id", user.id)
    .in("id", uniqueSampleIds);

  if ((validSamples || []).length !== uniqueSampleIds.length) {
    return NextResponse.json(
      { error: "All selected coffees must be your sample requests for this hub" },
      { status: 400 }
    );
  }

  const { data: event, error: eventError } = await supabase
    .from("cupping_events")
    .insert({
      hub_id,
      host_id: user.id,
      scheduled_at: scheduled.toISOString(),
      notes: notes?.trim() || null,
    })
    .select("id, hub_id, scheduled_at, notes")
    .single();

  if (eventError || !event) {
    return NextResponse.json(
      { error: eventError?.message || "Failed to create cupping event" },
      { status: 500 }
    );
  }

  const linkRows = uniqueSampleIds.map((sampleRequestId) => ({
    cupping_event_id: event.id,
    sample_request_id: sampleRequestId,
  }));

  const { error: linkError } = await supabase
    .from("cupping_event_samples")
    .insert(linkRows);

  if (linkError) {
    await supabase.from("cupping_events").delete().eq("id", event.id);
    return NextResponse.json(
      { error: linkError.message || "Failed to add coffees to cupping event" },
      { status: 500 }
    );
  }

  return NextResponse.json(event, { status: 201 });
}
