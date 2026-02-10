import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck } from "lucide-react";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  in_transit: "bg-blue-50 text-blue-700 border-blue-200",
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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Shipments</h1>
        <p className="text-sm text-muted-foreground mt-1">Track shipments for your lots.</p>
      </div>

      {items.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <Truck className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">No shipments yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((s: any) => {
            const statusLabel = s.status.replace("_", " ").charAt(0).toUpperCase() + s.status.replace("_", " ").slice(1);
            return (
              <Card key={s.id} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{lotMap[s.lot_id] || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.carrier || "No carrier"} {s.tracking_number ? `- ${s.tracking_number}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-xs ${statusStyles[s.status] || ""}`}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    {s.weight_kg && (
                      <div>
                        <p className="text-xs text-muted-foreground">Weight</p>
                        <p className="font-medium text-foreground">{s.weight_kg} kg</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="font-medium text-foreground">
                        {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
