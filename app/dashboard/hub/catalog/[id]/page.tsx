import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { LotDetailView } from "@/components/lot-detail-view";
import type { Lot, PricingTier, Commitment } from "@/lib/types";

export default async function HubLotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect("/auth/login");
  }
  if (!user) redirect("/auth/login");

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
    .order("created_at", { ascending: true });

  return (
    <LotDetailView
      lot={lot as unknown as Lot}
      userId={user.id}
      pricingTiers={(tiers as PricingTier[]) || []}
      commitments={(commitments as unknown as Commitment[]) || []}
      backHref="/dashboard/hub/catalog"
      backLabel="Back to Catalog"
    />
  );
}
