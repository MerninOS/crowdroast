import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button } from "@merninos/ui";
import type { Commitment, ShipmentStatus } from "@/lib/types";
import { getCheckoutSession, getPaymentIntent, getSetupIntent } from "@/lib/stripe";
import { addPlatformFee } from "@/lib/pricing";
import {
  bucketByLifecycle,
  derivePortfolioStats,
  type CommitmentGroup,
} from "@/components/buyer-commitments/bucket-by-lifecycle";
import type { BagChargeRow } from "@/components/buyer-commitments/commitment-drawer/bag-breakdown";
import { PortfolioStrip } from "@/components/buyer-commitments/portfolio-strip";
import { NeedsAttentionCard } from "@/components/buyer-commitments/needs-attention-card";
import { BuyerCommitmentsBoard } from "@/components/buyer-commitments/buyer-commitments-board";

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
      if (session.mode === "payment") {
        let latestCharge: string | null = null;
        if (session.payment_intent) {
          try {
            const paymentIntent = await getPaymentIntent(session.payment_intent);
            latestCharge = paymentIntent.latest_charge || null;
          } catch {
            latestCharge = null;
          }
        }

        if (session.payment_status === "paid") {
          await supabase
            .from("commitments")
            .update({
              payment_status: "charge_succeeded",
              stripe_customer_id: session.customer || null,
              stripe_payment_intent_id: session.payment_intent || null,
              stripe_charge_id: latestCharge,
              charged_at: new Date().toISOString(),
              payment_error: null,
            })
            .eq("id", commitment.id)
            .eq("buyer_id", buyerId);
        }
      } else {
        // Mode=setup. For Checkout Sessions in setup mode, Stripe documents
        // that `session.payment_method` is NULL — the real PM is attached
        // to the resulting SetupIntent. Without the fetch-fallback below
        // we'd write null to `stripe_payment_method_id` and strand the
        // commit at settlement with `missing_payment_method`. Same pattern
        // the webhook handler at app/api/stripe/webhook/route.ts:99-110
        // uses; mirrored here so this fallback sync path matches.
        const setupIntentId = session.setup_intent || null;
        let paymentMethodId: string | null = session.payment_method || null;
        if (!paymentMethodId && setupIntentId) {
          try {
            const setupIntent = await getSetupIntent(setupIntentId);
            paymentMethodId = setupIntent.payment_method || null;
          } catch {
            paymentMethodId = null;
          }
        }

        if (setupIntentId || paymentMethodId) {
          // Defensive payload shape: only include fields we have non-null
          // values for. The OLD code wrote `stripe_payment_method_id: null`
          // and `stripe_customer_id: null` unconditionally, which would
          // overwrite a real PM written by a concurrent webhook delivery.
          // PR #86 fixed this same clobber pattern in the webhook handler;
          // applying it here closes the parallel write path.
          const updatePayload: Record<string, unknown> = {
            payment_status: "setup_complete",
            stripe_setup_intent_id: setupIntentId,
          };
          if (paymentMethodId) {
            updatePayload.stripe_payment_method_id = paymentMethodId;
          }
          if (session.customer) {
            updatePayload.stripe_customer_id = session.customer;
          }
          await supabase
            .from("commitments")
            .update(updatePayload)
            .eq("id", commitment.id)
            .eq("buyer_id", buyerId);
        }
      }
    } catch {
      // Best-effort sync fallback when webhook hasn't updated yet.
    }
  }
}

export default async function BuyerCommitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_setup?: string; payment?: string }>;
}) {
  const { payment_setup: paymentSetup, payment } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  if (paymentSetup === "success" || payment === "success") {
    await syncPendingSetupCommitments(supabase, user.id);
  }

  // Show ANY commit the buyer has made — both legacy payment_intent commits
  // and bag-aware setup_intent commits. The prior filter
  // `.not("stripe_payment_intent_id", "is", null)` invisibly hid every
  // bag-aware commit because those use setup_intent (no PI).
  // The `pending_setup` status filter excludes commits that haven't yet
  // returned from Stripe Checkout (they're transient).
  const { data: commitments } = await supabase
    .from("commitments")
    .select(
      "*, picked_up_at, lot:lots!commitments_lot_id_fkey(id, title, origin_country, region, farm, variety, process, score, images, crop_year, total_quantity_kg, settlement_status, settlement_processed_at, commitment_deadline, currency, committed_quantity_kg, price_per_kg, bag_size_kg, min_bags_to_succeed)"
    )
    .eq("buyer_id", user.id)
    .neq("payment_status", "pending_setup")
    .or(
      "stripe_payment_intent_id.not.is.null,stripe_setup_intent_id.not.is.null"
    )
    .order("created_at", { ascending: false });

  const items = (commitments || []) as Commitment[];

  const lotIds = Array.from(new Set(items.map((c) => c.lot_id).filter(Boolean)));
  const campaignIds = Array.from(
    new Set(items.map((c) => c.campaign_id).filter((id): id is string => !!id))
  );

  // Fetch the campaigns referenced by these commitments — needed for per-campaign
  // deadline (live countdown) and per-campaign status (failed/cancelled → closed).
  let campaignById: Record<string, { id: string; status: string; deadline: string; settled_at: string | null }> = {};
  if (campaignIds.length > 0) {
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, status, deadline, settled_at")
      .in("id", campaignIds);
    for (const c of (campaigns || []) as any[]) {
      campaignById[c.id] = {
        id: c.id,
        status: c.status,
        deadline: c.deadline,
        settled_at: c.settled_at,
      };
    }
  }

  // Fetch shipment status for each lot to drive lifecycle bucketing
  let shipmentByLotId: Record<
    string,
    {
      status: ShipmentStatus;
      carrier: string | null;
      tracking_number: string | null;
      shipped_at: string | null;
      delivered_at: string | null;
      hub: { name: string } | null;
    }
  > = {};
  if (lotIds.length > 0) {
    const { data: shipments } = await supabase
      .from("shipments")
      .select(
        "lot_id, status, carrier, tracking_number, shipped_at, delivered_at, hub:hubs!shipments_hub_id_fkey(name)"
      )
      .in("lot_id", lotIds)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });

    for (const s of (shipments || []) as any[]) {
      if (!shipmentByLotId[s.lot_id]) {
        shipmentByLotId[s.lot_id] = {
          status: s.status as ShipmentStatus,
          carrier: s.carrier,
          tracking_number: s.tracking_number,
          shipped_at: s.shipped_at,
          delivered_at: s.delivered_at,
          hub: s.hub ?? null,
        };
      }
    }
  }

  let tiersByLotId: Record<
    string,
    { min_bags: number | null; min_quantity_kg: number | null; price_per_kg: number }[]
  > = {};
  if (lotIds.length > 0) {
    const { data: pricingTiers } = await supabase
      .from("pricing_tiers")
      .select("lot_id, min_bags, min_quantity_kg, price_per_kg")
      .in("lot_id", lotIds);

    for (const tier of pricingTiers || []) {
      if (!tiersByLotId[tier.lot_id]) tiersByLotId[tier.lot_id] = [];
      tiersByLotId[tier.lot_id].push({
        min_bags: tier.min_bags ?? null,
        min_quantity_kg: tier.min_quantity_kg === null ? null : Number(tier.min_quantity_kg),
        price_per_kg: Number(tier.price_per_kg),
      });
    }
  }

  // commit_applied ledger rows tell the closed drawer how much inviter
  // credit was redeemed against each commitment. RLS restricts the read to
  // the caller's own user_id, so this is safe on the user-bound supabase
  // client. amount_cents is stored negative; we surface positive cents to
  // the UI to match the rest of the breakdown.
  const creditAppliedByCommitmentId: Record<string, number> = {};
  const { data: creditApplied } = await supabase
    .from("credit_ledger")
    .select("amount_cents, source_commitment_id")
    .eq("reason", "commit_applied")
    .not("source_commitment_id", "is", null);
  for (const row of (creditApplied || []) as Array<{
    amount_cents: number;
    source_commitment_id: string;
  }>) {
    creditAppliedByCommitmentId[row.source_commitment_id] =
      (creditAppliedByCommitmentId[row.source_commitment_id] || 0) +
      Math.abs(Number(row.amount_cents || 0));
  }

  // Per-bag charge rows for the buyer's commitments. Created at settlement
  // (migration #38) by lib/settle-attribution.ts — one row per (commitment,
  // completed_bag). Used by the closed-value drawer body to show the buyer
  // their bag-by-bag charge state (AC10 / Task 4.12).
  //
  // RLS scoping: migration #38's `bag_charges_select_buyer` policy already
  // restricts SELECT to rows whose commitment_id maps to the caller's
  // own commitments. Filtering by commitment_id IN (...) on the user-bound
  // client is therefore safe and just narrows what RLS would already allow.
  const commitmentIds = items.map((c) => c.id);
  const bagChargesByCommitmentId: Record<string, BagChargeRow[]> = {};
  if (commitmentIds.length > 0) {
    const { data: bagCharges } = await supabase
      .from("commitment_bag_charges")
      .select(
        "id, commitment_id, bag_number, kg, amount_cents, payment_status, updated_at"
      )
      .in("commitment_id", commitmentIds)
      .order("bag_number", { ascending: true });
    for (const row of (bagCharges || []) as BagChargeRow[]) {
      if (!bagChargesByCommitmentId[row.commitment_id]) {
        bagChargesByCommitmentId[row.commitment_id] = [];
      }
      bagChargesByCommitmentId[row.commitment_id].push(row);
    }
  }

  // Group by campaign instance, not by lot — a lot can have multiple campaigns
  // (e.g. one failed, one succeeded). Legacy commitments without a campaign_id
  // fall back to a lot-scoped key so they still render.
  const grouped = new Map<string, CommitmentGroup>();
  for (const c of items) {
    const groupKey = c.campaign_id ?? `lot:${c.lot_id}`;
    const existing = grouped.get(groupKey);
    if (existing) {
      existing.commitments.push(c);
    } else {
      grouped.set(groupKey, {
        groupKey,
        lotId: c.lot_id,
        campaignId: c.campaign_id,
        hubId: c.hub_id ?? null,
        lot: c.lot ?? null,
        campaign: c.campaign_id ? (campaignById[c.campaign_id] as any) ?? null : null,
        commitments: [c],
        shipment: shipmentByLotId[c.lot_id] ?? null,
        creditAppliedByCommitmentId,
        bagChargesByCommitmentId,
      });
    }
  }

  // A "live" group has at least one non-cancelled commitment. We use this to
  // drop redundant Min-Not-Met cards when a later campaign on the same lot
  // succeeded — but keep them when the failed campaign is the only thing the
  // buyer has on that lot (so they still see the refund in their history).
  const lotsWithLiveGroup = new Set<string>();
  for (const g of grouped.values()) {
    if (g.commitments.some((c) => c.status !== "cancelled")) {
      lotsWithLiveGroup.add(g.lotId);
    }
  }

  const groups = Array.from(grouped.values()).filter((g) => {
    const allCancelled = g.commitments.every((c) => c.status === "cancelled");
    return !(allCancelled && lotsWithLiveGroup.has(g.lotId));
  });
  const buckets = bucketByLifecycle(groups);
  const stats = derivePortfolioStats(groups, addPlatformFee);

  if (groups.length === 0) {
    return (
      <div>
        <PageHeader />
        <div className="rounded-[14px] border-[3px] border-espresso bg-chalk px-5 py-12 text-center shadow-flat-md">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-espresso bg-cream text-espresso">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <p className="font-body text-sm text-espresso/70">
            Nothing on the books yet.{" "}
            <Link href="/dashboard/buyer" className="font-bold text-tomato underline underline-offset-4">
              Browse open lots
            </Link>{" "}
            to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-12">
      <PageHeader />
      <PortfolioStrip stats={stats} />

      {buckets.needsAttention.length > 0 && (
        <section className="mb-9">
          <SectionHead
            title="Needs Attention"
            count={buckets.needsAttention.length}
            accent="tomato"
          />
          <div className="mt-4 flex flex-col gap-3">
            {buckets.needsAttention.map((g) => (
              <NeedsAttentionCard key={g.groupKey} group={g} />
            ))}
          </div>
        </section>
      )}

      <BuyerCommitmentsBoard
        buckets={buckets}
        tiersByLotId={tiersByLotId}
        landingKg={stats.landingKg}
        ytdSpend={stats.ytdSpend}
      />
    </div>
  );
}

function PageHeader() {
  return (
    <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div>
        <div className="font-headline text-[11px] font-extrabold uppercase tracking-[0.22em] text-espresso/55">
          Your portfolio
        </div>
        {/* "Commitments" is intentionally the only Adore Cats moment on this page. */}
        <h1 className="mt-1.5 font-display text-[34px] leading-[0.95] tracking-tight text-espresso sm:text-[44px]">
          Commitments
        </h1>
      </div>
      <Button asChild variant="default" size="sm">
        <Link href="/dashboard/buyer">Browse open lots →</Link>
      </Button>
    </div>
  );
}

const sectionAccent: Record<"tomato" | "sky" | "fog", string> = {
  tomato: "bg-tomato",
  sky:    "bg-sky",
  fog:    "bg-fog",
};

function SectionHead({
  title,
  count,
  accent,
  note,
}: {
  title: string;
  count: number;
  accent: "tomato" | "sky" | "fog";
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b-2 border-espresso/80 pb-2">
      <span
        className={`mb-px inline-block h-2.5 w-2.5 self-center rounded-full border-2 border-espresso ${sectionAccent[accent]}`}
        aria-hidden
      />
      <h2 className="m-0 font-headline text-[18px] font-bold leading-none text-espresso">{title}</h2>
      <span className="font-headline text-[14px] font-bold leading-none text-espresso/45">{count}</span>
      {note && (
        <span className="ml-auto font-headline text-[11px] font-bold lowercase text-espresso/55">{note}</span>
      )}
    </div>
  );
}
