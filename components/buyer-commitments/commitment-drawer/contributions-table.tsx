import { Fragment } from "react";
import type { Commitment } from "@/lib/types";
import { UnitWeightText } from "@/components/unit-value";

export interface ContributionsTableProps {
  commitments: Commitment[];
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
};

const STATUS_TONE: Record<string, string> = {
  charge_succeeded: "bg-matcha/15 text-matcha border-matcha/40",
  pending_setup: "bg-honey/15 text-honey border-honey/40",
  setup_complete: "bg-sky/15 text-espresso border-sky/40",
  cancelled: "bg-fog text-espresso/60 border-fog",
  refunded: "bg-tomato/10 text-tomato border-tomato/30",
};

function statusFor(c: Commitment): string {
  if (c.status === "cancelled") return "cancelled";
  if (c.payment_status === "charge_succeeded") return "charge_succeeded";
  if (c.payment_status === "setup_complete") return "setup_complete";
  return c.payment_status || "pending_setup";
}

export function ContributionsTable({ commitments }: ContributionsTableProps) {
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
            const total =
              c.charge_amount_cents != null
                ? c.charge_amount_cents / 100
                : Number(c.total_price || 0);
            const refundCents = c.refunded_amount_cents ?? 0;
            const refundedAt = c.refunded_at;
            const hasRefund = refundCents > 0;
            const isLast = idx === rows.length - 1;
            const parentBorder = hasRefund || !isLast ? "border-b border-espresso/15" : "";
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
                      kg={Number(c.quantity_kg || 0)}
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
                {hasRefund && (
                  <tr
                    data-testid={`commitment-refund-${c.id}`}
                    className={refundBorder}
                  >
                    <td
                      colSpan={4}
                      className="bg-tomato/5 px-3 py-2 text-left font-body text-xs italic text-tomato"
                    >
                      Refunded {fmtMoney(refundCents / 100)}
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
