"use client";

import { Button } from "@/components/mernin/Button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";

const nextStatus: Record<string, { label: string; status: string }> = {
  pending: { label: "Mark Shipped", status: "in_transit" },
  in_transit: { label: "Mark Received", status: "at_hub" },
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

  // at_hub: hub owner manages per-commitment pickup on the detail page
  if (currentStatus === "at_hub") {
    return (
      <Button size="sm" variant="outline" asChild>
        <Link href={`/dashboard/hub/shipments/${shipmentId}`}>Manage Pickups</Link>
      </Button>
    );
  }

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
