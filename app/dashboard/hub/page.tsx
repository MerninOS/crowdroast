import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Warehouse, Truck, Package, Users, Coffee, FlaskConical } from "lucide-react";

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
    {
      label: "My Hubs",
      value: hubs?.length || 0,
      sub: `${hubIds.length} active`,
      icon: Warehouse,
    },
    {
      label: "Catalog Lots",
      value: hubLots?.length || 0,
      sub: "curated offerings",
      icon: Coffee,
    },
    {
      label: "Active Buyers",
      value: activeMembers,
      sub: `${hubMembers?.length || 0} total members`,
      icon: Users,
    },
    {
      label: "In Transit",
      value: inTransit,
      sub: "shipments incoming",
      icon: Truck,
    },
    {
      label: "Pending Samples",
      value: pendingSamples,
      sub: `${samples?.length || 0} total`,
      icon: FlaskConical,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">
        Hub Owner Dashboard
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
