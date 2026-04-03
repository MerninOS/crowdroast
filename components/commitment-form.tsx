"use client";

import React, { useState } from "react";
import { Button } from "@/components/mernin/Button";
import { Input } from "@/components/mernin/Input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useUnitPreference } from "@/components/unit-provider";
import {
  fromDisplayWeight,
  toDisplayPricePerUnit,
  toDisplayWeight,
} from "@/lib/units";
import { addPlatformFee } from "@/lib/pricing";

export function CommitmentForm({
  lotId,
  activePrice,
  maxKg,
  hubId,
}: {
  lotId: string;
  activePrice: number;
  maxKg: number;
  hubId?: string;
}) {
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();
  const { unit } = useUnitPreference();

  const enteredQty = Number.parseFloat(quantity) || 0;
  const qtyKg = fromDisplayWeight(enteredQty, unit);
  const buyerPricePerKg = addPlatformFee(activePrice);
  const total = qtyKg * buyerPricePerKg;
  const maxInSelectedUnit = toDisplayWeight(maxKg, unit);
  const displayPrice = toDisplayPricePerUnit(buyerPricePerKg, unit);

  const validateQuantity = () => {
    if (qtyKg <= 0 || qtyKg > maxKg) {
      toast.error(
        `Quantity must be between 1 and ${maxInSelectedUnit.toLocaleString(undefined, {
          maximumFractionDigits: 1,
        })} ${unit}`
      );
      return false;
    }
    return true;
  };

  const submitCommitment = async () => {
    if (!validateQuantity()) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot_id: lotId,
          quantity_kg: qtyKg,
          notes,
          hub_id: hubId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create commitment");
      }
      const payload = await res.json();
      if (payload?.checkout_url) {
        window.location.href = payload.checkout_url as string;
        return;
      }
      toast.success("Commitment created.");
      setConfirmOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateQuantity()) return;
    setConfirmOpen(true);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="qty">Quantity ({unit})</Label>
        <Input
          id="qty"
          type="number"
          min={1}
          max={maxInSelectedUnit}
          step="0.1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Max{" "}
          {maxInSelectedUnit.toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}{" "}
          {unit} remaining
        </p>
        <p className="text-xs font-medium text-foreground">
          You are entering quantity in {unit.toUpperCase()}.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          rows={2}
          placeholder="Any special requirements..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="rounded-lg bg-muted p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {enteredQty.toLocaleString(undefined, { maximumFractionDigits: 1 })} {unit} x $
            {displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/{unit}
          </span>
          <span className="text-lg font-bold text-foreground">
            ${total.toFixed(2)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          This includes the 10% platform fee. Funds are held until the deadline.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Submitting..." : "Commit to Purchase"}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Commitment</DialogTitle>
            <DialogDescription>
              Your card is charged immediately when you commit. Funds are held until the lot deadline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <p>
              Quantity:{" "}
              <span className="font-medium">
                {enteredQty.toLocaleString(undefined, { maximumFractionDigits: 1 })} {unit}
              </span>
            </p>
            <p>
              Price at commitment:{" "}
              <span className="font-medium">
                ${displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/{unit}
              </span>
            </p>
            <p>
              Charged now: <span className="font-medium">${total.toFixed(2)}</span>
            </p>
            <p className="text-muted-foreground">
              This charge includes the 10% platform fee. If the lot unlocks a lower final tier by deadline, you will be refunded the difference before payouts are distributed.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submitCommitment} disabled={isLoading}>
              {isLoading ? "Processing..." : "Confirm and Charge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
