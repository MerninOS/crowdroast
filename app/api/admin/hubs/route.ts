import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin-route";

export async function GET() {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error;

  const [hubsRes, ownersRes] = await Promise.all([
    ctx.admin
      .from("hubs")
      .select(
        "id, owner_id, name, address, city, state, country, capacity_kg, used_capacity_kg, created_at, owner:profiles!hubs_owner_id_fkey(id, email, company_name, contact_name)"
      )
      .order("created_at", { ascending: false }),
    ctx.admin
      .from("profiles")
      .select("id, email, company_name, contact_name")
      .eq("role", "hub_owner")
      .order("created_at", { ascending: false }),
  ]);

  if (hubsRes.error) {
    return NextResponse.json({ error: hubsRes.error.message }, { status: 500 });
  }
  if (ownersRes.error) {
    return NextResponse.json({ error: ownersRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    hubs: hubsRes.data || [],
    hubOwners: ownersRes.data || [],
  });
}

export async function POST(request: Request) {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error;

  const body = await request.json();
  const ownerId = typeof body?.owner_id === "string" ? body.owner_id : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const address = typeof body?.address === "string" ? body.address.trim() : null;
  const city = typeof body?.city === "string" ? body.city.trim() : null;
  const state = typeof body?.state === "string" ? body.state.trim() : null;
  const country = typeof body?.country === "string" ? body.country.trim() : null;
  const capacityKg =
    typeof body?.capacity_kg === "number" && Number.isFinite(body.capacity_kg)
      ? Math.max(0, body.capacity_kg)
      : 0;

  if (!ownerId || !name) {
    return NextResponse.json(
      { error: "owner_id and name are required" },
      { status: 400 }
    );
  }

  const { data: owner, error: ownerError } = await ctx.admin
    .from("profiles")
    .select("id, role")
    .eq("id", ownerId)
    .single();

  if (ownerError || !owner) {
    return NextResponse.json({ error: "Hub owner not found" }, { status: 404 });
  }

  if (owner.role !== "hub_owner") {
    return NextResponse.json(
      { error: "Selected user is not a hub owner" },
      { status: 400 }
    );
  }

  const { data: existingHub } = await ctx.admin
    .from("hubs")
    .select("id")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (existingHub) {
    return NextResponse.json(
      { error: "This hub owner already has a hub assigned" },
      { status: 409 }
    );
  }

  const { data, error } = await ctx.admin
    .from("hubs")
    .insert({
      owner_id: ownerId,
      name,
      address: address || null,
      city: city || null,
      state: state || null,
      country: country || null,
      capacity_kg: capacityKg,
    })
    .select(
      "id, owner_id, name, address, city, state, country, capacity_kg, used_capacity_kg, created_at, owner:profiles!hubs_owner_id_fkey(id, email, company_name, contact_name)"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
