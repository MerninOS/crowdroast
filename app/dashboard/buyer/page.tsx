import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, FlaskConical, DollarSign, Coffee, Warehouse } from "lucide-react";
import Link from "next/link";

export default async function BuyerOverview() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get which hubs this buyer belongs to
  const { data: memberships } = await supabase
    .from("hub_members")
    .select("hub_id, hub:hubs!hub_members_hub_id_fkey(name)")
    .eq("user_id", user.id)
    .eq("status", "active");

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
  const hubCount = memberships?.length || 0;

  const stats = [
    {
      label: "My Hubs",
      value: hubCount,
      sub: hubCount === 0 ? "Ask a hub owner for an invite" : "active memberships",
      icon: Warehouse,
    },
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
        {hubCount > 0 && (
          <Button asChild>
            <Link href="/dashboard/buyer/browse">
              <Coffee className="mr-2 h-4 w-4" />
              Browse Lots
            </Link>
          </Button>
        )}
      </div>

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

      {hubCount === 0 && (
        <Card className="mt-6 border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Warehouse className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground">No Hub Membership Yet</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
              You need to be added to a hub by a hub owner before you can browse and commit to coffee lots.
              Contact a hub owner to get invited.
            </p>
          </CardContent>
        </Card>
      )}

      {hubCount > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-foreground mb-3">My Hubs</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(memberships || []).map((m: any) => (
              <Card key={m.hub_id}>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Warehouse className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{m.hub?.name || "Unknown Hub"}</p>
                    <p className="text-xs text-muted-foreground">Active member</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
