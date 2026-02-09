"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";

export function SampleRequestButton({
  lotId,
  userId,
}: {
  lotId: string;
  userId: string;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleRequest = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lot_id: lotId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to request sample");
      }
      toast.success("Sample requested! The seller will be notified.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="w-full bg-transparent"
      onClick={handleRequest}
      disabled={isLoading}
    >
      <FlaskConical className="mr-2 h-4 w-4" />
      {isLoading ? "Requesting..." : "Request Sample"}
    </Button>
  );
}
