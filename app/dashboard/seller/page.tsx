import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/mernin/Card";
import { Package, ShoppingCart, DollarSign, Truck } from "lucide-react";
import { StripeConnectButton } from "@/components/stripe-connect-button";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("id", user.id)
    .single();

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
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Commitments",
      value: totalCommitments,
      sub: "received",
      icon: ShoppingCart,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      label: "Est. Revenue",
      value: `$${totalRevenue.toLocaleString()}`,
      sub: "from commitments",
      icon: DollarSign,
      color: "text-foreground",
      bg: "bg-secondary",
    },
    {
      label: "Shipments",
      value: "0",
      sub: "in transit",
      icon: Truck,
      color: "text-muted-foreground",
      bg: "bg-secondary",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Seller Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your lots and commitments.</p>
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-sm">
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </div>
              <div className="text-2xl font-semibold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-6 shadow-sm">
        <CardContent className="p-4 md:p-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Stripe Connect Payouts</p>
            <p className="text-xs text-muted-foreground mt-1">
              Required to receive your 90% share when a lot settles.
            </p>
          </div>
          <StripeConnectButton
            connected={Boolean(profile?.stripe_connect_account_id)}
            roleLabel="seller"
          />
        </CardContent>
      </Card>
    </div>
  );
}
