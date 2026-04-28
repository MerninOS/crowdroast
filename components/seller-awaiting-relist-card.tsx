"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@merninos/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil } from "lucide-react";

export type RelistOutcome = "settled" | "failed" | "cancelled" | "expired";

export interface SellerAwaitingRelistCardProps {
  lotId: string;
  lotTitle: string;
  expiryDate: string | null;
  outcome: RelistOutcome;
  /** Most-recent terminal campaign summary. Null if the lot reached awaiting_relist via expiry without any campaign. */
  campaign: {
    hubName: string | null;
    deadline: string | null;
    committedKg: number;
    buyerCount: number;
  } | null;
}

const outcomeCopy: Record<
  RelistOutcome,
  { label: string; description: string; bannerClass: string }
> = {
  settled: {
    label: "Settled",
    description: "The campaign hit its goal and payouts are complete. Decide if you have more inventory to sell.",
    bannerClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  failed: {
    label: "Did not meet minimum",
    description: "The campaign closed before reaching the minimum commitment. Buyers were refunded.",
    bannerClass: "bg-rose-50 text-rose-800 border-rose-200",
  },
  cancelled: {
    label: "Cancelled by hub",
    description: "The hub owner cancelled the campaign before the deadline. No charges were made.",
    bannerClass: "bg-zinc-50 text-zinc-700 border-zinc-200",
  },
  expired: {
    label: "Expired without a campaign",
    description: "Your lot's expiry date passed before any hub claimed it. Adjust the lot or shelve it.",
    bannerClass: "bg-zinc-50 text-zinc-700 border-zinc-200",
  },
};

export function SellerAwaitingRelistCard({
  lotId,
  lotTitle,
  expiryDate,
  outcome,
  campaign,
}: SellerAwaitingRelistCardProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"relist" | "shelve" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<"relist" | "shelve" | null>(null);

  const expiryPassed = !!(expiryDate && new Date(expiryDate) <= new Date());
  const copy = outcomeCopy[outcome];

  const submit = async (next: "relist" | "shelve") => {
    setPendingAction(next);
    try {
      const res = await fetch(`/api/lots/${lotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next === "relist" ? "active" : "draft" }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Something went sideways");
      toast.success(
        next === "relist" ? "Lot is back on the marketplace." : "Lot saved as draft."
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went sideways");
    } finally {
      setPendingAction(null);
      setConfirmOpen(null);
    }
  };

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className={`rounded-t-lg border-b px-4 py-2 text-xs font-medium ${copy.bannerClass}`}>
        {copy.label}
      </div>
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/dashboard/seller/lots/${lotId}/edit`}
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              {lotTitle}
            </Link>
            <p className="text-xs text-muted-foreground mt-1">{copy.description}</p>
          </div>
        </div>

        {campaign && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {campaign.hubName && (
              <>
                <dt className="text-muted-foreground">Hub</dt>
                <dd className="font-medium text-foreground text-right">{campaign.hubName}</dd>
              </>
            )}
            {campaign.deadline && (
              <>
                <dt className="text-muted-foreground">Deadline</dt>
                <dd className="font-medium text-foreground text-right">
                  {new Date(campaign.deadline).toLocaleDateString()}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Committed</dt>
            <dd className="font-medium text-foreground text-right">
              {campaign.committedKg.toFixed(1)} kg
            </dd>
            <dt className="text-muted-foreground">Buyers</dt>
            <dd className="font-medium text-foreground text-right">{campaign.buyerCount}</dd>
          </dl>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="bg-transparent">
            <Link href={`/dashboard/seller/lots/${lotId}/edit`}>
              <Pencil className="mr-1 h-3 w-3" />
              Edit
            </Link>
          </Button>
          <Button
            size="sm"
            disabled={expiryPassed || pendingAction !== null}
            onClick={() => setConfirmOpen("relist")}
          >
            {pendingAction === "relist" ? "Relisting..." : "Relist"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-transparent"
            disabled={pendingAction !== null}
            onClick={() => setConfirmOpen("shelve")}
          >
            {pendingAction === "shelve" ? "Shelving..." : "Shelve"}
          </Button>
        </div>

        {expiryPassed && (
          <p className="text-xs text-amber-700">
            Update the expiry date before relisting.
          </p>
        )}
      </div>

      <AlertDialog open={confirmOpen !== null} onOpenChange={(open) => !open && setConfirmOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmOpen === "relist" ? `Relist "${lotTitle}"?` : `Shelve "${lotTitle}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmOpen === "relist"
                ? "Hub owners will be able to add this lot to their catalogs again."
                : "The lot will be saved as a draft, hidden from hub owners and buyers."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingAction !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmOpen && submit(confirmOpen)}
              disabled={pendingAction !== null}
            >
              {confirmOpen === "relist" ? "Relist" : "Shelve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
