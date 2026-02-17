"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function SampleRequestButton({
  lotId,
  hubId,
  hasRequested,
  defaultDeliveryDetails,
}: {
  lotId: string;
  hubId?: string;
  hasRequested?: boolean;
  defaultDeliveryDetails?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [address, setAddress] = useState(defaultDeliveryDetails?.address || "");
  const [city, setCity] = useState(defaultDeliveryDetails?.city || "");
  const [state, setState] = useState(defaultDeliveryDetails?.state || "");
  const [country, setCountry] = useState(defaultDeliveryDetails?.country || "");
  const [notes, setNotes] = useState("");

  const handleRequest = async () => {
    if (!hubId) {
      toast.error("Select a hub before requesting a sample");
      return;
    }
    if (!address.trim() || !city.trim() || !state.trim() || !country.trim()) {
      toast.error("Delivery details are required");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot_id: lotId,
          hub_id: hubId,
          shipping_address: [address, city, state, country]
            .map((value) => value.trim())
            .join(", "),
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to request sample");
      }
      toast.success("Sample requested");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="w-full bg-transparent"
        onClick={() => setOpen(true)}
        disabled={isLoading || hasRequested}
      >
        <FlaskConical className="mr-2 h-4 w-4" />
        {hasRequested ? "Sample Requested" : isLoading ? "Requesting..." : "Request Sample"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Delivery Details</DialogTitle>
            <DialogDescription>
              Confirm where this sample should be delivered before submitting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">Street Address</p>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Roast Ave"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">City</p>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Portland"
                />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">State / Region</p>
                <Input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="Oregon"
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">Country</p>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="United States"
              />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">Notes (optional)</p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Preferred carrier, receiving hours, etc."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleRequest} disabled={isLoading}>
              {isLoading ? "Submitting..." : "Confirm Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
