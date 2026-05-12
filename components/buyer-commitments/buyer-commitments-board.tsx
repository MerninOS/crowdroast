"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { RaisingLotCard } from "@/components/buyer-commitments/raising-lot-card";
import { InMotionLotCard } from "@/components/buyer-commitments/in-motion-lot-card";
import { ClosedLotsTable } from "@/components/buyer-commitments/closed-lots-table";
import { CommitmentDrawer } from "@/components/buyer-commitments/commitment-drawer";
import { UnitWeightText } from "@/components/unit-value";
import type { BucketedGroups, CommitmentGroup } from "@/components/buyer-commitments/bucket-by-lifecycle";
import type { PricingTier } from "@/lib/types";

export interface BuyerCommitmentsBoardProps {
  buckets: BucketedGroups;
  tiersByLotId: Record<string, Pick<PricingTier, "min_quantity_kg" | "price_per_kg">[]>;
  landingKg: number;
  ytdSpend: number;
  /**
   * Controlled-mode props (optional). When both are provided, the parent owns
   * drawer state. When omitted, the board manages its own internal state.
   * Tests use the controlled form to synthetically open the drawer before
   * Stage 4 wires the chevrons.
   */
  openGroupKey?: string | null;
  onOpenGroupKeyChange?: (key: string | null) => void;
}

const sectionAccent = {
  tomato: "bg-tomato",
  sky:    "bg-sky",
  fog:    "bg-fog",
} as const;
type SectionAccent = keyof typeof sectionAccent;

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);

export function BuyerCommitmentsBoard({
  buckets,
  tiersByLotId,
  landingKg,
  ytdSpend,
  openGroupKey: controlledKey,
  onOpenGroupKeyChange,
}: BuyerCommitmentsBoardProps) {
  const [internalKey, setInternalKey] = useState<string | null>(null);
  const isControlled = controlledKey !== undefined;
  const openGroupKey = isControlled ? controlledKey : internalKey;
  const setOpenGroupKey = (key: string | null) => {
    if (isControlled) {
      onOpenGroupKeyChange?.(key);
    } else {
      setInternalKey(key);
    }
  };

  // Map of groupKey → ref of the originating trigger element. Stage 4 will
  // write into this map from each card's chevron via an `onSelect`-and-`triggerRef`
  // pattern. For now it's wired so that closing the drawer can restore focus.
  const triggerRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        const key = openGroupKey;
        setOpenGroupKey(null);
        // Restore focus on the next tick so the trigger is in the DOM
        // when we call focus() on it.
        if (key) {
          const el = triggerRefs.current.get(key);
          if (el && typeof el.focus === "function") {
            queueMicrotask(() => el.focus());
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openGroupKey, isControlled]
  );

  const findGroup = (key: string | null): CommitmentGroup | null => {
    if (!key) return null;
    for (const list of [buckets.raising, buckets.inMotion, buckets.closed]) {
      const found = list.find((g) => g.groupKey === key);
      if (found) return found;
    }
    return null;
  };

  const openGroup = findGroup(openGroupKey);
  const openTiers = openGroup
    ? (tiersByLotId[openGroup.lotId] || []).map((t) => ({
        id: `${openGroup.lotId}-${t.min_quantity_kg}`,
        lot_id: openGroup.lotId,
        min_quantity_kg: t.min_quantity_kg,
        min_bags: null,
        price_per_kg: t.price_per_kg,
        created_at: "",
      }))
    : [];

  return (
    <>
      {buckets.raising.length > 0 && (
        <section className="mb-9" data-testid="section-raising">
          <SectionHead title="Still Raising" count={buckets.raising.length} accent="tomato" />
          <div className="mt-4 flex flex-col gap-4">
            {buckets.raising.map((g) => (
              <RaisingLotCard
                key={g.groupKey}
                group={g}
                pricingTiers={tiersByLotId[g.lotId] || []}
                onSelect={() => setOpenGroupKey(g.groupKey)}
                triggerRef={(el) => {
                  if (el) triggerRefs.current.set(g.groupKey, el);
                  else triggerRefs.current.delete(g.groupKey);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {buckets.inMotion.length > 0 && (
        <section className="mb-9" data-testid="section-in-motion">
          <SectionHead
            title="In Motion"
            count={buckets.inMotion.length}
            accent="sky"
            note={
              <>
                <UnitWeightText kg={landingKg} maximumFractionDigits={0} /> landing soon
              </>
            }
          />
          <div className="mt-4 flex flex-col gap-3.5">
            {buckets.inMotion.map((g) => (
              <InMotionLotCard
                key={g.groupKey}
                group={g}
                onSelect={() => setOpenGroupKey(g.groupKey)}
                triggerRef={(el) => {
                  if (el) triggerRefs.current.set(g.groupKey, el);
                  else triggerRefs.current.delete(g.groupKey);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {buckets.closed.length > 0 && (
        <section data-testid="section-closed">
          <SectionHead
            title="Closed Lots"
            count={buckets.closed.length}
            accent="fog"
            note={`${fmtMoney(ytdSpend)} YTD`}
          />
          <div className="mt-4">
            <ClosedLotsTable
              groups={buckets.closed}
              onSelect={(key) => setOpenGroupKey(key)}
              registerTriggerRef={(key, el) => {
                if (el) triggerRefs.current.set(key, el);
                else triggerRefs.current.delete(key);
              }}
            />
          </div>
        </section>
      )}

      <CommitmentDrawer
        open={!!openGroupKey}
        onOpenChange={handleOpenChange}
        group={openGroup}
        tiers={openTiers}
      />
    </>
  );
}

function SectionHead({
  title,
  count,
  accent,
  note,
}: {
  title: string;
  count: number;
  accent: SectionAccent;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b-2 border-espresso/80 pb-2">
      <span
        className={`mb-px inline-block h-2.5 w-2.5 self-center rounded-full border-2 border-espresso ${sectionAccent[accent]}`}
        aria-hidden
      />
      <h2 className="m-0 font-headline text-[18px] font-bold leading-none text-espresso">{title}</h2>
      <span className="font-headline text-[14px] font-bold leading-none text-espresso/45">
        {count}
      </span>
      {note && (
        <span className="ml-auto font-headline text-[11px] font-bold lowercase text-espresso/55">
          {note}
        </span>
      )}
    </div>
  );
}
