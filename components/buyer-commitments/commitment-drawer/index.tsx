"use client";

import { useEffect, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
} from "@merninos/ui";
import { stageOfGroup, type CommitmentGroup } from "../bucket-by-lifecycle";
import type { PricingTier } from "@/lib/types";
import { RaisingDrawerBody } from "./raising-body";
import { InMotionDrawerBody } from "./in-motion-body";
import { ClosedDrawerBody } from "./closed-body";

export interface CommitmentDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: CommitmentGroup | null;
  tiers: PricingTier[];
}

/**
 * Hook: returns the side the drawer should anchor to.
 * Right above 768px, bottom below.
 */
function useDrawerSide(): "right" | "bottom" {
  const [side, setSide] = useState<"right" | "bottom">("right");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(min-width: 768px)");
    const update = () => setSide(mql.matches ? "right" : "bottom");
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return side;
}

export function CommitmentDrawer({
  open,
  onOpenChange,
  group,
  tiers,
}: CommitmentDrawerProps) {
  const side = useDrawerSide();
  const stage = group ? stageOfGroup(group) : null;
  const dataMode =
    stage === "raising"
      ? "raising"
      : stage === "funds_held" || stage === "in_transit" || stage === "at_hub"
      ? "in-motion"
      : stage === "minimum_not_met"
      ? "min-not-met"
      : stage === "picked_up" || stage === "done"
      ? "closed-value"
      : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side={side} data-mode={dataMode ?? undefined}>
        {group ? (
          <>
            <DrawerHeader>
              <DrawerTitle>{group.lot?.title || "Lot"}</DrawerTitle>
              <DrawerDescription>
                {[group.lot?.region, group.lot?.origin_country]
                  .filter(Boolean)
                  .join(" · ")}
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              {dataMode === "raising" && (
                <div data-testid="drawer-body-raising">
                  <RaisingDrawerBody group={group} tiers={tiers} />
                </div>
              )}
              {dataMode === "in-motion" && (
                <div data-testid="drawer-body-in-motion">
                  <InMotionDrawerBody group={group} />
                </div>
              )}
              {dataMode === "closed-value" && (
                <div data-testid="drawer-body-closed-value">
                  <ClosedDrawerBody group={group} mode="value" tiers={tiers} />
                </div>
              )}
              {dataMode === "min-not-met" && (
                <div data-testid="drawer-body-min-not-met">
                  <ClosedDrawerBody group={group} mode="refund" tiers={tiers} />
                </div>
              )}
            </DrawerBody>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
