"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function SampleActionButtons({ sampleId }: { sampleId: string }) {
  const router = useRouter();

  const updateStatus = async (status: string) => {
    try {
      const res = await fetch(`/api/samples/${sampleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success(`Sample ${status}`);
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    }
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => updateStatus("approved")}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => updateStatus("rejected")}
      >
        Reject
      </Button>
    </div>
  );
}
