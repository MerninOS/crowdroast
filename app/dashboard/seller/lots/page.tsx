import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Plus, Pencil, Package } from "lucide-react";
import Link from "next/link";
import type { Lot } from "@/lib/types";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";
import { SellerLotCsvUploadModal } from "@/components/seller-lot-csv-upload-modal";
import { SellerLotStatusToggle } from "@/components/seller-lot-status-toggle";

const statusStyles: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  fully_committed: "bg-blue-50 text-blue-700 border-blue-200",
  draft: "bg-secondary text-secondary-foreground",
};

export default async function SellerLotsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: lots } = await supabase
    .from("lots")
    .select("*")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const myLots = (lots as Lot[]) || [];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Lots</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your coffee lot listings.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <SellerLotCsvUploadModal />
          <Button asChild className="w-full sm:w-auto shadow-sm">
            <Link href="/dashboard/seller/lots/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Lot
            </Link>
          </Button>
        </div>
      </div>

      {myLots.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <Package className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">
              You haven&apos;t created any lots yet.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <SellerLotCsvUploadModal />
              <Button asChild size="sm">
                <Link href="/dashboard/seller/lots/new">Create Your First Lot</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {myLots.map((lot) => {
            const pct =
              lot.total_quantity_kg > 0
                ? Math.round((lot.committed_quantity_kg / lot.total_quantity_kg) * 100)
                : 0;
            const statusLabel = lot.status === "fully_committed"
              ? "Fully Committed"
              : lot.status.charAt(0).toUpperCase() + lot.status.slice(1);

            return (
              <Card key={lot.id} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/seller/lots/${lot.id}/edit`}
                        className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                      >
                        {lot.title}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lot.origin_country}
                        {lot.region ? `, ${lot.region}` : ""} &middot;{" "}
                        <UnitPriceText
                          pricePerKg={lot.price_per_kg}
                          currency={lot.currency || "USD"}
                        />
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`text-xs ${statusStyles[lot.status] || ""}`}>
                        {statusLabel}
                      </Badge>
                      {(lot.status === "active" || lot.status === "draft") && (
                        <SellerLotStatusToggle
                          lotId={lot.id}
                          currentStatus={lot.status}
                          hasContributors={Number(lot.committed_quantity_kg || 0) > 0}
                        />
                      )}
                      <Button asChild size="sm" variant="outline" className="hidden sm:flex bg-transparent">
                        <Link href={`/dashboard/seller/lots/${lot.id}/edit`}>
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">
                        <UnitWeightText kg={lot.committed_quantity_kg} /> /{" "}
                        <UnitWeightText kg={lot.total_quantity_kg} />
                      </span>
                      <span className="font-medium text-foreground">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
