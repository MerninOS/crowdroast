import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { LotDetailView } from "@/components/lot-detail-view";
import type { Lot, PricingTier, Commitment } from "@/lib/types";

export default async function HubLotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hub?: string }>;
}) {
  const { id } = await params;
  const { hub: hubIdParam } = await searchParams;
  const supabase = await createClient();

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect("/auth/login");
  }
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, address, city, state, country")
    .eq("id", user.id)
    .single();

  const { data: ownedHubs } = await supabase
    .from("hubs")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const fallbackHubId = ownedHubs?.[0]?.id || null;
  const hubId =
    hubIdParam && ownedHubs?.some((hub) => hub.id === hubIdParam)
      ? hubIdParam
      : fallbackHubId;

  const { data: lot } = await supabase
    .from("lots")
    .select(
      "*, seller:profiles!lots_seller_id_fkey(id, company_name, contact_name)"
    )
    .eq("id", id)
    .single();

  if (!lot) notFound();

  const { data: tiers } = await supabase
    .from("pricing_tiers")
    .select("*")
    .eq("lot_id", id)
    .order("min_quantity_kg", { ascending: true });

  const { data: commitments } = await supabase
    .from("commitments")
    .select(
      "*, buyer:profiles!commitments_buyer_id_fkey(company_name, contact_name)"
    )
    .eq("lot_id", id)
    .not("stripe_payment_intent_id", "is", null)
    .order("created_at", { ascending: true });

  const existingSampleRequest = hubId
    ? (
        await supabase
          .from("sample_requests")
          .select("id")
          .eq("lot_id", id)
          .eq("buyer_id", user.id)
          .eq("hub_id", hubId)
          .in("status", ["pending", "approved", "shipped", "delivered"])
          .limit(1)
          .maybeSingle()
      ).data
    : null;

  return (
    <LotDetailView
      lot={lot as unknown as Lot}
      userId={user.id}
      viewerRole={profile?.role || "hub_owner"}
      hubId={hubId}
      hasRequestedSample={Boolean(existingSampleRequest)}
      defaultDeliveryDetails={{
        address: profile?.address || null,
        city: profile?.city || null,
        state: profile?.state || null,
        country: profile?.country || null,
      }}
      pricingTiers={(tiers as PricingTier[]) || []}
      commitments={(commitments as unknown as Commitment[]) || []}
      backHref="/dashboard/hub/catalog"
      backLabel="Back to Catalog"
    />
  );
}
