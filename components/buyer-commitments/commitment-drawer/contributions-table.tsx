import { Fragment } from "react";
import type { Commitment } from "@/lib/types";
import { UnitWeightText } from "@/components/unit-value";
import { commitmentDisplayKg } from "@/lib/commitment-kg";
import { effectiveChargedCents } from "../bucket-by-lifecycle";
import { refundDollarsFor } from "./refund-amount";
import type { BagChargeRow } from "./bag-breakdown";

export interface ContributionsTableProps {
  commitments: Commitment[];
  /**
   * Per-commitment bag-charge rows, keyed by `commitment_id`. Populated
   * server-side at `/dashboard/buyer/commitments` (RLS-scoped to the
   * buyer). Bag-aware commits use these rows as the authoritative
   * "what was actually charged" source so the Total column reflects the
   * sum of `charged` bag amount_cents — for a partial-fill commit that's
   * less than the buyer's pre-settle pledge. Absent for legacy commits;
   * the helper falls back to `commitment.charge_amount_cents`.
   */
  bagChargesByCommitmentId?: Record<string, BagChargeRow[]>;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));

const STATUS_LABELS: Record<string, string> = {
  charge_succeeded: "Paid",
  pending_setup: "Pending setup",
  setup_complete: "Authorized",
  cancelled: "Cancelled",
  refunded: "Refunded",
  // Used by the "dropped" sub-row for a bag-aware partial-fill commit.
  // Frames it as "we never charged for this kg" rather than "you owe it."
  not_charged: "Not charged",
};

const STATUS_TONE: Record<string, string> = {
  charge_succeeded: "bg-matcha/15 text-matcha border-matcha/40",
  pending_setup: "bg-honey/15 text-honey border-honey/40",
  setup_complete: "bg-sky/15 text-espresso border-sky/40",
  cancelled: "bg-fog text-espresso/60 border-fog",
  refunded: "bg-tomato/10 text-tomato border-tomato/30",
  not_charged: "bg-espresso/5 text-espresso/55 border-espresso/20",
};

function statusFor(c: Commitment): string {
  if (c.status === "cancelled") return "cancelled";
  if (c.payment_status === "charge_succeeded") return "charge_succeeded";
  if (c.payment_status === "setup_complete") return "setup_complete";
  return c.payment_status || "pending_setup";
}

export function ContributionsTable({
  commitments,
  bagChargesByCommitmentId,
}: ContributionsTableProps) {
  const rows = commitments.filter((c) => c.payment_status !== "charge_failed");

  if (rows.length === 0) {
    return (
      <div className="rounded-md border-2 border-dashed border-espresso/30 bg-cream/50 px-4 py-3 font-body text-sm text-espresso/65">
        No contributions to show.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border-[2px] border-espresso bg-chalk">
      <table className="w-full border-collapse font-body text-sm text-espresso">
        <thead className="border-b-2 border-espresso bg-cream/60">
          <tr>
            <th className="px-3 py-2 text-left text-[10px] font-extrabold uppercase tracking-[0.12em] text-espresso/70">
              Date
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-extrabold uppercase tracking-[0.12em] text-espresso/70">
              Qty
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-extrabold uppercase tracking-[0.12em] text-espresso/70">
              Total
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-extrabold uppercase tracking-[0.12em] text-espresso/70">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, idx) => {
            const status = statusFor(c);
            // Cancelled commits never had a card charged — show $0.
            // Everything else sums the charged bag rows (bag-aware) and
            // falls back to commitment.charge_amount_cents (legacy) via
            // effectiveChargedCents. Without this fix a partial-fill commit
            // showed the buyer's PRE-SETTLE pledge total even though only
            // the settled bags were charged.
            const isCancelled =
              c.status === "cancelled" || c.payment_status === "cancelled";
            const bags = bagChargesByCommitmentId?.[c.id];
            const total = isCancelled
              ? 0
              : effectiveChargedCents(c, bags) / 100;

            // Bag-aware partial-fill: render a separate "Not charged" sub-
            // row for the kg the buyer pledged that didn't fill a bag, so
            // the math (settled-kg × price = total) reads cleanly and the
            // dropped portion is visible. `kg_locked_at_settlement` is the
            // signal that bag-aware settlement has happened on this commit.
            const lockedKg = c.kg_locked_at_settlement;
            const pledgedKg = Number(c.quantity_kg || 0);
            const droppedKg =
              lockedKg != null
                ? Math.max(0, pledgedKg - Number(lockedKg))
                : 0;
            const hasDroppedRow = droppedKg > 0 && !isCancelled;

            const refundDollars = refundDollarsFor(c);
            const refundedAt = c.refunded_at;
            const hasRefund = refundDollars > 0;

            const isLast = idx === rows.length - 1;
            // Borders cascade: each row in a commit's chain gets a bottom
            // border iff another row follows (either this commit's
            // sub-rows or the next commit). The last sub-row of the last
            // commit stays borderless for a clean table bottom.
            const parentBorder =
              hasDroppedRow || hasRefund || !isLast
                ? "border-b border-espresso/15"
                : "";
            const droppedBorder =
              hasRefund || !isLast ? "border-b border-espresso/15" : "";
            const refundBorder = !isLast ? "border-b border-espresso/15" : "";

            return (
              <Fragment key={c.id}>
                <tr
                  data-testid={`commitment-row-${c.id}`}
                  className={parentBorder}
                >
                  <td className="px-3 py-2.5 align-top">{fmtDate(c.created_at)}</td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    <UnitWeightText
                      kg={commitmentDisplayKg(c)}
                      maximumFractionDigits={1}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    {fmtMoney(total)}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top">
                    <span
                      className={`inline-block rounded-pill border-[1.5px] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] ${
                        STATUS_TONE[status] ?? STATUS_TONE.pending_setup
                      }`}
                    >
                      {STATUS_LABELS[status] ?? status}
                    </span>
                  </td>
                </tr>
                {hasDroppedRow && (
                  <tr
                    data-testid={`commitment-dropped-${c.id}`}
                    className={droppedBorder}
                  >
                    <td className="px-3 py-2 align-top text-[11px] italic text-espresso/55">
                      Didn&apos;t fill a bag
                    </td>
                    <td className="px-3 py-2 text-right align-top tabular-nums text-espresso/65">
                      <UnitWeightText
                        kg={droppedKg}
                        maximumFractionDigits={1}
                      />
                    </td>
                    <td className="px-3 py-2 text-right align-top tabular-nums text-espresso/65">
                      {fmtMoney(0)}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <span
                        className={`inline-block rounded-pill border-[1.5px] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] ${STATUS_TONE.not_charged}`}
                      >
                        {STATUS_LABELS.not_charged}
                      </span>
                    </td>
                  </tr>
                )}
                {hasRefund && (
                  <tr
                    data-testid={`commitment-refund-${c.id}`}
                    className={refundBorder}
                  >
                    <td
                      colSpan={4}
                      className="bg-tomato/5 px-3 py-2 text-left font-body text-xs italic text-tomato"
                    >
                      Refunded {fmtMoney(refundDollars)}
                      {refundedAt ? ` on ${fmtDate(refundedAt)}` : ""}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
