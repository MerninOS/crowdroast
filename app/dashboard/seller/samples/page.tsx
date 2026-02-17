import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical } from "lucide-react";
import { SampleActionButtons } from "@/components/sample-action-buttons";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

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
    .select("*, requester:profiles!sample_requests_buyer_id_fkey(company_name, contact_name)")
    .in("lot_id", lotIds.length > 0 ? lotIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });

  const items = samples || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sample Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage incoming sample requests from hub owners.</p>
      </div>

      {items.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <FlaskConical className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">No sample requests yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((s: any) => (
            <Card key={s.id} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {lotMap[s.lot_id] || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.requester?.company_name || s.requester?.contact_name || "Hub Owner"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-xs ${statusStyles[s.status] || ""}`}>
                      {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Quantity</p>
                      <p className="font-medium text-foreground">{s.quantity_grams}g</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Requested</p>
                      <p className="font-medium text-foreground">
                        {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                  {s.status !== "rejected" && s.status !== "delivered" && (
                    <SampleActionButtons sampleId={s.id} currentStatus={s.status} />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
