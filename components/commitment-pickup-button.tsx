"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@merninos/ui";

interface CommitmentPickupButtonProps {
  commitmentId: string;
  alreadyPickedUp: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  label?: string;
}

export function CommitmentPickupButton({
  commitmentId,
  alreadyPickedUp,
  variant = "outline",
  size = "sm",
  label = "Mark Picked Up",
}: CommitmentPickupButtonProps) {
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
    <Button size={size} variant={variant} onClick={handlePickup} disabled={loading}>
      {loading ? "Saving..." : label}
    </Button>
  );
}
