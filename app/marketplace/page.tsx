import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { LotCard } from "@/components/lot-card";
import { Coffee } from "lucide-react";
import type { Lot } from "@/lib/types";

export default async function MarketplacePage() {
  const supabase = await createClient();

  const { data: lots } = await supabase
    .from("lots")
    .select("*")
    .in("status", ["active", "fully_committed"])
    .order("created_at", { ascending: false });

  const activeLots = (lots as Lot[]) || [];

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1 px-4 py-8 lg:py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Marketplace</h1>
            <p className="mt-2 text-muted-foreground">
              Browse available green coffee lots from producers worldwide.
            </p>
          </div>

          {activeLots.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activeLots.map((lot) => (
                <LotCard key={lot.id} lot={lot} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 py-20">
              <Coffee className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium text-foreground">
                No lots available yet
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Sellers will start listing lots soon. Check back later!
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
