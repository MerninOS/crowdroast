import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingCart, DollarSign, Truck } from "lucide-react";

export default async function SellerOverview() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: lots } = await supabase
    .from("lots")
    .select("id, status, total_quantity_kg, committed_quantity_kg, price_per_kg")
    .eq("seller_id", user.id);

  const { data: commitments } = await supabase
    .from("commitments")
    .select("id, total_price, status, lot_id")
    .in("lot_id", (lots || []).map((l) => l.id));

  const totalLots = lots?.length || 0;
  const activeLots = lots?.filter((l) => l.status === "active").length || 0;
  const totalCommitments = commitments?.length || 0;
  const totalRevenue =
    commitments
      ?.filter((c) => c.status !== "cancelled")
      .reduce((sum, c) => sum + (c.total_price || 0), 0) || 0;

  const stats = [
    {
      label: "Total Lots",
      value: totalLots,
      sub: `${activeLots} active`,
      icon: Package,
    },
    {
      label: "Commitments",
      value: totalCommitments,
      sub: "received",
      icon: ShoppingCart,
    },
    {
      label: "Est. Revenue",
      value: `$${totalRevenue.toLocaleString()}`,
      sub: "from commitments",
      icon: DollarSign,
    },
    {
      label: "Shipments",
      value: "0",
      sub: "in transit",
      icon: Truck,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">
        Seller Dashboard
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
