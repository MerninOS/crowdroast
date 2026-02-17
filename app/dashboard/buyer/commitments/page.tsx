import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import type { Commitment, CommitmentPaymentStatus, CommitmentStatus } from "@/lib/types";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  shipped: "bg-blue-50 text-blue-700 border-blue-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const paymentStatusStyles: Record<CommitmentPaymentStatus, string> = {
  pending_setup: "bg-amber-50 text-amber-700 border-amber-200",
  setup_complete: "bg-blue-50 text-blue-700 border-blue-200",
  charge_succeeded: "bg-emerald-50 text-emerald-700 border-emerald-200",
  charge_failed: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

const paymentStatusLabels: Record<CommitmentPaymentStatus, string> = {
  pending_setup: "Card Setup Needed",
  setup_complete: "Card Ready",
  charge_succeeded: "Charged",
  charge_failed: "Charge Failed",
  cancelled: "Cancelled",
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function BuyerCommitmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: commitments } = await supabase
    .from("commitments")
    .select(
      "*, lot:lots!commitments_lot_id_fkey(title, origin_country, settlement_status, commitment_deadline, currency)"
    )
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  const items = (commitments || []) as Commitment[];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Commitments</h1>
        <p className="text-sm text-muted-foreground mt-1">Track all your coffee lot commitments.</p>
      </div>

      {items.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-10 px-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground mb-4">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No commitments yet.{" "}
              <Link href="/dashboard/buyer/browse" className="text-primary underline underline-offset-4">
                Browse your hub&apos;s lots
              </Link>{" "}
              to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const paymentStatus = c.payment_status || "pending_setup";
            const displayCurrency = c.charge_currency || c.lot?.currency || "usd";
            const chargedTotal =
              c.charge_amount_cents !== null
                ? c.charge_amount_cents / 100
                : Number(c.total_price || 0);

            return (
            <Card key={c.id} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/buyer/lot/${c.lot_id}`}
                      className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                    >
                      {c.lot?.title || "Unknown Lot"}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.lot?.origin_country}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col gap-1 items-end">
                    <Badge variant="outline" className={`text-xs ${statusStyles[c.status as CommitmentStatus] || ""}`}>
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${paymentStatusStyles[paymentStatus] || ""}`}>
                      {paymentStatusLabels[paymentStatus]}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className="font-medium text-foreground">{c.quantity_kg.toLocaleString()} kg</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Price/kg</p>
                    <p className="font-medium text-foreground">${c.price_per_kg.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold text-foreground">${c.total_price.toLocaleString()}</p>
                  </div>
                </div>
                {c.lot?.settlement_status !== "pending" && (
                  <div className="mt-3 rounded-md border bg-muted/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaign Result</p>
                    {c.payment_status === "charge_succeeded" ? (
                      <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">You Paid</p>
                          <p className="font-semibold text-foreground">{formatMoney(chargedTotal, displayCurrency)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Coffee Secured</p>
                          <p className="font-semibold text-foreground">{c.quantity_kg.toLocaleString()} kg</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Final Price/kg</p>
                          <p className="font-semibold text-foreground">
                            {formatMoney(Number(c.price_per_kg || 0), displayCurrency)}
                          </p>
                        </div>
                      </div>
                    ) : c.lot?.settlement_status === "minimum_not_met" || c.payment_status === "cancelled" ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        This campaign did not reach its minimum commitment. Your card was not charged.
                      </p>
                    ) : c.payment_status === "charge_failed" ? (
                      <p className="mt-2 text-sm text-red-700">
                        We couldn&apos;t complete your charge{c.payment_error ? `: ${c.payment_error}` : "."}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Settlement is processing for this campaign.
                      </p>
                    )}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </CardContent>
            </Card>
          )})}
        </div>
      )}
    </div>
  );
}
