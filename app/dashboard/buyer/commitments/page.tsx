import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default async function BuyerCommitmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: commitments } = await supabase
    .from("commitments")
    .select("*, lot:lots!commitments_lot_id_fkey(title, origin_country)")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  const items = commitments || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Commitments</h1>
        <p className="text-sm text-muted-foreground mt-1">Track all your coffee lot commitments.</p>
      </div>

      {items.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No commitments yet.{" "}
              <Link href="/dashboard/buyer/browse" className="text-primary underline underline-offset-4">
                Browse your hub&apos;s lots
              </Link>{" "}
              to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((c: any) => (
            <Card key={c.id} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/buyer/lot/${c.lot_id}`}
                      className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      {c.lot?.title || "Unknown Lot"}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.lot?.origin_country}
                    </p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 text-xs ${statusStyles[c.status] || ""}`}>
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className="font-medium text-foreground">{c.quantity_kg.toLocaleString()} kg</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Price/kg</p>
                    <p className="font-medium text-foreground">${c.price_per_kg.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold text-foreground">${c.total_price.toLocaleString()}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
