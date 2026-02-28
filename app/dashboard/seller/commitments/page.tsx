import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import type { Commitment } from "@/lib/types";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default async function SellerCommitmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: lots } = await supabase
    .from("lots")
    .select("id, title")
    .eq("seller_id", user.id);

  const lotIds = (lots || []).map((l) => l.id);
  const lotMap = Object.fromEntries((lots || []).map((l) => [l.id, l.title]));

  const { data: commitments } = await supabase
    .from("commitments")
    .select("*, buyer:profiles!commitments_buyer_id_fkey(company_name, contact_name)")
    .in("lot_id", lotIds.length > 0 ? lotIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  const items = (commitments || []) as (Commitment & {
    buyer: { company_name: string | null; contact_name: string | null } | null;
  })[];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Incoming Commitments</h1>
        <p className="text-sm text-muted-foreground mt-1">Commitments received from buyers across your lots.</p>
      </div>

      {items.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">No commitments received yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const sellerTotal = Number(c.quantity_kg || 0) * Number(c.price_per_kg || 0);
            return (
            <Card key={c.id} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {lotMap[c.lot_id] || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.buyer?.company_name || c.buyer?.contact_name || "Buyer"}
                    </p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 text-xs ${statusStyles[c.status] || ""}`}>
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className="font-medium text-foreground">
                      <UnitWeightText kg={c.quantity_kg} />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Your Price</p>
                    <p className="font-medium text-foreground">
                      <UnitPriceText pricePerKg={c.price_per_kg} />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Your Total</p>
                    <p className="font-semibold text-foreground">${sellerTotal.toLocaleString()}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Buyer pricing includes the 10% platform fee. Your payout is based on the seller price above.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
