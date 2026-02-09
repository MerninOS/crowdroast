import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShipmentStatusButtons } from "@/components/shipment-status-buttons";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_transit: "bg-blue-100 text-blue-800",
  at_hub: "bg-accent/20 text-accent-foreground",
  out_for_delivery: "bg-orange-100 text-orange-800",
  delivered: "bg-accent text-accent-foreground",
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
      <h1 className="text-2xl font-bold text-foreground mb-6">
        Hub Shipments
      </h1>
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No shipments assigned to your hubs yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.lot?.title || "Unknown"}
                    </TableCell>
                    <TableCell>{s.carrier || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.tracking_number || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.weight_kg ? `${s.weight_kg} kg` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={statusColors[s.status] || ""}
                        variant="secondary"
                      >
                        {s.status
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ShipmentStatusButtons
                        shipmentId={s.id}
                        currentStatus={s.status}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
