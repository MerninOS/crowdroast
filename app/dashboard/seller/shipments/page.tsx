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

export default async function SellerShipmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: lots } = await supabase
    .from("lots")
    .select("id, title")
    .eq("seller_id", user.id);

  const lotIds = (lots || []).map((l) => l.id);
  const lotMap = Object.fromEntries((lots || []).map((l) => [l.id, l.title]));

  const { data: shipments } = await supabase
    .from("shipments")
    .select("*")
    .in("lot_id", lotIds.length > 0 ? lotIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  const items = shipments || [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Shipments</h1>
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No shipments yet.
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
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {lotMap[s.lot_id] || "Unknown"}
                    </TableCell>
                    <TableCell>{s.carrier || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.tracking_number || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.weight_kg ? `${s.weight_kg} kg` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {s.status.replace("_", " ").charAt(0).toUpperCase() +
                          s.status.replace("_", " ").slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()}
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
