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

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-accent/20 text-accent-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  shipped: "bg-blue-100 text-blue-800",
  delivered: "bg-accent text-accent-foreground",
};

export default async function BuyerCommitmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: commitments } = await supabase
    .from("commitments")
    .select("*, lot:lots!commitments_lot_id_fkey(title, origin_country)")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  const items = commitments || [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">
        My Commitments
      </h1>
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No commitments yet. Browse the{" "}
            <Link href="/marketplace" className="text-primary underline">
              marketplace
            </Link>{" "}
            to find lots.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead className="text-right">Qty (kg)</TableHead>
                  <TableHead className="text-right">Price/kg</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/marketplace/${c.lot_id}`}
                        className="font-medium hover:underline"
                      >
                        {c.lot?.title || "Unknown Lot"}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {c.lot?.origin_country}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                      {c.quantity_kg.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      ${c.price_per_kg.toFixed(2)}
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
