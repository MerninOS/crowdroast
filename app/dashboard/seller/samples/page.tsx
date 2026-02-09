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
import { SampleActionButtons } from "@/components/sample-action-buttons";

export default async function SellerSamplesPage() {
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

  const { data: samples } = await supabase
    .from("sample_requests")
    .select("*, buyer:profiles!sample_requests_buyer_id_fkey(company_name, contact_name)")
    .in("lot_id", lotIds.length > 0 ? lotIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  const items = samples || [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">
        Sample Requests
      </h1>
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No sample requests yet.
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
                  <TableHead className="text-right">Grams</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {lotMap[s.lot_id] || "Unknown"}
                    </TableCell>
                    <TableCell>
                      {s.buyer?.company_name || s.buyer?.contact_name || "Buyer"}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.quantity_grams}g
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {s.status === "pending" && (
                        <SampleActionButtons sampleId={s.id} />
                      )}
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
