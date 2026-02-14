"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

  const qty = Number.parseFloat(quantity) || 0;
  const total = qty * activePrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qty <= 0 || qty > maxKg) {
      toast.error(`Quantity must be between 1 and ${maxKg} kg`);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot_id: lotId,
          quantity_kg: qty,
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
      toast.success("Commitment created. Add your card to finalize setup.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="qty">Quantity (kg)</Label>
        <Input
          id="qty"
          type="number"
          min={1}
          max={maxKg}
          step="0.1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Max {maxKg.toLocaleString()} kg remaining
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
            {qty.toLocaleString()} kg x ${activePrice.toFixed(2)}
          </span>
          <span className="text-lg font-bold text-foreground">
            ${total.toFixed(2)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Final price may be lower if more buyers commit before deadline
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Submitting..." : "Commit to Purchase"}
      </Button>
    </form>
  );
}
