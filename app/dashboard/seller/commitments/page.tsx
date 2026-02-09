import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Commitment } from "@/lib/types";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-accent/20 text-accent-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  shipped: "bg-blue-100 text-blue-800",
  delivered: "bg-accent text-accent-foreground",
};

export default async function SellerCommitmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Get lots owned by this seller, then their commitments
  const { data: lots } = await supabase
    .from("lots")
    .select("id, title")
    .eq("seller_id", user.id);

  const lotIds = (lots || []).map((l) => l.id);
  const lotMap = Object.fromEntries((lots || []).map((l) => [l.id, l.title]));

  const { data: commitments } = await supabase
    .from("commitments")
    .select("*, buyer:profiles!commitments_buyer_id_fkey(company_name, contact_name)")
    .in("lot_id", lotIds.length > 0 ? lotIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  const items = (commitments || []) as (Commitment & {
    buyer: { company_name: string | null; contact_name: string | null } | null;
  })[];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">
        Incoming Commitments
      </h1>
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No commitments received yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead className="text-right">Qty (kg)</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {lotMap[c.lot_id] || "Unknown"}
                    </TableCell>
                    <TableCell>
                      {c.buyer?.company_name || c.buyer?.contact_name || "Buyer"}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.quantity_kg.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${c.total_price.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={statusColors[c.status] || ""}
                        variant="secondary"
                      >
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
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
