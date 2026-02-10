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
  const { commitment_id, type, description, hub_id } = body;

  if (!commitment_id || !type || !description) {
    return NextResponse.json(
      { error: "commitment_id, type, and description are required" },
      { status: 400 }
    );
  }

  // Verify the user owns this commitment
  const { data: commitment } = await supabase
    .from("commitments")
    .select("id")
    .eq("id", commitment_id)
    .eq("buyer_id", user.id)
    .single();

  if (!commitment) {
    return NextResponse.json(
      { error: "Commitment not found or not yours" },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("claims")
    .insert({
      commitment_id,
      filed_by: user.id,
      hub_id: hub_id || null,
      type,
      description,
      status: "open",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
