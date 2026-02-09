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
import Link from "next/link";

export default async function BuyerSamplesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: samples } = await supabase
    .from("sample_requests")
    .select("*, lot:lots!sample_requests_lot_id_fkey(title, origin_country)")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  const items = samples || [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">My Samples</h1>
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No sample requests yet. Browse the{" "}
            <Link href="/marketplace" className="text-primary underline">
              marketplace
            </Link>{" "}
            and request samples from lots you&apos;re interested in.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/marketplace/${s.lot_id}`}
                        className="font-medium hover:underline"
                      >
                        {s.lot?.title || "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.quantity_grams}g
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.tracking_number || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
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
