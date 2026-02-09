import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { LotDetailView } from "@/components/lot-detail-view";
import type { Lot } from "@/lib/types";

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lot } = await supabase
    .from("lots")
    .select("*, seller:profiles!lots_seller_id_fkey(*), hub:hubs(*)")
    .eq("id", id)
    .single();

  if (!lot) notFound();

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Auth unreachable – continue as anonymous
  }

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1 px-4 py-8 lg:py-12">
        <div className="mx-auto max-w-5xl">
          <LotDetailView lot={lot as unknown as Lot} userId={user?.id || null} />
        </div>
      </main>
    </div>
  );
}
