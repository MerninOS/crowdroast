"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/mernin/Button";
import { Input } from "@/components/mernin/Input";

interface SellerShipmentFormProps {
  shipmentId: string;
  hubAddress: string | null;
}

export function SellerShipmentForm({ shipmentId, hubAddress }: SellerShipmentFormProps) {
  const router = useRouter();
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [isLocalPickup, setIsLocalPickup] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLocalPickup && !carrier.trim()) {
      toast.error("Carrier is required unless marking as local pickup");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "in_transit",
          carrier: isLocalPickup ? null : carrier.trim(),
          tracking_number: trackingNumber.trim() || null,
          is_local_pickup: isLocalPickup,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update shipment");
      }
      toast.success("Shipment marked as shipped. Hub owner and buyers have been notified.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleLocalPickup = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "in_transit",
          carrier: null,
          tracking_number: null,
          is_local_pickup: true,
        }),
      });
      if (!res.ok) throw new Error("Failed to update shipment");
      toast.success("Marked as picked up. Hub owner and buyers have been notified.");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {hubAddress && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Shipping to:</span> {hubAddress}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`local-pickup-${shipmentId}`}
            checked={isLocalPickup}
            onChange={(e) => setIsLocalPickup(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label
            htmlFor={`local-pickup-${shipmentId}`}
            className="text-xs text-muted-foreground"
          >
            Local pickup / no carrier
          </label>
        </div>

        {!isLocalPickup && (
          <div className="flex gap-2">
            <Input
              placeholder="Carrier (e.g. FedEx)"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="flex-1 text-sm"
              disabled={loading}
            />
            <Input
              placeholder="Tracking number (optional)"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className="flex-1 text-sm"
              disabled={loading}
            />
          </div>
        )}

        <div className="flex gap-2">
          {isLocalPickup ? (
            <Button
              type="button"
              size="sm"
              onClick={handleLocalPickup}
              disabled={loading}
            >
              {loading ? "Saving..." : "Mark as Picked Up"}
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Saving..." : "Mark as Shipped"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
