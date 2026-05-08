import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { CampaignPage } from "@/components/campaign/CampaignPage";
import type { Lot, PricingTier } from "@/lib/types";
import {
  getCampaignSocialProof,
  type SocialProofCommitment,
} from "@/lib/lots/social-proof";

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

  const socialProof = getCampaignSocialProof(
    (commitments ?? []) as unknown as SocialProofCommitment[]
  );

  // Fetch hub name for hero / farmer card display copy. The invite CTAs
  // get their own hubName from POST /api/invite-codes via useInviteData,
  // but visual surfaces shouldn't be coupled to that auth-gated fetch.
  const { data: hub } = hubId
    ? await supabase.from("hubs").select("name").eq("id", hubId).single()
    : { data: null };

  return (
    <div className="max-w-5xl">
      <CampaignPage
        lot={lot as unknown as Lot}
        userId={user.id}
        viewerRole={profile?.role || "buyer"}
        hubId={hubId || null}
        hubName={hub?.name || null}
        campaignDeadline={(activeCampaign as any)?.deadline || null}
        pricingTiers={(pricingTiers as unknown as PricingTier[]) || []}
        socialProof={socialProof}
      />
    </div>
  );
}
