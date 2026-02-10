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
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Active Commitments",
      value: activeCommitments,
      sub: `${totalCommitments} total`,
      icon: ShoppingCart,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      label: "Total Invested",
      value: `$${totalSpent.toLocaleString()}`,
      sub: "across commitments",
      icon: DollarSign,
      color: "text-foreground",
      bg: "bg-secondary",
    },
    {
      label: "Samples",
      value: totalSamples,
      sub: "requested",
      icon: FlaskConical,
      color: "text-muted-foreground",
      bg: "bg-secondary",
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Buyer Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Your hub memberships and activity overview.</p>
        </div>
        {hubCount > 0 && (
          <Button asChild className="w-full sm:w-auto shadow-sm">
            <Link href="/dashboard/buyer/browse">
              <Coffee className="mr-2 h-4 w-4" />
              Browse Lots
            </Link>
          </Button>
        )}
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

      {hubCount === 0 && (
        <Card className="mt-6 border-dashed shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <Warehouse className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No Hub Membership Yet</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
              You need to be added to a hub by a hub owner before you can browse and commit to coffee lots.
            </p>
          </CardContent>
        </Card>
      )}

      {hubCount > 0 && (
        <div className="mt-8">
          <h2 className="text-base font-semibold text-foreground mb-3">My Hubs</h2>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {(memberships || []).map((m: any) => (
              <Card key={m.hub_id} className="shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Warehouse className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{m.hub?.name || "Unknown Hub"}</p>
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
