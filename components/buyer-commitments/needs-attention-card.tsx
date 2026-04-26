import Link from "next/link";
import { Button } from "@merninos/ui";
import { UnitWeightText } from "@/components/unit-value";
import type { CommitmentGroup } from "./bucket-by-lifecycle";

export interface NeedsAttentionCardProps {
  group: CommitmentGroup;
}

/**
 * Surfaces a commitment whose payment has failed (`payment_status = 'charge_failed'`).
 * Excluded from cycle math; the user's only action is to fix payment.
 */
export function NeedsAttentionCard({ group }: NeedsAttentionCardProps) {
  const failed = group.commitments.filter((c) => c.payment_status === "charge_failed");
  const failedKg = failed.reduce((s, c) => s + Number(c.quantity_kg || 0), 0);
  const reason = failed.find((c) => c.payment_error)?.payment_error || "Charge failed — retrying";

  return (
    <div
      className="flex flex-col gap-3 rounded-[14px] border-[3px] border-tomato bg-cream px-5 py-4 shadow-flat-sm sm:flex-row sm:items-center sm:gap-4"
      role="alert"
    >
      <div className="flex items-start gap-3 sm:contents">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[2.5px] border-espresso bg-tomato font-headline text-lg font-extrabold text-cream">
          !
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-headline text-[10px] font-extrabold uppercase tracking-[0.18em] text-tomato">
            Charge issue
          </div>
          <div className="mt-0.5 font-headline text-[18px] font-bold leading-tight text-espresso">
            {group.lot?.title || "Unknown lot"}
          </div>
          <div className="mt-1 font-headline text-[12px] text-espresso/70">
            <UnitWeightText kg={failedKg} maximumFractionDigits={0} /> · {reason}
          </div>
        </div>
      </div>
      <Button asChild size="sm" variant="default" className="self-stretch sm:self-auto">
        <Link
          href={`/dashboard/buyer/lot/${group.lotId}${group.hubId ? `?hub=${group.hubId}` : ""}`}
        >
          Update payment →
        </Link>
      </Button>
    </div>
  );
}
