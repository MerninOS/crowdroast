import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SellerCommitmentsClient, type LotCampaignCard } from "@/components/seller-commitments-client";

function getCurrentLotPrice(
  lot: { committed_quantity_kg: number; price_per_kg: number },
  tiers: { min_quantity_kg: number; price_per_kg: number }[]
): number {
  const basePrice = Number(lot.price_per_kg || 0);
  if (tiers.length === 0) return basePrice;
  const committedQty = Number(lot.committed_quantity_kg || 0);
  const sortedDesc = [...tiers].sort(
    (a, b) => Number(b.min_quantity_kg) - Number(a.min_quantity_kg)
  );
  for (const tier of sortedDesc) {
    if (committedQty >= Number(tier.min_quantity_kg)) return Number(tier.price_per_kg);
  }
  return basePrice;
}

export default async function SellerCommitmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: lots } = await supabase
    .from("lots")
    .select("id, title, committed_quantity_kg, min_commitment_kg, currency, price_per_kg")
    .eq("seller_id", user.id);

  const lotIds = (lots || []).map((l) => l.id);

  const lotMap = Object.fromEntries((lots || []).map((l) => [l.id, l]));

  let cards: LotCampaignCard[] = [];

  if (lotIds.length > 0) {
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, lot_id, status, created_at, hub:hubs(id, name)")
      .in("lot_id", lotIds)
      .in("status", ["active", "settled"])
      .order("created_at", { ascending: false });

    const campaignIds = (campaigns || []).map((c) => c.id);

    const [{ data: commitments }, { data: pricingTiers }] = await Promise.all([
      campaignIds.length > 0
        ? supabase
            .from("commitments")
            .select("id, campaign_id, lot_id, quantity_kg")
            .in("campaign_id", campaignIds)
            .neq("status", "cancelled")
        : Promise.resolve({ data: [] }),
      supabase
        .from("pricing_tiers")
        .select("lot_id, min_quantity_kg, price_per_kg")
        .in("lot_id", lotIds)
        .order("min_quantity_kg", { ascending: true }),
    ]);

    const commitmentsByCampaignId: Record<string, { quantity_kg: number }[]> = {};
    for (const c of commitments || []) {
      if (!c.campaign_id) continue;
      if (!commitmentsByCampaignId[c.campaign_id]) commitmentsByCampaignId[c.campaign_id] = [];
      commitmentsByCampaignId[c.campaign_id].push(c);
    }

    const tiersByLotId: Record<string, { min_quantity_kg: number; price_per_kg: number }[]> = {};
    for (const t of pricingTiers || []) {
      if (!tiersByLotId[t.lot_id]) tiersByLotId[t.lot_id] = [];
      tiersByLotId[t.lot_id].push(t);
    }

    // One card per campaign (one active/settled campaign per lot at a time)
    for (const campaign of campaigns || []) {
      const lot = lotMap[campaign.lot_id];
      if (!lot) continue;

      const lotCommitments = commitmentsByCampaignId[campaign.id] || [];
      if (lotCommitments.length === 0) continue;

      const totalCommittedKg = lotCommitments.reduce(
        (sum, c) => sum + Number(c.quantity_kg || 0),
        0
      );

      const tiers = tiersByLotId[lot.id] || [];
      const currentPricePerKg = getCurrentLotPrice(lot, tiers);

      const hub = (campaign.hub as unknown) as { id: string; name: string } | null;

      let statusLabel: LotCampaignCard["statusLabel"];
      if (campaign.status === "settled") {
        statusLabel = "Successful";
      } else if (Number(lot.committed_quantity_kg) >= Number(lot.min_commitment_kg)) {
        statusLabel = "Open / Guaranteed";
      } else {
        statusLabel = "Open / At Risk";
      }

      cards.push({
        lotId: lot.id,
        lotTitle: lot.title,
        hubName: hub?.name ?? null,
        statusLabel,
        totalCommittedKg,
        currentPricePerKg,
        currency: lot.currency || "USD",
      });
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Commitments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Buyer commitments grouped by lot and campaign.
        </p>
      </div>
      <SellerCommitmentsClient cards={cards} />
    </div>
  );
}
