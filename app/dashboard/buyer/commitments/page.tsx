import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import type { Commitment, CommitmentPaymentStatus, CommitmentStatus } from "@/lib/types";
import { getCheckoutSession, getSetupIntent } from "@/lib/stripe";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";

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

function getCurrentLotPrice(lot: any, tiers: any[]) {
  const basePrice = Number(lot?.price_per_kg || 0);
  if (tiers.length === 0) return basePrice;

  const committedQty = Number(lot?.committed_quantity_kg || 0);
  const sortedDesc = [...tiers].sort(
    (a: any, b: any) => Number(b.min_quantity_kg) - Number(a.min_quantity_kg)
  );

  for (const tier of sortedDesc) {
    if (committedQty >= Number(tier.min_quantity_kg)) {
      return Number(tier.price_per_kg);
    }
  }

  return basePrice;
}

function summarizePaymentStatus(statuses: CommitmentPaymentStatus[]) {
  if (statuses.length === 0) return "pending_setup" as CommitmentPaymentStatus;
  const unique = Array.from(new Set(statuses));
  if (unique.length === 1) return unique[0];
  if (unique.includes("charge_failed")) return "charge_failed";
  if (unique.includes("charge_succeeded")) return "charge_succeeded";
  if (unique.includes("setup_complete")) return "setup_complete";
  return "pending_setup";
}

async function syncPendingSetupCommitments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buyerId: string
) {
  const { data: pending } = await supabase
    .from("commitments")
    .select("id, stripe_checkout_session_id, payment_status")
    .eq("buyer_id", buyerId)
    .eq("payment_status", "pending_setup")
    .not("stripe_checkout_session_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  for (const commitment of pending || []) {
    const sessionId = commitment.stripe_checkout_session_id;
    if (!sessionId) continue;

    try {
      const session = await getCheckoutSession(sessionId);
      const setupIntentId = session.setup_intent || null;
      let paymentMethodId = session.payment_method || null;
      let customerId = session.customer || null;

      if (!paymentMethodId && setupIntentId) {
        const setupIntent = await getSetupIntent(setupIntentId);
        paymentMethodId = setupIntent.payment_method || null;
        customerId = customerId || setupIntent.customer || null;
      }

      if (setupIntentId || paymentMethodId) {
        await supabase
          .from("commitments")
          .update({
            payment_status: "setup_complete",
            stripe_setup_intent_id: setupIntentId,
            stripe_payment_method_id: paymentMethodId,
            stripe_customer_id: customerId,
          })
          .eq("id", commitment.id)
          .eq("buyer_id", buyerId);
      }
    } catch {
      // Best-effort sync fallback when webhook hasn't updated yet.
    }
  }
}

export default async function BuyerCommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_setup?: string }>;
}) {
  const { payment_setup: paymentSetup } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  if (paymentSetup === "success") {
    await syncPendingSetupCommitments(supabase, user.id);
  }

  const { data: commitments } = await supabase
    .from("commitments")
    .select(
      "*, lot:lots!commitments_lot_id_fkey(id, title, origin_country, settlement_status, commitment_deadline, currency, committed_quantity_kg, price_per_kg)"
    )
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false });

  const items = (commitments || []) as Commitment[];

  const lotIds = Array.from(new Set(items.map((c) => c.lot_id).filter(Boolean)));
  let tiersByLotId: Record<string, any[]> = {};

  if (lotIds.length > 0) {
    const { data: pricingTiers } = await supabase
      .from("pricing_tiers")
      .select("lot_id, min_quantity_kg, price_per_kg")
      .in("lot_id", lotIds)
      .order("min_quantity_kg", { ascending: true });

    for (const tier of pricingTiers || []) {
      if (!tiersByLotId[tier.lot_id]) tiersByLotId[tier.lot_id] = [];
      tiersByLotId[tier.lot_id].push(tier);
    }
  }

  const groupedByLot = new Map<
    string,
    {
      lotId: string;
      lot: any;
      commitments: Commitment[];
    }
  >();

  for (const c of items) {
    const existing = groupedByLot.get(c.lot_id);
    if (existing) {
      existing.commitments.push(c);
    } else {
      groupedByLot.set(c.lot_id, {
        lotId: c.lot_id,
        lot: c.lot,
        commitments: [c],
      });
    }
  }

  const groups = Array.from(groupedByLot.values())
    .map((group) => {
      const activeCommitments = group.commitments.filter((c) => c.status !== "cancelled");
      const totalCommittedKg = activeCommitments.reduce(
        (sum, c) => sum + Number(c.quantity_kg || 0),
        0
      );

      const paymentStatuses = group.commitments.map(
        (c) => (c.payment_status || "pending_setup") as CommitmentPaymentStatus
      );
      const summaryPaymentStatus = summarizePaymentStatus(paymentStatuses);

      const displayCurrency =
        group.commitments.find((c) => c.charge_currency)?.charge_currency ||
        group.lot?.currency ||
        "usd";

      const tiers = tiersByLotId[group.lotId] || [];
      const currentPricePerKg = getCurrentLotPrice(group.lot, tiers);
      const totalAtCurrentPrice = totalCommittedKg * currentPricePerKg;

      const succeeded = group.commitments.filter((c) => c.payment_status === "charge_succeeded");
      const paidAmount = succeeded.reduce((sum, c) => {
        const commitmentTotal =
          c.charge_amount_cents !== null ? c.charge_amount_cents / 100 : Number(c.total_price || 0);
        return sum + commitmentTotal;
      }, 0);
      const securedKg = succeeded.reduce((sum, c) => sum + Number(c.quantity_kg || 0), 0);
      const finalPricePerKg = securedKg > 0 ? paidAmount / securedKg : currentPricePerKg;

      return {
        ...group,
        activeCommitments,
        totalCommittedKg,
        displayCurrency,
        summaryPaymentStatus,
        currentPricePerKg,
        totalAtCurrentPrice,
        paidAmount,
        securedKg,
        finalPricePerKg,
      };
    })
    .sort((a, b) => {
      const aDate = Math.max(...a.commitments.map((c) => new Date(c.created_at).getTime()));
      const bDate = Math.max(...b.commitments.map((c) => new Date(c.created_at).getTime()));
      return bDate - aDate;
    });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Commitments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consolidated by lot with a breakdown of each commitment.
        </p>
      </div>

      {groups.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center px-4 py-10">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              No commitments yet. <Link href="/dashboard/buyer" className="text-primary underline underline-offset-4">Browse lots</Link> to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            return (
              <Card key={group.lotId} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/buyer/lot/${group.lotId}`}
                        className="text-sm font-semibold text-foreground transition-colors hover:text-primary"
                      >
                        {group.lot?.title || "Unknown Lot"}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">{group.lot?.origin_country}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline" className={`text-xs ${paymentStatusStyles[group.summaryPaymentStatus] || ""}`}>
                        {paymentStatusLabels[group.summaryPaymentStatus]}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {group.activeCommitments.length} commitment{group.activeCommitments.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Committed</p>
                      <p className="font-semibold text-foreground">
                        <UnitWeightText kg={group.totalCommittedKg} />
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Current Price</p>
                      <p className="font-semibold text-foreground">
                        <UnitPriceText
                          pricePerKg={group.currentPricePerKg}
                          currency={group.displayCurrency}
                        />
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total at Current Price</p>
                      <p className="font-semibold text-foreground">
                        {formatMoney(group.totalAtCurrentPrice, group.displayCurrency)}
                      </p>
                    </div>
                  </div>

                  {group.lot?.settlement_status !== "pending" && (
                    <div className="mt-3 rounded-md border bg-muted/40 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Campaign Result
                      </p>
                      {group.securedKg > 0 ? (
                        <div className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                          <div>
                            <p className="text-xs text-muted-foreground">You Paid</p>
                            <p className="font-semibold text-foreground">
                              {formatMoney(group.paidAmount, group.displayCurrency)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Coffee Secured</p>
                            <p className="font-semibold text-foreground">
                              <UnitWeightText kg={group.securedKg} />
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Final Price</p>
                            <p className="font-semibold text-foreground">
                              <UnitPriceText
                                pricePerKg={group.finalPricePerKg}
                                currency={group.displayCurrency}
                              />
                            </p>
                          </div>
                        </div>
                      ) : group.lot?.settlement_status === "minimum_not_met" ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          This campaign did not reach its minimum commitment. Your card was not charged.
                        </p>
                      ) : group.commitments.some((c) => c.payment_status === "charge_failed") ? (
                        <p className="mt-2 text-sm text-red-700">
                          One or more charges failed for this lot. We will continue retrying.
                        </p>
                      ) : group.lot?.settlement_status === "failed" ? (
                        <p className="mt-2 text-sm text-red-700">
                          Settlement failed for this campaign. We will retry automatically.
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Settlement is processing for this campaign.
                        </p>
                      )}
                    </div>
                  )}

                  <Accordion type="single" collapsible className="mt-3 w-full">
                    <AccordionItem value={`lot-${group.lotId}`} className="border-b-0">
                      <AccordionTrigger className="py-2 text-sm font-medium text-foreground hover:no-underline">
                        View commitment breakdown
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2">
                          {group.commitments.map((c) => {
                            const paymentStatus = (c.payment_status || "pending_setup") as CommitmentPaymentStatus;
                            return (
                              <div key={c.id} className="rounded-md border bg-background p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(c.created_at).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })}
                                  </p>
                                  <div className="flex items-center gap-1">
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${statusStyles[c.status as CommitmentStatus] || ""}`}
                                    >
                                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${paymentStatusStyles[paymentStatus] || ""}`}
                                    >
                                      {paymentStatusLabels[paymentStatus]}
                                    </Badge>
                                  </div>
                                </div>

                                <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Quantity</p>
                                    <p className="font-medium text-foreground">
                                      <UnitWeightText kg={Number(c.quantity_kg)} />
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Price</p>
                                    <p className="font-medium text-foreground">
                                      <UnitPriceText
                                        pricePerKg={Number(c.price_per_kg || 0)}
                                        currency={c.charge_currency || group.displayCurrency}
                                      />
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Total</p>
                                    <p className="font-semibold text-foreground">
                                      {formatMoney(Number(c.total_price || 0), c.charge_currency || group.displayCurrency)}
                                    </p>
                                  </div>
                                </div>

                                {c.payment_status === "charge_failed" && c.payment_error && (
                                  <p className="mt-2 text-xs text-red-700">Charge issue: {c.payment_error}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
