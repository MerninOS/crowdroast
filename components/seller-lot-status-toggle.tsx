"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SellerLotStatusToggle({
  lotId,
  currentStatus,
  hasContributors,
}: {
  lotId: string;
  currentStatus: "active" | "draft";
  hasContributors: boolean;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  if (hasContributors) {
    return null;
  }

  const nextStatus = currentStatus === "active" ? "draft" : "active";

  const handleToggle = async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/lots/${lotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update lot status.");
      }

      toast.success(
        nextStatus === "draft"
          ? "Lot marked inactive. You can keep editing it."
          : "Lot marked active."
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update lot status."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="bg-transparent"
      onClick={handleToggle}
      disabled={isLoading}
    >
      {isLoading
        ? "Saving..."
        : currentStatus === "active"
          ? "Set Inactive"
          : "Set Active"}
    </Button>
  );
}
