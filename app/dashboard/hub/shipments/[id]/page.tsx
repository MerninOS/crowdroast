import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/mernin/Card";
import { Badge } from "@/components/mernin/Badge";
import { UnitWeightText } from "@/components/unit-value";
import { CommitmentPickupButton } from "@/components/commitment-pickup-button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function HubShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: shipment } = await supabase
    .from("shipments")
    .select("*, lot:lots!shipments_lot_id_fkey(id, title), hub:hubs!shipments_hub_id_fkey(id, name, owner_id, address, city, state, country)")
    .eq("id", id)
    .single();

  if (!shipment) redirect("/dashboard/hub/shipments");

  // Verify hub ownership
  const hub = shipment.hub as { id: string; owner_id: string; name: string; address: string | null; city: string | null; state: string | null; country: string | null } | null;
  if (!hub || hub.owner_id !== user.id) redirect("/dashboard/hub/shipments");

  const lot = shipment.lot as { id: string; title: string } | null;
  if (!lot) redirect("/dashboard/hub/shipments");

  // Fetch commitments for this lot (hub owner RLS policy grants access)
  const { data: commitments } = await supabase
    .from("commitments")
    .select("id, buyer_id, quantity_kg, status, picked_up_at")
    .eq("lot_id", shipment.lot_id)
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });

  const buyerIds = (commitments || []).map((c) => c.buyer_id);
  const { data: profiles } = buyerIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, contact_name, company_name, email")
        .in("id", buyerIds)
    : { data: [] };

  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  const hubAddress = [hub.address, hub.city, hub.state, hub.country]
    .filter(Boolean)
    .join(", ");

  const arrivedAt = shipment.delivered_at
    ? new Date(shipment.delivered_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const pickedUpCount = (commitments || []).filter((c) => c.picked_up_at).length;
  const totalCount = (commitments || []).length;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/hub/shipments"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Shipments
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Pickup Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {lot?.title || "Unknown Lot"} — {hub.name}
        </p>
      </div>

      {/* Shipment meta */}
      <Card className="shadow-sm mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {shipment.carrier && (
              <div>
                <p className="text-xs text-muted-foreground">Carrier</p>
                <p className="font-medium text-foreground">{shipment.carrier}</p>
              </div>
            )}
            {shipment.tracking_number && (
              <div>
                <p className="text-xs text-muted-foreground">Tracking</p>
                <p className="font-medium text-foreground">{shipment.tracking_number}</p>
              </div>
            )}
            {arrivedAt && (
              <div>
                <p className="text-xs text-muted-foreground">Arrived</p>
                <p className="font-medium text-foreground">{arrivedAt}</p>
              </div>
            )}
            {hubAddress && (
              <div>
                <p className="text-xs text-muted-foreground">Hub Address</p>
                <p className="font-medium text-foreground">{hubAddress}</p>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {pickedUpCount} of {totalCount} picked up
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Buyer pickup list */}
      <div className="space-y-2">
        {(commitments || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No confirmed commitments for this lot.</p>
        ) : (
          (commitments || []).map((c) => {
            const profile = profileMap[c.buyer_id];
            const name = profile?.contact_name || profile?.company_name || profile?.email || "Unknown buyer";
            const pickedUp = !!c.picked_up_at;

            return (
              <Card key={c.id} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <UnitWeightText kg={Number(c.quantity_kg)} />
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {pickedUp ? (
                        <Badge
                          variant="outline"
                          className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
                        >
                          Picked Up
                        </Badge>
                      ) : (
                        <>
                          <Badge
                            variant="outline"
                            className="text-xs bg-amber-50 text-amber-700 border-amber-200"
                          >
                            Awaiting Pickup
                          </Badge>
                          <CommitmentPickupButton
                            commitmentId={c.id}
                            alreadyPickedUp={false}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
