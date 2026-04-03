"use client";

import { Button } from "@/components/mernin/Button";
import { Input } from "@/components/mernin/Input";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SampleActionButtons({
  sampleId,
  currentStatus,
}: {
  sampleId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const updateStatus = async (status: string) => {
    if (status === "shipped" && !trackingNumber.trim()) {
      toast.error("Tracking number is required to mark shipped");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          tracking_number: trackingNumber.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success(`Sample ${status}`);
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {currentStatus === "pending" && (
          <>
            <Button size="sm" onClick={() => updateStatus("approved")} disabled={isLoading}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateStatus("rejected")}
              disabled={isLoading}
            >
              Reject
            </Button>
          </>
        )}
        {(currentStatus === "approved" || currentStatus === "shipped") && (
          <Button size="sm" onClick={() => updateStatus("shipped")} disabled={isLoading}>
            Mark Shipped
          </Button>
        )}
      </div>
      <Input
        value={trackingNumber}
        onChange={(e) => setTrackingNumber(e.target.value)}
        placeholder="Tracking number"
        className="h-8 w-40 text-xs"
      />
    </div>
  );
}
