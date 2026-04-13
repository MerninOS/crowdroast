"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/mernin/Card";
import { Badge } from "@/components/mernin/Badge";
import { Truck } from "lucide-react";
import { UnitWeightText } from "@/components/unit-value";
import { SellerShipmentForm } from "@/components/seller-shipment-form";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  in_transit: "bg-blue-50 text-blue-700 border-blue-200",
  at_hub: "bg-emerald-50 text-emerald-700 border-emerald-200",
  out_for_delivery: "bg-orange-50 text-orange-700 border-orange-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

export default async function SellerShipmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: lots } = await supabase
    .from("lots")
    .select("id, title, hub_id")
    .eq("seller_id", user.id);

  const lotIds = (lots || []).map((l) => l.id);
  const lotMap = Object.fromEntries((lots || []).map((l) => [l.id, l]));

  // Fetch hub addresses for pending shipments
  const hubIds = Array.from(
    new Set((lots || []).map((l) => l.hub_id).filter(Boolean))
  ) as string[];

  const { data: hubs } = hubIds.length > 0
    ? await supabase
        .from("hubs")
        .select("id, name, address, city, state, country")
        .in("id", hubIds)
    : { data: [] };

  const hubMap = Object.fromEntries((hubs || []).map((h) => [h.id, h]));

  const { data: shipments } = await supabase
    .from("shipments")
    .select("*")
    .in("lot_id", lotIds.length > 0 ? lotIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  const items = shipments || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Shipments</h1>
        <p className="text-sm text-muted-foreground mt-1">Track and fulfill shipments for your lots.</p>
      </div>

      {items.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <Truck className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">No shipments yet. They&apos;ll appear here when a lot closes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((s: any) => {
            const lot = lotMap[s.lot_id];
            const hub = lot?.hub_id ? hubMap[lot.hub_id] : null;
            const hubAddress = hub
              ? [hub.address, hub.city, hub.state, hub.country].filter(Boolean).join(", ")
              : null;
            const statusLabel = s.status
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c: string) => c.toUpperCase());

            return (
              <Card key={s.id} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {lot?.title || "Unknown Lot"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.carrier || "No carrier"}{s.tracking_number ? ` — ${s.tracking_number}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-xs ${statusStyles[s.status] || ""}`}
                    >
                      {statusLabel}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-sm">
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
                        {new Date(s.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    {hubAddress && (
                      <div>
                        <p className="text-xs text-muted-foreground">Ship to</p>
                        <p className="font-medium text-foreground">{hubAddress}</p>
                      </div>
                    )}
                  </div>

                  {s.status === "pending" && (
                    <div className="mt-4 border-t pt-4">
                      <SellerShipmentForm shipmentId={s.id} hubAddress={hubAddress} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
