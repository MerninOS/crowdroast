import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { LotDetailView } from "@/components/lot-detail-view";
import type { Lot } from "@/lib/types";

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

    // Verify lot is in the hub catalog
    const { data: hubLot } = await supabase
      .from("hub_lots")
      .select("id")
      .eq("hub_id", hubId)
      .eq("lot_id", id)
      .single();

    if (!hubLot) {
      redirect("/dashboard/buyer/browse");
    }
  }

  const { data: lot } = await supabase
    .from("lots")
    .select("*, seller:profiles!lots_seller_id_fkey(company_name, contact_name, country)")
    .eq("id", id)
    .single();

  if (!lot) notFound();

  return (
    <div className="max-w-5xl">
      <LotDetailView
        lot={lot as unknown as Lot}
        userId={user.id}
        hubId={hubId || null}
      />
    </div>
  );
}
