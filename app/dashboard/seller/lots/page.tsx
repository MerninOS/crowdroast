import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Plus } from "lucide-react";
import Link from "next/link";
import type { Lot } from "@/lib/types";

export default async function SellerLotsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: lots } = await supabase
    .from("lots")
    .select("*")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false });

  const myLots = (lots as Lot[]) || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">My Lots</h1>
        <Button asChild>
          <Link href="/dashboard/seller/lots/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Lot
          </Link>
        </Button>
      </div>

      {myLots.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <p className="text-muted-foreground">
              You haven&apos;t created any lots yet.
            </p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/seller/lots/new">Create Your First Lot</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {myLots.map((lot) => {
            const pct =
              lot.total_quantity_kg > 0
                ? Math.round(
                    (lot.committed_quantity_kg / lot.total_quantity_kg) * 100
                  )
                : 0;
            return (
              <Card key={lot.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/marketplace/${lot.id}`}
                      className="hover:underline"
                    >
                      <CardTitle className="text-base">{lot.title}</CardTitle>
                    </Link>
                    <p className="text-sm text-muted-foreground mt-1">
                      {lot.origin_country}
                      {lot.region ? `, ${lot.region}` : ""} &middot; $
                      {lot.price_per_kg.toFixed(2)}/kg
                    </p>
                  </div>
                  <Badge
                    variant={lot.status === "active" ? "default" : "secondary"}
                    className={
                      lot.status === "active"
                        ? "bg-accent text-accent-foreground"
                        : ""
                    }
                  >
                    {lot.status === "fully_committed"
                      ? "Fully Committed"
                      : lot.status.charAt(0).toUpperCase() + lot.status.slice(1)}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">
                      {lot.committed_quantity_kg.toLocaleString()} /{" "}
                      {lot.total_quantity_kg.toLocaleString()} kg
                    </span>
                    <span className="font-medium">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
