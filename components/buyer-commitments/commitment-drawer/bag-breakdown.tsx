import { UnitWeightText } from "@/components/unit-value";
import type { Commitment } from "@/lib/types";

/**
 * Per-bag charge row owned by the buyer for a settled commitment.
 *
 * Read from `commitment_bag_charges` (migration #38) by the buyer's commitments
 * page via the user-bound supabase client; RLS scopes the read to the caller.
 *
 * The shape here is a deliberate subset of the table — the buyer view only
 * needs enough to render the summary + per-bag table. Internal columns
 * (`stripe_idempotency_key`, `attempt_count`, `next_attempt_at`,
 * `payment_update_email_sent_at`) are intentionally omitted: they're not
 * surfaced to buyers and dropping them keeps the over-the-wire payload tiny.
 */
export interface BagChargeRow {
  id: string;
  commitment_id: string;
  bag_number: number;
  kg: number;
  amount_cents: number;
  payment_status:
    | "awaiting_charge"
    | "charging"
    | "charged"
    | "retry_scheduled"
    | "payment_failed";
  /**
   * Auto-maintained by the DB trigger. The buyer-side display doesn't render
   * it, but bucket-by-lifecycle's YTD-spend math reads it as the timestamp
   * proxy for "when did this bag's money move" (the charge worker writes the
   * row when it flips `payment_status` to `'charged'`, and updated_at trips
   * with the same write). The legacy commitment-level `charged_at` column
   * stays NULL for bag-aware commits, so there's no cleaner signal.
   */
  updated_at: string;
}

export interface BagBreakdownProps {
  /**
   * The non-cancelled commitments in this group. Used for both
   * (a) iterating the bag-charge rows attached to each commitment, and
   * (b) deriving "kg dropped" by comparing total committed kg against
   *     the sum of all bag-charge kg.
   */
  commitments: Commitment[];
  /**
   * Keyed by commitment_id. Each entry is the buyer's bag-charge rows for
   * that commitment, already ordered or unordered (this component sorts).
   * Missing keys are treated as zero-row commitments (legacy or fully-dropped).
   */
  bagChargesByCommitmentId: Record<string, BagChargeRow[]>;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);

const STATUS_LABELS: Record<BagChargeRow["payment_status"], string> = {
  awaiting_charge: "Awaiting",
  charging: "Charging",
  charged: "Charged ✓",
  retry_scheduled: "Retry queued",
  payment_failed: "Failed",
};

// Status pill colors per task spec:
//   charged                              → matcha
//   awaiting / charging / retry_scheduled → sun
//   payment_failed                        → tomato
const STATUS_TONE: Record<BagChargeRow["payment_status"], string> = {
  charged: "bg-matcha/15 text-matcha border-matcha/40",
  awaiting_charge: "bg-sun/20 text-espresso border-sun/60",
  charging: "bg-sun/20 text-espresso border-sun/60",
  retry_scheduled: "bg-sun/20 text-espresso border-sun/60",
  payment_failed: "bg-tomato/15 text-tomato border-tomato/40",
};

export function BagBreakdown({
  commitments,
  bagChargesByCommitmentId,
}: BagBreakdownProps) {
  // Flatten + sort all bag rows for this group. We sort by bag_number ASC
  // (task req) — a single buyer with multiple commits in the same campaign
  // shouldn't happen often, but if it does we just interleave their rows.
  const liveCommitments = commitments.filter((c) => c.status !== "cancelled");
  const allRows: BagChargeRow[] = liveCommitments.flatMap(
    (c) => bagChargesByCommitmentId[c.id] ?? []
  );
  allRows.sort((a, b) => a.bag_number - b.bag_number);

  // Aggregates (in kg).
  //   purchased       = charged
  //   awaiting        = awaiting_charge | charging | retry_scheduled
  //   failed          = payment_failed (not shipping)
  //   dropped         = committed - (sum of all bag-charge rows)
  //                     i.e. kg that fell in unfilled bags and were never
  //                     charged. This is by design: charge-on-fill model.
  let purchasedKg = 0;
  let awaitingKg = 0;
  let failedKg = 0;
  let allRowKg = 0;
  for (const row of allRows) {
    allRowKg += row.kg;
    if (row.payment_status === "charged") {
      purchasedKg += row.kg;
    } else if (row.payment_status === "payment_failed") {
      failedKg += row.kg;
    } else {
      // awaiting_charge | charging | retry_scheduled
      awaitingKg += row.kg;
    }
  }
  const committedKg = liveCommitments.reduce(
    (s, c) => s + Number(c.quantity_kg || 0),
    0
  );
  const droppedKg = Math.max(0, committedKg - allRowKg);

  // Empty state — no bag-charge rows at all. Could be (a) a legacy lot that
  // settled under the old model, or (b) a campaign that failed minimum and
  // bag charges were never created. Either way: no kg shipping.
  if (allRows.length === 0) {
    return (
      <div className="flex flex-col gap-2" data-testid="bag-breakdown">
        <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso/60">
          Per-bag breakdown
        </div>
        <div
          className="rounded-md border-[2px] border-dashed border-espresso/30 bg-cream/50 px-4 py-5 text-center"
          data-testid="bag-breakdown-empty"
        >
          <div className="font-body text-sm font-bold text-espresso">
            All kg returned.
          </div>
          <div className="mt-1 font-body text-xs text-espresso/65">
            No completed bags — nothing was charged for this commitment.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="bag-breakdown">
      <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso/60">
        Per-bag breakdown
      </div>

      {/* Aggregates strip — matcha for purchased, sun for awaiting, tomato for
          failed, fog for dropped. Only render lines with a non-zero value so
          a clean success case doesn't show four boxes for one number. */}
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        data-testid="bag-breakdown-aggregates"
      >
        <AggregateBox
          label="Purchased"
          kg={purchasedKg}
          tone="matcha"
          testid="agg-purchased"
        />
        {awaitingKg > 0 && (
          <AggregateBox
            label="Awaiting payment"
            kg={awaitingKg}
            tone="sun"
            testid="agg-awaiting"
          />
        )}
        {failedKg > 0 && (
          <AggregateBox
            label="Not shipping"
            kg={failedKg}
            tone="tomato"
            testid="agg-failed"
          />
        )}
        {droppedKg > 0 && (
          <AggregateBox
            label="Returned"
            kg={droppedKg}
            tone="fog"
            testid="agg-dropped"
          />
        )}
      </div>

      <div className="overflow-hidden rounded-md border-[2px] border-espresso bg-chalk">
        <table className="w-full border-collapse font-body text-sm text-espresso">
          <thead className="border-b-2 border-espresso bg-cream/60">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-extrabold uppercase tracking-[0.12em] text-espresso/70">
                Bag
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-extrabold uppercase tracking-[0.12em] text-espresso/70">
                Qty
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-extrabold uppercase tracking-[0.12em] text-espresso/70">
                Charged
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-extrabold uppercase tracking-[0.12em] text-espresso/70">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, idx) => {
              const isLast = idx === allRows.length - 1;
              const tone = STATUS_TONE[row.payment_status];
              return (
                <tr
                  key={row.id}
                  data-testid={`bag-row-${row.bag_number}`}
                  className={!isLast ? "border-b border-espresso/15" : ""}
                >
                  <td className="px-3 py-2.5 align-top font-bold tabular-nums">
                    #{row.bag_number}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    <UnitWeightText kg={row.kg} maximumFractionDigits={1} />
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    {fmtMoney(row.amount_cents / 100)}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top">
                    <span
                      className={`inline-block rounded-pill border-[1.5px] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] ${tone}`}
                      data-testid={`bag-status-${row.bag_number}`}
                    >
                      {STATUS_LABELS[row.payment_status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AggregateBox({
  label,
  kg,
  tone,
  testid,
}: {
  label: string;
  kg: number;
  tone: "matcha" | "sun" | "tomato" | "fog";
  testid: string;
}) {
  const toneClass =
    tone === "matcha"
      ? "border-matcha bg-matcha/10 text-matcha"
      : tone === "sun"
      ? "border-sun bg-sun/15 text-espresso"
      : tone === "tomato"
      ? "border-tomato bg-tomato/10 text-tomato"
      : "border-espresso/30 bg-cream text-espresso/70";
  return (
    <div
      className={`rounded-md border-2 px-3 py-2 ${toneClass}`}
      data-testid={testid}
    >
      <div className="font-body text-[9px] font-extrabold uppercase tracking-[0.12em]">
        {label}
      </div>
      <div className="mt-1 font-headline text-lg font-bold tabular-nums">
        <UnitWeightText kg={kg} maximumFractionDigits={1} />
      </div>
    </div>
  );
}
