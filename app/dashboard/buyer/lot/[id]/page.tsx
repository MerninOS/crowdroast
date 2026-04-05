import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { LotDetailView } from "@/components/lot-detail-view";
import type { Lot, PricingTier, Commitment } from "@/lib/types";

export default async function BuyerLotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ hub?: string }>;
}) {
  const { id } = await params;
  const { hub: hubId } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Verify buyer is a member of the hub
  if (hubId) {
    const { data: membership } = await supabase
      .from("hub_members")
      .select("id")
      .eq("hub_id", hubId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      redirect("/dashboard/buyer");
    }

    // Verify lot has an active campaign for this hub
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("hub_id", hubId)
      .eq("lot_id", id)
      .eq("status", "active")
      .single();

    if (!campaign) {
      redirect("/dashboard/buyer/browse");
    }
  }

  // Fetch lot with seller info
  const { data: lot } = await supabase
    .from("lots")
    .select(
      "*, seller:profiles!lots_seller_id_fkey(company_name, contact_name, country)"
    )
    .eq("id", id)
    .single();

  if (!lot) notFound();

  // Fetch pricing tiers
  const { data: pricingTiers } = await supabase
    .from("pricing_tiers")
    .select("*")
    .eq("lot_id", id)
    .order("min_quantity_kg", { ascending: true });

  // Fetch commitments for the active campaign only (for the backers list)
  const { data: activeCampaign } = await supabase
    .from("campaigns")
    .select("id, deadline")
    .eq("lot_id", id)
    .eq("status", "active")
    .single();

  const { data: commitments } = activeCampaign
    ? await supabase
        .from("commitments")
        .select(
          "*, buyer:profiles!commitments_buyer_id_fkey(company_name, contact_name)"
        )
        .eq("campaign_id", activeCampaign.id)
        .neq("status", "cancelled")
        .not("stripe_payment_intent_id", "is", null)
        .order("created_at", { ascending: true })
    : { data: [] };

  return (
    <div className="max-w-5xl">
      <LotDetailView
        lot={lot as unknown as Lot}
        userId={user.id}
        viewerRole={profile?.role || "buyer"}
        hubId={hubId || null}
        campaignDeadline={(activeCampaign as any)?.deadline || null}
        pricingTiers={(pricingTiers as unknown as PricingTier[]) || []}
        commitments={(commitments as unknown as Commitment[]) || []}
      />
    </div>
  );
}
