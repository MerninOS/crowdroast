import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Warehouse, Truck, Package, Users, Coffee, FlaskConical } from "lucide-react";
import { StripeConnectButton } from "@/components/stripe-connect-button";

export default async function HubOverview() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: hubs } = await supabase
    .from("hubs")
    .select("*")
    .eq("owner_id", user.id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("id", user.id)
    .single();

  const hubIds = (hubs || []).map((h) => h.id);
  const noHubFallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: hubLots } = await supabase
    .from("hub_lots")
    .select("id")
    .in("hub_id", hubIds.length > 0 ? hubIds : noHubFallback);

  const { data: hubMembers } = await supabase
    .from("hub_members")
    .select("id, status")
    .in("hub_id", hubIds.length > 0 ? hubIds : noHubFallback);

  const { data: shipments } = await supabase
    .from("shipments")
    .select("id, status")
    .in("hub_id", hubIds.length > 0 ? hubIds : noHubFallback);

  const { data: samples } = await supabase
    .from("sample_requests")
    .select("id, status")
    .in("hub_id", hubIds.length > 0 ? hubIds : noHubFallback);

  const activeMembers = hubMembers?.filter((m) => m.status === "active").length || 0;
  const inTransit = shipments?.filter((s) => s.status === "in_transit").length || 0;
  const pendingSamples = samples?.filter((s) => s.status === "pending").length || 0;

  const stats = [
    { label: "My Hubs", value: hubs?.length || 0, sub: `${hubIds.length} active`, icon: Warehouse, color: "text-primary", bg: "bg-primary/10" },
    { label: "Catalog Lots", value: hubLots?.length || 0, sub: "curated offerings", icon: Coffee, color: "text-accent", bg: "bg-accent/10" },
    { label: "Active Buyers", value: activeMembers, sub: `${hubMembers?.length || 0} total members`, icon: Users, color: "text-foreground", bg: "bg-secondary" },
    { label: "In Transit", value: inTransit, sub: "shipments incoming", icon: Truck, color: "text-muted-foreground", bg: "bg-secondary" },
    { label: "Pending Samples", value: pendingSamples, sub: `${samples?.length || 0} total`, icon: FlaskConical, color: "text-muted-foreground", bg: "bg-secondary" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Hub Owner Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your hubs, catalog, and members.</p>
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
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
              Connect Stripe to receive the 2% hub fee on settled sales.
            </p>
          </div>
          <StripeConnectButton
            connected={Boolean(profile?.stripe_connect_account_id)}
            roleLabel="hub"
          />
        </CardContent>
      </Card>
    </div>
  );
}
