"use client";

import { Button } from "@/components/mernin/Button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const nextStatus: Record<string, { label: string; status: string }> = {
  in_transit: { label: "Mark Received", status: "at_hub" },
  at_hub: { label: "Out for Delivery", status: "out_for_delivery" },
  out_for_delivery: { label: "Mark Delivered", status: "delivered" },
};

export function ShipmentStatusButtons({
  shipmentId,
  currentStatus,
}: {
  shipmentId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const next = nextStatus[currentStatus];

  if (!next) return <span className="text-xs text-muted-foreground">-</span>;

  const handleUpdate = async () => {
    try {
      const res = await fetch(`/api/shipments/${shipmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next.status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Shipment updated");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    }
  };

  return (
    <Button size="sm" onClick={handleUpdate}>
      {next.label}
    </Button>
  );
}
