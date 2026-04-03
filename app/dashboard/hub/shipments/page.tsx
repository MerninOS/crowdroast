import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/mernin/Card";
import { Badge } from "@/components/mernin/Badge";
import { Truck } from "lucide-react";
import { ShipmentStatusButtons } from "@/components/shipment-status-buttons";
import { UnitWeightText } from "@/components/unit-value";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  in_transit: "bg-blue-50 text-blue-700 border-blue-200",
  at_hub: "bg-emerald-50 text-emerald-700 border-emerald-200",
  out_for_delivery: "bg-orange-50 text-orange-700 border-orange-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default async function HubShipmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: hubs } = await supabase
    .from("hubs")
    .select("id")
    .eq("owner_id", user.id);

  const hubIds = (hubs || []).map((h) => h.id);

  const { data: shipments } = await supabase
    .from("shipments")
    .select("*, lot:lots!shipments_lot_id_fkey(title)")
    .in("hub_id", hubIds.length > 0 ? hubIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  const items = shipments || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Hub Shipments</h1>
        <p className="text-sm text-muted-foreground mt-1">Track and update shipment statuses for your hubs.</p>
      </div>

      {items.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <Truck className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">No shipments assigned to your hubs yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((s: any) => {
            const statusLabel = s.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
            return (
              <Card key={s.id} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{s.lot?.title || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.carrier || "No carrier"} {s.tracking_number ? `- ${s.tracking_number}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-xs ${statusStyles[s.status] || ""}`}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm">
                      {s.weight_kg && (
                        <div>
                          <p className="text-xs text-muted-foreground">Weight</p>
                          <p className="font-medium text-foreground">
                            <UnitWeightText kg={s.weight_kg} />
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="font-medium text-foreground">
                          {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </div>
                    <ShipmentStatusButtons shipmentId={s.id} currentStatus={s.status} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
