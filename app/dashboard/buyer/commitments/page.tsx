import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Button } from "@merninos/ui";
import type { Commitment, ShipmentStatus } from "@/lib/types";
import { getCheckoutSession, getPaymentIntent } from "@/lib/stripe";
import { addPlatformFee } from "@/lib/pricing";
import {
  bucketByLifecycle,
  derivePortfolioStats,
  type CommitmentGroup,
} from "@/components/buyer-commitments/bucket-by-lifecycle";
import { PortfolioStrip } from "@/components/buyer-commitments/portfolio-strip";
import { NeedsAttentionCard } from "@/components/buyer-commitments/needs-attention-card";
import { RaisingLotCard } from "@/components/buyer-commitments/raising-lot-card";
import { InMotionLotCard } from "@/components/buyer-commitments/in-motion-lot-card";
import { ClosedLotsTable } from "@/components/buyer-commitments/closed-lots-table";

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
        const setupIntentId = session.setup_intent || null;
        if (setupIntentId || session.payment_method) {
          await supabase
            .from("commitments")
            .update({
              payment_status: "setup_complete",
              stripe_setup_intent_id: setupIntentId,
              stripe_payment_method_id: session.payment_method || null,
              stripe_customer_id: session.customer || null,
            })
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

  const { data: commitments } = await supabase
    .from("commitments")
    .select(
      "*, picked_up_at, lot:lots!commitments_lot_id_fkey(id, title, origin_country, region, farm, variety, process, score, images, crop_year, total_quantity_kg, settlement_status, settlement_processed_at, commitment_deadline, currency, committed_quantity_kg, price_per_kg)"
    )
    .eq("buyer_id", user.id)
    .not("stripe_payment_intent_id", "is", null)
    .neq("status", "cancelled")
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

  let tiersByLotId: Record<string, { min_quantity_kg: number; price_per_kg: number }[]> = {};
  if (lotIds.length > 0) {
    const { data: pricingTiers } = await supabase
      .from("pricing_tiers")
      .select("lot_id, min_quantity_kg, price_per_kg")
      .in("lot_id", lotIds)
      .order("min_quantity_kg", { ascending: true });

    for (const tier of pricingTiers || []) {
      if (!tiersByLotId[tier.lot_id]) tiersByLotId[tier.lot_id] = [];
      tiersByLotId[tier.lot_id].push({
        min_quantity_kg: Number(tier.min_quantity_kg),
        price_per_kg: Number(tier.price_per_kg),
      });
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
      });
    }
  }

  const groups = Array.from(grouped.values());
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

      {buckets.raising.length > 0 && (
        <section className="mb-9">
          <SectionHead
            title="Still Raising"
            count={buckets.raising.length}
            accent="tomato"
          />
          <div className="mt-4 flex flex-col gap-4">
            {buckets.raising.map((g) => (
              <RaisingLotCard
                key={g.groupKey}
                group={g}
                pricingTiers={tiersByLotId[g.lotId] || []}
              />
            ))}
          </div>
        </section>
      )}

      {buckets.inMotion.length > 0 && (
        <section className="mb-9">
          <SectionHead
            title="In Motion"
            count={buckets.inMotion.length}
            accent="sky"
            note={`${stats.landingKg.toLocaleString()} lb landing soon`}
          />
          <div className="mt-4 flex flex-col gap-3.5">
            {buckets.inMotion.map((g) => (
              <InMotionLotCard key={g.groupKey} group={g} />
            ))}
          </div>
        </section>
      )}

      {buckets.closed.length > 0 && (
        <section>
          <SectionHead
            title="Closed Lots"
            count={buckets.closed.length}
            accent="fog"
            note={`${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(stats.ytdSpend)} YTD`}
          />
          <div className="mt-4">
            <ClosedLotsTable groups={buckets.closed} />
          </div>
        </section>
      )}
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
