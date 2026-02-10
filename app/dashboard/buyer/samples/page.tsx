import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { FlaskConical } from "lucide-react";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Samples</h1>
        <p className="text-sm text-muted-foreground mt-1">Track your sample requests.</p>
      </div>

      {items.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <FlaskConical className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No sample requests yet. Browse lots and request samples from ones you&apos;re interested in.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((s: any) => (
            <Card key={s.id} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/buyer/lot/${s.lot_id}`}
                      className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      {s.lot?.title || "Unknown"}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.lot?.origin_country}
                    </p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 text-xs ${statusStyles[s.status] || ""}`}>
                    {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className="font-medium text-foreground">{s.quantity_grams}g</p>
                  </div>
                  {s.tracking_number && (
                    <div>
                      <p className="text-xs text-muted-foreground">Tracking</p>
                      <p className="font-mono text-xs text-foreground">{s.tracking_number}</p>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
