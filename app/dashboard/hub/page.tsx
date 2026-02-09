import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Warehouse, Truck, Package, BarChart3 } from "lucide-react";

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
  const totalCapacity = (hubs || []).reduce((s, h) => s + (h.capacity_kg || 0), 0);
  const usedCapacity = (hubs || []).reduce((s, h) => s + (h.used_capacity_kg || 0), 0);

  const { data: shipments } = await supabase
    .from("shipments")
    .select("id, status")
    .in("hub_id", hubIds.length > 0 ? hubIds : ["00000000-0000-0000-0000-000000000000"]);

  const inTransit = shipments?.filter((s) => s.status === "in_transit").length || 0;
  const atHub = shipments?.filter((s) => s.status === "at_hub").length || 0;

  const stats = [
    {
      label: "My Hubs",
      value: hubs?.length || 0,
      sub: `${hubIds.length} active`,
      icon: Warehouse,
    },
    {
      label: "Capacity",
      value: `${usedCapacity.toLocaleString()} / ${totalCapacity.toLocaleString()} kg`,
      sub: totalCapacity > 0 ? `${Math.round((usedCapacity / totalCapacity) * 100)}% used` : "No capacity set",
      icon: BarChart3,
    },
    {
      label: "In Transit",
      value: inTransit,
      sub: "shipments incoming",
      icon: Truck,
    },
    {
      label: "At Hub",
      value: atHub,
      sub: "ready for pickup",
      icon: Package,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">
        Hub Owner Dashboard
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
