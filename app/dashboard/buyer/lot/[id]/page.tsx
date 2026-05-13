import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { CampaignPage } from "@/components/campaign/CampaignPage";
import type { Commitment, Lot, PricingTier } from "@/lib/types";
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

  // Bag-aware commits never set stripe_payment_intent_id (settlement issues
  // per-bag charges later), so the payment_intent filter above would hide
  // them from the "Your Commits" surface. Re-fetch the same campaign's
  // commits without that filter — but only past the "pending_setup" state,
  // so abandoned-checkout rows don't leak into the viewer's list. Limited
  // to the viewer's own buyer_id since the YourCommits block is
  // viewer-scoped and we don't need other buyers' rows here.
  const { data: viewerCommitments } = activeCampaign
    ? await supabase
        .from("commitments")
        .select("id, buyer_id, quantity_kg, created_at, status, payment_status")
        .eq("campaign_id", activeCampaign.id)
        .eq("buyer_id", user.id)
        .neq("status", "cancelled")
        .neq("payment_status", "pending_setup")
        .order("created_at", { ascending: true })
    : { data: [] };

  // Fetch hub name for hero / farmer card display copy. The invite CTAs
  // get their own hubName from POST /api/invite-codes via useInviteData,
  // but visual surfaces shouldn't be coupled to that auth-gated fetch.
  const { data: hub } = hubId
    ? await supabase.from("hubs").select("name").eq("id", hubId).single()
    : { data: null };

  return (
    <CampaignPage
      lot={lot as unknown as Lot}
      userId={user.id}
      viewerRole={profile?.role || "buyer"}
      hubId={hubId || null}
      hubName={hub?.name || null}
      pricingTiers={(pricingTiers as unknown as PricingTier[]) || []}
      commitments={(viewerCommitments as unknown as Commitment[]) || []}
      socialProof={socialProof}
    />
  );
}
