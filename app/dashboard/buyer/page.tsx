import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, FlaskConical, DollarSign, Coffee } from "lucide-react";
import Link from "next/link";

export default async function BuyerOverview() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: commitments } = await supabase
    .from("commitments")
    .select("id, status, total_price")
    .eq("buyer_id", user.id);

  const { data: samples } = await supabase
    .from("sample_requests")
    .select("id, status")
    .eq("buyer_id", user.id);

  const totalCommitments = commitments?.length || 0;
  const activeCommitments =
    commitments?.filter((c) => c.status !== "cancelled").length || 0;
  const totalSpent =
    commitments
      ?.filter((c) => c.status !== "cancelled")
      .reduce((sum, c) => sum + (c.total_price || 0), 0) || 0;
  const totalSamples = samples?.length || 0;

  const stats = [
    {
      label: "Active Commitments",
      value: activeCommitments,
      sub: `${totalCommitments} total`,
      icon: ShoppingCart,
    },
    {
      label: "Total Invested",
      value: `$${totalSpent.toLocaleString()}`,
      sub: "across commitments",
      icon: DollarSign,
    },
    {
      label: "Samples",
      value: totalSamples,
      sub: "requested",
      icon: FlaskConical,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Buyer Dashboard</h1>
        <Button asChild>
          <Link href="/marketplace">
            <Coffee className="mr-2 h-4 w-4" />
            Browse Lots
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
