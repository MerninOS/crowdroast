import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { Card, CardContent } from "@/components/mernin/Card";
import { Badge } from "@/components/mernin/Badge";
import { UnitWeightText, UnitPriceText } from "@/components/unit-value";

function getCurrentLotPrice(
  lot: { committed_quantity_kg: number; price_per_kg: number },
  tiers: { min_quantity_kg: number; price_per_kg: number }[]
): number {
  const basePrice = Number(lot.price_per_kg || 0);
  if (tiers.length === 0) return basePrice;
  const committedQty = Number(lot.committed_quantity_kg || 0);
  const sortedDesc = [...tiers].sort(
    (a, b) => Number(b.min_quantity_kg) - Number(a.min_quantity_kg)
  );
  for (const tier of sortedDesc) {
    if (committedQty >= Number(tier.min_quantity_kg)) return Number(tier.price_per_kg);
  }
  return basePrice;
}

const statusBadge: Record<
  "Open / At Risk" | "Open / Guaranteed" | "Successful",
  { variant: "hot" | "fresh" | "outline"; className?: string }
> = {
  "Open / At Risk": { variant: "hot" },
  "Open / Guaranteed": { variant: "outline", className: "bg-sky/20 text-sky border-sky" },
  Successful: { variant: "fresh" },
};

const statusDescription: Record<"Open / At Risk" | "Open / Guaranteed" | "Successful", string> = {
  "Open / At Risk":
    "This campaign is active but hasn't reached its minimum commitment. Your payout depends on enough buyers committing before the deadline.",
  "Open / Guaranteed":
    "The minimum commitment has been reached — this lot will sell. The final price may still change as more buyers commit.",
  Successful: "This campaign closed successfully. Your payout is based on the final price below.",
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amount);
}

export default async function SellerLotCommitmentsPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: lot } = await supabase
    .from("lots")
    .select("id, title, committed_quantity_kg, min_commitment_kg, currency, price_per_kg, seller_id")
    .eq("id", lotId)
    .eq("seller_id", user.id)
    .single();

  if (!lot) notFound();

  const [{ data: campaign }, { data: pricingTiers }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, status, deadline, hub:hubs(id, name)")
      .eq("lot_id", lotId)
      .in("status", ["active", "settled"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pricing_tiers")
      .select("lot_id, min_quantity_kg, price_per_kg")
      .eq("lot_id", lotId)
      .order("min_quantity_kg", { ascending: true }),
  ]);

  const tiers = pricingTiers || [];
  const currentPricePerKg = getCurrentLotPrice(lot, tiers);

  let commitments: {
    id: string;
    quantity_kg: number;
    created_at: string;
    buyer: { company_name: string | null; contact_name: string | null } | null;
  }[] = [];

  if (campaign) {
    const { data } = await supabase
      .from("commitments")
      .select(
        "id, quantity_kg, created_at, buyer:profiles!commitments_buyer_id_fkey(company_name, contact_name)"
      )
      .eq("campaign_id", campaign.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    commitments = (data || []) as unknown as typeof commitments;
  }

  const hub = (campaign?.hub as unknown) as { id: string; name: string } | null;

  let statusLabel: "Open / At Risk" | "Open / Guaranteed" | "Successful" | null = null;
  if (campaign) {
    if (campaign.status === "settled") {
      statusLabel = "Successful";
    } else if (Number(lot.committed_quantity_kg) >= Number(lot.min_commitment_kg)) {
      statusLabel = "Open / Guaranteed";
    } else {
      statusLabel = "Open / At Risk";
    }
  }

  const totalCommittedKg = commitments.reduce(
    (sum, c) => sum + Number(c.quantity_kg || 0),
    0
  );
  const projectedRevenue = totalCommittedKg * currentPricePerKg;

  const badge = statusLabel ? statusBadge[statusLabel] : null;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/seller/commitments"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Commitments
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{lot.title}</h1>
            {hub && <p className="mt-1 text-sm text-muted-foreground">{hub.name}</p>}
          </div>
          {badge && statusLabel && (
            <Badge variant={badge.variant} className={badge.className}>
              {statusLabel}
            </Badge>
          )}
        </div>
        {statusLabel && (
          <p className="mt-2 text-sm text-muted-foreground">{statusDescription[statusLabel]}</p>
        )}
        {campaign?.status === "active" && campaign.deadline && (
          <p className="mt-1 text-xs text-muted-foreground">
            Deadline:{" "}
            {new Date(campaign.deadline).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
      </div>

      {/* Revenue summary */}
      {commitments.length > 0 && (
        <Card className="mb-6 shadow-sm">
          <CardContent className="p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Revenue Summary
            </p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Total Committed</p>
                <p className="font-semibold text-foreground">
                  <UnitWeightText kg={totalCommittedKg} />
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Price</p>
                <p className="font-semibold text-foreground">
                  <UnitPriceText pricePerKg={currentPricePerKg} currency={lot.currency || "USD"} />
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {statusLabel === "Successful" ? "Total Revenue" : "Projected Revenue"}
                </p>
                <p className="font-semibold text-foreground">
                  {formatMoney(projectedRevenue, lot.currency || "USD")}
                </p>
              </div>
            </div>
            {tiers.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Buyer pricing includes the 10% platform fee. Your payout is based on the seller
                price shown above.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Commitment list */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Commitments ({commitments.length})
        </h2>
      </div>

      {commitments.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center px-4 py-10">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">No commitments on this lot yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {commitments.map((c) => {
            const buyerName =
              c.buyer?.company_name || c.buyer?.contact_name || "Unknown Buyer";
            const sellerAmount = Number(c.quantity_kg || 0) * currentPricePerKg;
            return (
              <Card key={c.id} className="shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{buyerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Weight</p>
                      <p className="font-medium text-foreground">
                        <UnitWeightText kg={Number(c.quantity_kg)} />
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Your Amount</p>
                      <p className="font-semibold text-foreground">
                        {formatMoney(sellerAmount, lot.currency || "USD")}
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
