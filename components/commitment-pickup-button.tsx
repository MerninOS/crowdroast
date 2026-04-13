"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/mernin/Button";

export function CommitmentPickupButton({
  commitmentId,
  alreadyPickedUp,
}: {
  commitmentId: string;
  alreadyPickedUp: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (alreadyPickedUp) return null;

  const handlePickup = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/commitments/${commitmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_picked_up" }),
      });
      if (!res.ok) throw new Error("Failed to mark as picked up");
      toast.success("Marked as picked up");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handlePickup} disabled={loading}>
      {loading ? "Saving..." : "Mark Picked Up"}
    </Button>
  );
}
