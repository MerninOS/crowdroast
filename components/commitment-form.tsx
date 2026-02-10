"use client";

import React from "react"

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function CommitmentForm({
  lotId,
  pricePerKg,
  minKg,
  maxKg,
  hubId,
}: {
  lotId: string;
  pricePerKg: number;
  minKg: number;
  maxKg: number;
  hubId?: string;
}) {
  const [quantity, setQuantity] = useState(minKg.toString());
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const qty = Number.parseFloat(quantity) || 0;
  const total = qty * pricePerKg;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qty < minKg || qty > maxKg) {
      toast.error(`Quantity must be between ${minKg} and ${maxKg} kg`);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lot_id: lotId, quantity_kg: qty, notes, hub_id: hubId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create commitment");
      }
      toast.success("Commitment created successfully!");
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
          min={minKg}
          max={maxKg}
          step="0.1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Min {minKg} kg / Max {maxKg.toLocaleString()} kg
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
          <span className="text-muted-foreground">Estimated Total</span>
          <span className="text-lg font-bold text-foreground">
            ${total.toFixed(2)}
          </span>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Submitting..." : "Commit to Purchase"}
      </Button>
    </form>
  );
}
