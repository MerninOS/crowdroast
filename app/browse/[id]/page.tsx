import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { LotDetailView } from "@/components/lot-detail-view";
import type { Lot, PricingTier, Commitment } from "@/lib/types";

export default async function PublicLotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lot } = await supabase
    .from("lots")
    .select(
      "*, seller:profiles!lots_seller_id_fkey(company_name, contact_name, country)"
    )
    .eq("id", id)
    // .eq("status", "active")
    .single();

  if (!lot) notFound();

  const { data: pricingTiers } = await supabase
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

  return (
    <div className="flex min-h-svh flex-col bg-cream">
      <SiteHeader />
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <LotDetailView
          lot={lot as unknown as Lot}
          userId={null}
          viewerRole="buyer"
          hubId={null}
          pricingTiers={(pricingTiers as unknown as PricingTier[]) || []}
          commitments={(commitments as unknown as Commitment[]) || []}
          backHref="/browse"
          backLabel="Browse lots"
        />
      </div>
    </div>
  );
}
